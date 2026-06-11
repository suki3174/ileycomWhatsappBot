import { normToken } from "@/utils/core_utils";
import type { UpdateProductState, UpdateProductResult } from "@/models/product_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry, pluginPost } from "@/utils/plugin_client";
import crypto from "crypto";
import {
  parsePluginJsonSafe,
  readResponseBodySafe,
  asRecord,
  normText,
  toNum,
  toBool,
} from "@/utils/data_parser";

const UPDATE_PRODUCT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 20_000);

/**
 * Builds the plugin update-product payload from flow state.
 * Includes only changed fields (delta) to minimize payload.
 * Uses deterministic idempotency key based on product_id + changed_fields hash.
 */
function buildUpdatePayload(
  productId: string,
  state: UpdateProductState,
  changedFields?: Set<string>,
): Record<string, unknown> {
  const fieldsToInclude = changedFields || new Set(Object.keys(state || {}));
  
  // Build idempotency key from product_id + sorted changed fields
  const sortedFields = Array.from(fieldsToInclude).sort().join(",");
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      product_id: productId,
      changed_fields: sortedFields,
      timestamp: Math.floor(Date.now() / 60000), // Minute-level granularity for retry safety
    }))
    .digest("hex");

  const updates: Record<string, unknown> = {
    idempotency_key: idempotencyKey,
  };

  // Only include changed fields in the update payload
  if (fieldsToInclude.has("images") && state.images) {
    updates.images = state.images;
  }
  if (fieldsToInclude.has("product_name") && state.product_name) {
    updates.name = normText(state.product_name);
  }
  if (fieldsToInclude.has("product_category") && state.product_category) {
    updates.category_id = normText(state.product_category);
  }
  if (fieldsToInclude.has("product_category_label") && state.product_category_label) {
    updates.category_label = normText(state.product_category_label);
  }
  if (fieldsToInclude.has("product_subcategory") && state.product_subcategory) {
    updates.subcategory_id = normText(state.product_subcategory);
  }
  if (fieldsToInclude.has("product_subcategory_label") && state.product_subcategory_label) {
    updates.subcategory_label = normText(state.product_subcategory_label);
  }

  // Pricing updates (flat keys expected by plugin writer)
  if (fieldsToInclude.has("prix_regulier_tnd")) updates.regular_tnd = state.prix_regulier_tnd ?? undefined;
  if (fieldsToInclude.has("prix_promo_tnd")) updates.sale_tnd = state.prix_promo_tnd ?? undefined;
  if (fieldsToInclude.has("prix_regulier_eur")) updates.regular_eur = state.prix_regulier_eur ?? undefined;
  if (fieldsToInclude.has("prix_promo_eur")) updates.sale_eur = state.prix_promo_eur ?? undefined;

  // Dimensions (flat keys)
  if (fieldsToInclude.has("longueur")) updates.length = state.longueur ?? undefined;
  if (fieldsToInclude.has("largeur")) updates.width = state.largeur ?? undefined;
  if (fieldsToInclude.has("profondeur")) updates.height = state.profondeur ?? undefined;
  if (fieldsToInclude.has("unite_dimension")) updates.dim_unit = normText(state.unite_dimension);

  // Weight (flat keys)
  if (fieldsToInclude.has("valeur_poids")) updates.weight = state.valeur_poids ?? undefined;
  if (fieldsToInclude.has("unite_poids")) updates.weight_unit = normText(state.unite_poids);

  // Attributes (flat keys)
  if (fieldsToInclude.has("couleur")) updates.color = normText(state.couleur);
  if (fieldsToInclude.has("taille")) updates.size = normText(state.taille);

  // Stock quantity (flat key)
  if (fieldsToInclude.has("quantite") && state.quantite) {
    const qty = Number(state.quantite);
    if (Number.isFinite(qty)) {
      updates.stock = qty;
    }
  }

  return updates;
}

