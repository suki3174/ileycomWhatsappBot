import type { Product, ProductVariation } from "@/models/product_model";
import {
  findProductsBySellerFlowToken,
  findProductById,
  findVariationById,
  type ProductsPageResult,
} from "@/repositories/products/product_repo";
import { normToken } from "@/utils/core_utils";


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

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0
    ? Math.min(50, Math.floor(perPage))
    : 5;

  const products = await findProductsBySellerFlowToken(normalized);
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
  return await findProductById(pid);
}

export async function getVariationDetail(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return undefined;
  return await findVariationById(pid, vid);
}

export function primeProductsAsync(token: string): void {
  void token;
}

export function rememberVariableProduct(token: string, productId: string): void {
  void token;
  void productId;
}