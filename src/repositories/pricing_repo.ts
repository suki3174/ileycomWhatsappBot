import { pluginPostWithRetry, PLUGIN_TIMEOUT_MS } from "@/utils/plugin_client";
import { asRecord, parsePluginJsonSafe, normText } from "@/utils/repository_utils";
import { convertTndToEur } from "@/utils/utilities";

export interface PricingConversionResult {
  regularEur: number;
  promoEur: number;
}

function toFiniteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function fallbackConvert(regularTnd: number, promoTnd: number): PricingConversionResult {
  return {
    regularEur: regularTnd > 0 ? convertTndToEur(regularTnd) : 0,
    promoEur: promoTnd > 0 ? convertTndToEur(promoTnd) : 0,
  };
}

export async function convertTndPricesViaPlugin(
  regularTnd: number,
  promoTnd: number,
): Promise<PricingConversionResult> {
  const safeRegular = toFiniteNumber(regularTnd);
  const safePromo = toFiniteNumber(promoTnd);

  try {
    const res = await pluginPostWithRetry(
      "/seller/pricing/convert",
      { regular_tnd: safeRegular, promo_tnd: safePromo },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 10_000), retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      return fallbackConvert(safeRegular, safePromo);
    }

    const payload = await parsePluginJsonSafe(res, "plugin pricing/convert");
    const data = asRecord(payload?.data);
    if (!data) {
      return fallbackConvert(safeRegular, safePromo);
    }

    return {
      regularEur: toFiniteNumber(data.regular_eur),
      promoEur: toFiniteNumber(data.promo_eur),
    };
  } catch (err) {
    console.error("plugin pricing/convert exception", normText((err as Error | undefined)?.message));
    return fallbackConvert(safeRegular, safePromo);
  }
}