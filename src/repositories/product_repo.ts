import {
  type Product,
  type ProductVariation,
  ProductType,
} from "@/models/product_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
  toBool,
  toNum,
  toStringArray,
} from "@/utils/repository_utils";

const PRODUCTS_BY_FLOW_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 20000);

export interface ProductsPageResult {
  products: Product[];
  page: number;
  perPage: number;
  hasMore: boolean;
  nextPage?: number;
}

function mapVariation(rawVariation: unknown): ProductVariation | undefined {
  const row = asRecord(rawVariation);
  if (!row) return undefined;

  const id = normText(row.id);
  if (!id) return undefined;

  const attributes = asRecord(row.attributes) || {};
  const normalizedAttributes: ProductVariation["attributes"] = {};
  for (const [key, value] of Object.entries(attributes)) {
    normalizedAttributes[key] = normText(value);
  }

  return {
    id,
    sku: normText(row.sku),
    title: normText(row.title) || `Variation #${id}`,
    stock: toNum(row.stock, 0),
    stock_status: normText(row.stock_status).toLowerCase(),
    manage_stock: toBool(row.manage_stock),
    attributes: normalizedAttributes,
    price_euro: normText(row.price_euro),
    price_tnd: normText(row.price_tnd),
    image_src: normText(row.image_src),
  };
}

function mapProduct(rawProduct: unknown): Product | undefined {
  const row = asRecord(rawProduct);
  if (!row) return undefined;

  const id = normText(row.id);
  if (!id) return undefined;

  const rawType = normText(row.type).toLowerCase();
  const isVariable = toBool(row.is_variable) || rawType === ProductType.VARIABLE;
  const type = isVariable ? ProductType.VARIABLE : ProductType.SIMPLE;

  let imageUrls: string[] = [];
  if (Array.isArray(row.image_src)) {
    imageUrls = row.image_src.map((v) => normText(v)).filter((v) => v);
  } else {
    const single = normText(row.image_src);
    if (single) imageUrls = [single];
  }

  const mapped: Product = {
    id,
    name: normText(row.name),
    type,
    sku: normText(row.sku),
    image_src: normText(row.image_src),
    image_gallery: toStringArray(row.image_gallery),
    created_at: normText(row.created_at),
    short_description: normText(row.short_description),
    full_description: normText(row.full_description),
    categories: toStringArray(row.categories),
    tags: toStringArray(row.tags),
    general_price_euro: normText(row.general_price_euro),
    general_price_tnd: normText(row.general_price_tnd),
    promo_price_euro: normText(row.promo_price_euro),
    promo_price_tnd: normText(row.promo_price_tnd),
    stock_quantity: toNum(row.stock_quantity, 0),
    manage_stock: toBool(row.manage_stock),
    is_variable: isVariable,
  };

  if (Array.isArray(row.variations)) {
    mapped.variations = row.variations
      .map((variation) => mapVariation(variation))
      .filter((variation): variation is ProductVariation => !!variation);
  }

  return mapped;
}

function extractDataObject(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  return asRecord(payload.data);
}

function extractProductsFromPayload(
  payload: Record<string, unknown> | undefined,
): Product[] {
  const data = extractDataObject(payload);
  if (!data || !Array.isArray(data.products)) return [];

  return data.products
    .map((product) => mapProduct(product))
    .filter((product): product is Product => !!product);
}

function extractProductFromPayload(
  payload: Record<string, unknown> | undefined,
): Product | undefined {
  const data = extractDataObject(payload);
  if (!data) return undefined;
  return mapProduct(data.product);
}

function extractVariationFromPayload(
  payload: Record<string, unknown> | undefined,
): ProductVariation | undefined {
  const data = extractDataObject(payload);
  if (!data) return undefined;
  return mapVariation(data.variation);
}

export async function findProductsBySellerFlowToken(
  flowToken: string,
): Promise<Product[]> {
  const pageResult = await findProductsPageBySellerFlowToken(flowToken, 1, 200);
  return pageResult.products;
}

export async function findProductsPageBySellerFlowToken(
  flowToken: string,
  page = 1,
  perPage = 5,
): Promise<ProductsPageResult> {
  const token = normText(flowToken);
  if (!token) {
    return { products: [], page: 1, perPage: 5, hasMore: false };
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0
    ? Math.min(50, Math.floor(perPage))
    : 5;

  try {
    const res = await pluginPostWithRetry(
      "/seller/products/by-flow-token",
      { flow_token: token, page: safePage, per_page: safePerPage },
      { timeoutMs: PRODUCTS_BY_FLOW_TIMEOUT_MS, retries: 0, retryDelayMs: 0 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin products/by-flow-token failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return { products: [], page: safePage, perPage: safePerPage, hasMore: false };
    }

    const payload = await parsePluginJsonSafe(res, "plugin products/by-flow-token");
    const products = extractProductsFromPayload(payload);
    const data = extractDataObject(payload);
    const parsedPage = toNum(data?.page, safePage) || safePage;
    const parsedPerPage = toNum(data?.per_page, safePerPage) || safePerPage;
    const hasMore = toBool(data?.has_more);
    const nextPageNum = toNum(data?.next_page, 0);

    return {
      products,
      page: parsedPage,
      perPage: parsedPerPage,
      hasMore,
      nextPage: nextPageNum > 0 ? nextPageNum : undefined,
    };
  } catch (err) {
    console.error("plugin products/by-flow-token exception", err);
    return { products: [], page: safePage, perPage: safePerPage, hasMore: false };
  }
}

export async function findProductById(
  productId: string,
): Promise<Product | undefined> {
  const pid = normText(productId);
  if (!pid) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/by-id",
      { product_id: pid },
      { timeoutMs: PLUGIN_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return undefined;
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/by-id");
    return extractProductFromPayload(payload);
  } catch (err) {
    console.error("plugin product/by-id exception", err);
    return undefined;
  }
}

export async function findVariationById(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = normText(productId);
  const vid = normText(variationId);
  if (!pid || !vid) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/variation/by-id",
      { product_id: pid, variation_id: vid },
      { timeoutMs: PLUGIN_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/variation/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return undefined;
    }

    const payload = await parsePluginJsonSafe(
      res,
      "plugin product/variation/by-id",
    );
    return extractVariationFromPayload(payload);
  } catch (err) {
    console.error("plugin product/variation/by-id exception", err);
    return undefined;
  }
}

