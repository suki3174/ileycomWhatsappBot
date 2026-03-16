import { Product } from "@/models/product_model";
import { getSellerProductsByFlowToken } from "@/services/products_service";
import { normToken } from "@/utils/utilities";

interface ProductListCacheEntry {
  products: Product[];
  preparedAt: number;
}

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

declare global {
  var productListCache: Map<string, ProductListCacheEntry> | undefined;
  var productPageCursorCache: Map<string, number> | undefined;
  var productLastVariableIdCache: Map<string, string> | undefined;
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

// load products for token and save in cache

export async function loadAndCacheProducts(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const existing = productListCache.get(normalized);

  try {
    const products = await getSellerProductsByFlowToken(normalized);

    // Avoid caching empty arrays because upstream timeout/failure paths currently
    // also resolve as [] and can poison cache for the full TTL.
    if (products.length === 0) {
      // If we already have a non-empty cache, keep serving it instead of replacing
      // it with a potential false-empty transient response.
      if (existing && existing.products.length > 0) {
        return existing.products;
      }
      return [];
    }

    console.log(`Products loaded for token: ${products}`);
    productListCache.set(normalized, {
      products,
      preparedAt: Date.now(),
    });
    return products;
  } catch (err) {
    console.error("loadAndCacheProducts failed", err);
    return [];
  }
}

// get products for token, using cache if valid
export async function getProductsForToken(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const entry = productListCache.get(normalized);
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


