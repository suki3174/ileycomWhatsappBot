import type { Product, ProductVariation } from "@/models/product_model";
import { getProductsForToken, loadAndCacheProducts, setLastVariableProductId } from "@/repositories/products/poducts_cache";
import {
  findProductsBySellerFlowToken,
  findProductById,
  findVariationById,
  type ProductsPageResult,
} from "@/repositories/products/product_repo";
import { normToken } from "@/utils/core_utils";

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
  return await getProductsForToken(normalized);
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

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0
    ? Math.min(50, Math.floor(perPage))
    : 5;

  const products = await getProductsForToken(normalized);
  const start = (safePage - 1) * safePerPage;
  const pageItems = products.slice(start, start + safePerPage);
  const hasMore = start + safePerPage < products.length;

  return {
    products: pageItems,
    page: safePage,
    perPage: safePerPage,
    hasMore,
    nextPage: hasMore ? safePage + 1 : undefined,
  };
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