/**
 * Extracts product_id from a successful plugin response.
 * Throws a typed error message when plugin returns explicit failure fields.
 */
function extractProductIdFromUpdate(payload: Record<string, unknown> | undefined): string {
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

/**
 * Updates a product in the plugin using flow token and state snapshot.
 * Only sends changed fields to minimize payload and bandwidth.
 * Maps plugin failures to structured error fields for flow-level reporting.
 */
export async function saveProductUpdate(
  flowToken: string,
  state: UpdateProductState,
  changedFields?: Set<string>,
): Promise<UpdateProductResult> {
  const token = normToken(flowToken);
  if (!token) {
    return {
      ok: false,
      errorCode: "invalid_token",
      errorMessage: "Flow token is required for product update",
    };
  }

  if (!state.product_id) {
    return {
      ok: false,
      errorCode: "missing_product_id",
      errorMessage: "Product ID is required for update",
    };
  }

  const updateData = buildUpdatePayload(state.product_id, state, changedFields);
  const requestPayload = {
    flow_token: token,
    product_id: state.product_id,
    data: updateData,
  };

  console.log("update product payload keys", {
    has_flow_token: !!requestPayload.flow_token,
    has_product_id: !!requestPayload.product_id,
    has_data: !!requestPayload.data,
    data_keys: Object.keys(updateData),
  });

  const res = await pluginPostWithRetry(
    "/seller/product/update/by-flow-token",
    requestPayload,
    { timeoutMs: UPDATE_PRODUCT_TIMEOUT_MS, retries: 1, retryDelayMs: 300 },
  );

  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("plugin product/update/by-flow-token failed", {
      status: res.status,
      statusText: res.statusText,
      body,
      productId: state.product_id,
    });

    let code = "plugin_update_failed";
    let message = "Plugin update product failed";
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

  const payload = await parsePluginJsonSafe(res, "plugin product/update/by-flow-token");
  try {
    const productId = extractProductIdFromUpdate(payload);
    if (!productId) {
      return {
        ok: false,
        errorCode: "missing_product_id",
        errorMessage: "Plugin update product response missing product_id",
      };
    }

    return { ok: true, productId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "plugin update product failed";
    return {
      ok: false,
      errorCode: "plugin_payload_error",
      errorMessage: msg,
    };
  }
}

// ============================================================================
// FETCH FUNCTIONS - Unified product data retrieval
// ============================================================================

export type ProductListItem = {
  id: number;
  name: string;
  sku: string;
  price_eur: string;
  price_tnd: string;
  stock: number;
  post_status: string;
  image_url: string;
};

export type ProductListPage = {
  total: number;
  products: ProductListItem[];
};

export type ProductPhotos = {
  product_id: number;
  product_name: string;
  image_urls: string[];
};

export type ProductEditInfo = {
  product_id: number;
  product_name: string;
  regular_eur: string;
  sale_eur: string;
  regular_tnd: string;
  sale_tnd: string;
  stock: number;
  manage_stock: boolean;
  length: string;
  width: string;
  height: string;
  dim_unit: string;
  weight: string;
  weight_unit: string;
  color: string;
  size: string;
};

export type ProductCategoryInfo = {
  product_id: number;
  category_slug: string;
  category_name: string;
  category_label: string;
  subcategory_slug: string;
  subcategory_name: string;
  subcategory_label: string;
};

/**
 * Fetches paginated product list for the seller.
 */
export async function fetchProductsPagedByFlowToken(
  flowToken: string,
  page: number,
  limit: number,
): Promise<ProductListPage | null> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(5, Math.floor(limit)) : 5;

  try {
    const res = await pluginPost("/seller/product/list-paged/by-flow-token", {
      flow_token: flowToken,
      page: safePage,
      limit: safeLimit,
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductsPagedByFlowToken");
    if (!payload) return null;
    const data = asRecord(payload.data);
    if (!data) return null;

    const rawProducts = Array.isArray(data.products) ? data.products : [];
    const products: ProductListItem[] = rawProducts.map((item: unknown) => {
      const r = asRecord(item) ?? {};
      return {
        id: toNum(r.id, 0),
        name: normText(r.name),
        sku: normText(r.sku),
        price_eur: normText(r.price_eur),
        price_tnd: normText(r.price_tnd),
        stock: toNum(r.stock, 0),
        post_status: normText(r.post_status),
        image_url: normText(r.image_url),
      };
    });

    return { total: toNum(data.total, 0), products };
  } catch (err) {
    console.error("fetchProductsPagedByFlowToken error:", err);
    return null;
  }
}

/**
 * Fetches product photos for edit screen.
 */
export async function fetchProductPhotosByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductPhotos | null> {
  try {
    const res = await pluginPost("/seller/product/photos/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductPhotosByFlowToken");
    if (!payload) return null;
    const data = asRecord(payload.data);
    if (!data) return null;

    const urls = Array.isArray(data.image_urls)
      ? (data.image_urls as unknown[]).map((u) => normText(u)).filter(Boolean)
      : [];

    return {
      product_id: toNum(data.product_id, 0),
      product_name: normText(data.product_name),
      image_urls: urls,
    };
  } catch (err) {
    console.error("fetchProductPhotosByFlowToken error:", err);
    return null;
  }
}

/**
 * Fetches product edit info (pricing, dimensions, attributes).
 */
export async function fetchProductEditInfoByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductEditInfo | null> {
  try {
    const res = await pluginPost("/seller/product/edit-info/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductEditInfoByFlowToken");
    if (!payload) return null;
    const d = asRecord(payload.data);
    if (!d) return null;

    const regularEur = normText(d.regular_eur || d.regular_price_eur || d.price_eur || d._regular_price);
    const saleEur = normText(d.sale_eur || d.sale_price_eur || d._sale_price);
    const regularTnd = normText(d.regular_tnd || d.regular_price_tnd || d.price_tnd || d._regular_price_tnd);
    const saleTnd = normText(d.sale_tnd || d.sale_price_tnd || d._sale_price_tnd);
    const stockRaw = d.stock ?? d.stock_quantity ?? d.quantity ?? d._stock;

    return {
      product_id: toNum(d.product_id, 0),
      product_name: normText(d.product_name),
      regular_eur: regularEur,
      sale_eur: saleEur,
      regular_tnd: regularTnd,
      sale_tnd: saleTnd,
      stock: toNum(stockRaw, 0),
      manage_stock: toBool(d.manage_stock),
      length: normText(d.length || d.longueur),
      width: normText(d.width || d.largeur),
      height: normText(d.height || d.profondeur || d.depth),
      dim_unit: normText(d.dim_unit || d.dimension_unit) || "cm",
      weight: normText(d.weight || d.poids),
      weight_unit: normText(d.weight_unit || d.poids_unit || d.weight_measure) || "kg",
      color: normText(d.color || d.couleur),
      size: normText(d.size || d.taille),
    };
  } catch (err) {
    console.error("fetchProductEditInfoByFlowToken error:", err);
    return null;
  }
}

/**
 * Fetches product category and subcategory info.
 */
export async function fetchProductCategoryInfoByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductCategoryInfo | null> {
  try {
    const res = await pluginPost("/seller/product/category-info/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductCategoryInfoByFlowToken");
    if (!payload) return null;
    const d = asRecord(payload.data);
    if (!d) return null;

    return {
      product_id: toNum(d.product_id, 0),
      category_slug: normText(d.category_slug),
      category_name: normText(d.category_name),
      category_label: normText(d.category_label),
      subcategory_slug: normText(d.subcategory_slug),
      subcategory_name: normText(d.subcategory_name),
      subcategory_label: normText(d.subcategory_label),
    };
  } catch (err) {
    console.error("fetchProductCategoryInfoByFlowToken error:", err);
    return null;
  }
}
