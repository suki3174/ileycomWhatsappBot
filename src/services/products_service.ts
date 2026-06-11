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

/*
Fetches the seller product list using a cache-first strategy keyed by normalized flow
token. This is the broad list retrieval entry point used for warm-up and fallback paths,
and it persists fresh plugin results in cache to reduce repeated backend latency.
*/
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

/*
Fetches a paginated product slice for a seller by flow token with page and page-size
normalization. This path delegates to repository paging behavior and is used by list
screen rendering where pagination metadata must be preserved.
*/
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

/*
Resolves a single product by id using cache-first lookup and repository fallback. The
resolved entity is written back to cache so subsequent detail requests can avoid another
plugin round-trip.
*/
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

/*
Resolves a specific variation using product/variation identifiers with cache-first read,
then repository fallback if needed. Successful repository responses are cached to speed
repeated variation detail navigation within the same flow session.
*/
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

/*
Triggers a non-blocking prefetch of the seller product list to warm cache ahead of user
navigation. Errors are intentionally swallowed because this optimization must never block
screen routing or alter functional behavior.
*/
export function primeProductsAsync(token: string): void {
  void getSellerProductsByFlowToken(token)
    .catch(() => undefined);
}
