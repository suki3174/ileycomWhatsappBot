import type { Product, ProductVariation } from "@/models/product_model";
import { loadAndCacheProducts, setLastVariableProductId } from "@/repositories/poducts_cache";
import {
  findProductsBySellerFlowToken,
  findProductsPageBySellerFlowToken,
  findProductById,
  findVariationById,
  type ProductsPageResult,
} from "@/repositories/product_repo";
import { normToken } from "@/utils/utilities";

interface ProductDetailCacheEntry {
  product: Product;
  preparedAt: number;
}

interface VariationDetailCacheEntry {
  variation: ProductVariation;
  preparedAt: number;
}

const PRODUCT_DETAIL_TTL_MS = 5 * 60 * 1000;
const VARIATION_DETAIL_TTL_MS = 5 * 60 * 1000;

declare global {
  var productDetailCache: Map<string, ProductDetailCacheEntry> | undefined;
  var variationDetailCache: Map<string, VariationDetailCacheEntry> | undefined;
}

globalThis.productDetailCache =
  globalThis.productDetailCache || new Map<string, ProductDetailCacheEntry>();
globalThis.variationDetailCache =
  globalThis.variationDetailCache ||
  new Map<string, VariationDetailCacheEntry>();

const productDetailCache = globalThis.productDetailCache;
const variationDetailCache = globalThis.variationDetailCache;

function variationKey(productId: string, variationId: string): string {
  return `${String(productId || "").trim()}::${String(variationId || "").trim()}`;
}


export async function getSellerProductsByFlowToken(
  token: string,
): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return await findProductsBySellerFlowToken(normalized);
}

export async function getSellerProductsPageByFlowToken(
  token: string,
  page = 1,
  perPage = 5,
): Promise<ProductsPageResult> {
  const normalized = normToken(token);
  if (!normalized) {
    return { products: [], page: 1, perPage: 5, hasMore: false };
  }

  return await findProductsPageBySellerFlowToken(normalized, page, perPage);
}

export async function getProductById(
  productId: string,
): Promise<Product | undefined> {
  const pid = String(productId || "").trim();
  if (!pid) return undefined;

  const cached = productDetailCache.get(pid);
  if (cached && Date.now() - cached.preparedAt <= PRODUCT_DETAIL_TTL_MS) {
    return cached.product;
  }

  const product = await findProductById(pid);
  if (!product) return undefined;

  productDetailCache.set(pid, {
    product,
    preparedAt: Date.now(),
  });

  for (const variation of product.variations || []) {
    const key = variationKey(pid, variation.id);
    variationDetailCache.set(key, {
      variation,
      preparedAt: Date.now(),
    });
  }

  return product;
}

export async function getVariationDetail(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return undefined;

  const key = variationKey(pid, vid);
  const cached = variationDetailCache.get(key);
  if (cached && Date.now() - cached.preparedAt <= VARIATION_DETAIL_TTL_MS) {
    return cached.variation;
  }

  const variation = await findVariationById(pid, vid);
  if (!variation) return undefined;

  variationDetailCache.set(key, {
    variation,
    preparedAt: Date.now(),
  });

  return variation;
}

export function primeProductsAsync(token: string): void {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return;
  void loadAndCacheProducts(normalized);
}

export function rememberVariableProduct(token: string, productId: string): void {
  setLastVariableProductId(token, productId);
}