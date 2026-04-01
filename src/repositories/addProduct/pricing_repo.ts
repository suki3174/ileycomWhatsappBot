import { pluginPostWithRetry, PLUGIN_TIMEOUT_MS } from "@/utils/plugin_client";
import { asRecord, parsePluginJsonSafe, normText } from "@/utils/data_parser";
import { convertTndToEur } from "@/utils/core_utils";
import {
  getAddProductPriceConversionCache,
  writeAddProductPriceConversionCache,
} from "@/services/cache/add_product_cache_service";

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

  const cached = await getAddProductPriceConversionCache(safeRegular, safePromo);
  if (cached) {
    return cached;
  }

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

    const result = {
      regularEur: toFiniteNumber(data.regular_eur),
      promoEur: toFiniteNumber(data.promo_eur),
    };
    await writeAddProductPriceConversionCache(safeRegular, safePromo, result);
    return result;
  } catch (err) {
    console.error("plugin pricing/convert exception", normText((err as Error | undefined)?.message));
    return fallbackConvert(safeRegular, safePromo);
  }
}