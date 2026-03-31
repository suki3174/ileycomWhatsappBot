import { Product } from "@/models/product_model";
import { findProductsBySellerFlowToken } from "@/repositories/products/product_repo";
import { normToken } from "@/utils/core_utils";

interface ProductListCacheEntry {
  products: Product[];
  preparedAt: number;
}

interface ProductListPageCacheEntry {
  token: string;
  page: number;
  signature: string;
  data: unknown;
  preparedAt: number;
}

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_PRODUCT_CACHE_TTL_MS = 15 * 1000; // 15 seconds
const PRODUCT_LIST_PAGE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

declare global {
  var productListCache: Map<string, ProductListCacheEntry> | undefined;
  var productPageCursorCache: Map<string, number> | undefined;
  var productLastVariableIdCache: Map<string, string> | undefined;
  var productListInflight: Map<string, Promise<Product[]>> | undefined;
  var productListPageCache: Map<string, ProductListPageCacheEntry> | undefined;
}

globalThis.productListCache =
  globalThis.productListCache || new Map<string, ProductListCacheEntry>();
const productListCache = globalThis.productListCache;

globalThis.productPageCursorCache =
  globalThis.productPageCursorCache || new Map<string, number>();
const productPageCursorCache = globalThis.productPageCursorCache;

globalThis.productLastVariableIdCache =
  globalThis.productLastVariableIdCache || new Map<string, string>();
const productLastVariableIdCache = globalThis.productLastVariableIdCache;

globalThis.productListInflight =
  globalThis.productListInflight || new Map<string, Promise<Product[]>>();
const productListInflight = globalThis.productListInflight;

globalThis.productListPageCache =
  globalThis.productListPageCache || new Map<string, ProductListPageCacheEntry>();
const productListPageCache = globalThis.productListPageCache;

function pageCacheKey(token: string, page: number): string {
  return `${token}::${Math.max(1, Math.floor(page || 1))}`;
}

// load products for token and save in cache

export async function loadAndCacheProducts(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const running = productListInflight.get(normalized);
  if (running) return running;

  const existing = productListCache.get(normalized);

  const task = (async (): Promise<Product[]> => {
    try {
      const products = await findProductsBySellerFlowToken(normalized);

      // Avoid poisoning a warm cache with transient empty responses.
      if (products.length === 0) {
        if (existing && existing.products.length > 0) {
          return existing.products;
        }

        // Cache empty response briefly to avoid hammering plugin on repeated INIT.
        productListCache.set(normalized, {
          products: [],
          preparedAt: Date.now(),
        });
        return [];
      }

      console.log("Products loaded", {
        count: products.length,
        sampleIds: products.slice(0, 5).map((p) => String((p as { id?: string | number }).id ?? "")),
        tokenSuffix: normalized.slice(-6),
      });
      productListCache.set(normalized, {
        products,
        preparedAt: Date.now(),
      });
      return products;
    } catch (err) {
      console.error("loadAndCacheProducts failed", err);
      if (existing) return existing.products;
      return [];
    } finally {
      productListInflight.delete(normalized);
    }
  })();

  productListInflight.set(normalized, task);
  return task;
}

// get products for token, using cache if valid
export async function getProductsForToken(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const entry = productListCache.get(normalized);
  if (entry) {
    const ageMs = Date.now() - entry.preparedAt;
    const ttlMs = entry.products.length > 0 ? PRODUCT_CACHE_TTL_MS : EMPTY_PRODUCT_CACHE_TTL_MS;
    if (ageMs <= ttlMs) {
      return entry.products;
    }
  }

  const running = productListInflight.get(normalized);
  if (running) {
    return running;
  }

  if (
    entry &&
    entry.products.length > 0 &&
    Date.now() - entry.preparedAt <= PRODUCT_CACHE_TTL_MS
  ) {
    return entry.products;
  }

  return loadAndCacheProducts(normalized);
}

export function getProductsPageCursor(token: string): number | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const page = productPageCursorCache.get(normalized);
  if (!Number.isFinite(page)) return undefined;
  if ((page as number) <= 0) return undefined;
  return Math.floor(page as number);
}

export function setProductsPageCursor(token: string, page: number): void {
  const normalized = normToken(token);
  if (!normalized) return;

  if (!Number.isFinite(page) || page <= 0) {
    productPageCursorCache.delete(normalized);
    return;
  }

  productPageCursorCache.set(normalized, Math.floor(page));
}

export function getLastVariableProductId(token: string): string | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const productId = productLastVariableIdCache.get(normalized);
  if (!productId) return undefined;

  const clean = String(productId).trim();
  return clean || undefined;
}

export function setLastVariableProductId(token: string, productId: string): void {
  const normalized = normToken(token);
  if (!normalized) return;

  const clean = String(productId || "").trim();
  if (!clean) {
    productLastVariableIdCache.delete(normalized);
    return;
  }

  productLastVariableIdCache.set(normalized, clean);
}

export function getCachedProductListPageData(
  token: string,
  page: number,
  signature: string,
): unknown | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const key = pageCacheKey(normalized, page);
  const entry = productListPageCache.get(key);
  if (!entry) return undefined;

  if (Date.now() - entry.preparedAt > PRODUCT_LIST_PAGE_CACHE_TTL_MS) {
    productListPageCache.delete(key);
    return undefined;
  }

  if (entry.signature !== signature) return undefined;
  return entry.data;
}

export function setCachedProductListPageData(
  token: string,
  page: number,
  signature: string,
  data: unknown,
): void {
  const normalized = normToken(token);
  if (!normalized) return;

  const key = pageCacheKey(normalized, page);
  productListPageCache.set(key, {
    token: normalized,
    page: Math.max(1, Math.floor(page || 1)),
    signature,
    data,
    preparedAt: Date.now(),
  });
}


