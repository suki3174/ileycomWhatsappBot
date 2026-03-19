import { normToken } from "@/utils/utilities";
import type { AddProductState } from "@/models/product_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import crypto from "crypto";
import {
  parsePluginJsonSafe,
  readResponseBodySafe,
  asRecord,
  normText,
} from "@/utils/repository_utils";

interface StoredProduct {
  id: string;
  flowToken: string;
  state: AddProductState & { quantity: number };
  createdAt: number;
  confirmed: boolean;
}

export interface CreateProductResult {
  ok: boolean;
  productId?: string;
  errorCode?: string;
  errorMessage?: string;
  fieldErrors?: Array<{ field: string; code: string; message: string }>;
}

const ADD_PRODUCT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 20_000);

function buildCreatePayload(
  flowToken: string,
  state: AddProductState,
  quantity: number,
  sellerAbbr?: string,
): Record<string, unknown> {
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      flowToken,
      product_name: normText(state.product_name),
      product_category: normText(state.product_category),
      product_subcategory: normText(state.product_subcategory),
      prix_regulier_tnd: state.prix_regulier_tnd ?? 0,
      prix_promo_tnd: state.prix_promo_tnd ?? 0,
      prix_regulier_eur: state.prix_regulier_eur ?? 0,
      prix_promo_eur: state.prix_promo_eur ?? 0,
      quantity,
      image_count: Array.isArray(state.images) ? state.images.length : 0,
    }))
    .digest("hex");

  return {
    flow_token: flowToken,
    idempotency_key: idempotencyKey,
    product: {
      name: normText(state.product_name),
      category_id: normText(state.product_category),
      subcategory_id: normText(state.product_subcategory),
      category_label: normText(state.product_category_label),
      subcategory_label: normText(state.product_subcategory_label),
      images_base64: Array.isArray(state.images) ? state.images : [],
      pricing: {
        regular_tnd: state.prix_regulier_tnd ?? 0,
        promo_tnd: state.prix_promo_tnd ?? 0,
        regular_eur: state.prix_regulier_eur ?? 0,
        promo_eur: state.prix_promo_eur ?? 0,
      },
      dimensions: {
        longueur: state.longueur ?? 0,
        largeur: state.largeur ?? 0,
        profondeur: state.profondeur ?? 0,
        unit: normText(state.unite_dimension),
      },
      weight: {
        value: state.valeur_poids ?? 0,
        unit: normText(state.unite_poids),
      },
      attributes: {
        couleur: normText(state.couleur),
        taille: normText(state.taille),
      },
      quantity,
      short_description: "",
      description: "",
      status: "draft",
      auto_generate_sku: true,
      sku_prefix: sellerAbbr ? normText(sellerAbbr).toUpperCase() : "GEN",
    },
  };
}

function extractProductId(payload: Record<string, unknown> | undefined): string {
  const success = payload?.success;
  if (success === false) {
    const error = asRecord(payload?.error);
    const code = normText(error?.code) || "plugin_error";
    const message = normText(error?.message) || "Plugin returned unsuccessful response";
    throw new Error(`${code}: ${message}`);
  }

  const data = asRecord(payload?.data);
  const productId = normText(data?.product_id);
  return productId;
}

export async function saveProductDraft(
  flowToken: string,
  state: AddProductState,
  quantity: number,
  sellerAbbr?: string,
): Promise<CreateProductResult> {
  const token = normToken(flowToken);
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

  const res = await pluginPostWithRetry(
    "/seller/product/create/by-flow-token",
    buildCreatePayload(token, state, qty, sellerAbbr),
    { timeoutMs: ADD_PRODUCT_TIMEOUT_MS, retries: 1, retryDelayMs: 300 },
  );

  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("plugin product/create/by-flow-token failed", {
      status: res.status,
      statusText: res.statusText,
      body,
    });

    let code = "plugin_create_failed";
    let message = "Plugin create product failed";
    let fieldErrors: Array<{ field: string; code: string; message: string }> = [];

    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const err = asRecord(parsed?.error);
      code = normText(err?.code) || code;
      message = normText(err?.message) || message;

      const details = asRecord(err?.details);
      const rawFields = Array.isArray(details?.fields) ? details?.fields : [];
      fieldErrors = rawFields
        .map((f) => asRecord(f))
        .filter((f): f is Record<string, unknown> => !!f)
        .map((f) => ({
          field: normText(f.field),
          code: normText(f.code),
          message: normText(f.message),
        }))
        .filter((f) => !!f.field || !!f.message);
    } catch {
      // no-op: keep defaults when body is not parseable JSON
    }

    return {
      ok: false,
      errorCode: code,
      errorMessage: message,
      fieldErrors,
    };
  }

  const payload = await parsePluginJsonSafe(res, "plugin product/create/by-flow-token");
  try {
    const productId = extractProductId(payload);
    if (!productId) {
      return {
        ok: false,
        errorCode: "missing_product_id",
        errorMessage: "Plugin create product response missing product_id",
      };
    }

    return { ok: true, productId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "plugin create product failed";
    return {
      ok: false,
      errorCode: "plugin_payload_error",
      errorMessage: msg,
    };
  }
}

export async function markProductConfirmed(
  _productId: string,
): Promise<void> {
  // Product is immediately created in plugin; no local confirmation persistence.
}

export async function getStoredProduct(
  _productId: string,
): Promise<StoredProduct | undefined> {
  return undefined;
}

