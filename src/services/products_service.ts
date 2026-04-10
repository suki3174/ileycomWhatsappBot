import type { Product, ProductVariation } from "@/models/product_model";
import {
  findProductsBySellerFlowToken,
  findProductsPageBySellerFlowToken,
  findProductById,
  findVariationById,
  type ProductsPageResult,
} from "@/repositories/products/product_repo";
import { normToken } from "@/utils/core_utils";
import {
  getProductsListByTokenCache,
  getProductByIdCache,
  getVariationByIdsCache,
  writeProductByIdCache,
  writeProductsListByTokenCache,
  writeVariationByIdsCache,
} from "@/services/cache/products_cache_service";


export async function getSellerProductsByFlowToken(
  token: string,
): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const cached = await getProductsListByTokenCache(normalized);
  if (Array.isArray(cached)) {
    return cached;
  }

  const fetched = await findProductsBySellerFlowToken(normalized);
  await writeProductsListByTokenCache(normalized, fetched);
  return fetched;
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
    ? Math.min(5, Math.floor(perPage))
    : 5;

  return await findProductsPageBySellerFlowToken(normalized, safePage, safePerPage);
}

export async function getProductById(
  productId: string,
): Promise<Product | undefined> {
  const pid = String(productId || "").trim();
  if (!pid) return undefined;
  const cached = await getProductByIdCache(pid);
  if (cached) return cached;

  const fetched = await findProductById(pid);
  if (fetched) {
    await writeProductByIdCache(pid, fetched);
  }
  return fetched;
}

export async function getVariationDetail(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return undefined;

  const cached = await getVariationByIdsCache(pid, vid);
  if (cached) return cached;

  const fetched = await findVariationById(pid, vid);
  if (fetched) {
    await writeVariationByIdsCache(pid, vid, fetched);
  }
  return fetched;
}

export function primeProductsAsync(token: string): void {
  void getSellerProductsByFlowToken(token)
    .catch(() => undefined);
}

export function rememberVariableProduct(token: string, productId: string): void {
  void token;
  void productId;
}