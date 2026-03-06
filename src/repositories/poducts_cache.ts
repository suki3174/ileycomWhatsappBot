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
}

globalThis.productListCache =
  globalThis.productListCache || new Map<string, ProductListCacheEntry>();
const productListCache = globalThis.productListCache;

// load products for token and save in cache

export async function loadAndCacheProducts(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  try {
    const products = await getSellerProductsByFlowToken(normalized);
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
  if (entry && Date.now() - entry.preparedAt <= PRODUCT_CACHE_TTL_MS) {
    return entry.products;
  }

  return loadAndCacheProducts(normalized);
}


