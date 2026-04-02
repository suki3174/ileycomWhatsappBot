import { Product } from "@/models/product_model";
import { findProductsBySellerFlowToken } from "@/repositories/products/product_repo";
import { normToken } from "@/utils/core_utils";

export async function loadAndCacheProducts(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return await findProductsBySellerFlowToken(normalized);
}

export async function getProductsForToken(token: string): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return await findProductsBySellerFlowToken(normalized);
}

export function getProductsPageCursor(token: string): number | undefined {
  void token;
  return undefined;
}

export function setProductsPageCursor(token: string, page: number): void {
  void token;
  void page;
}

export function getLastVariableProductId(token: string): string | undefined {
  void token;
  return undefined;
}

export function setLastVariableProductId(token: string, productId: string): void {
  void token;
  void productId;
}

export function getCachedProductListPageData(
  token: string,
  page: number,
  signature: string,
): unknown | undefined {
  void token;
  void page;
  void signature;
  return undefined;
}

export function setCachedProductListPageData(
  token: string,
  page: number,
  signature: string,
  data: unknown,
): void {
  void token;
  void page;
  void signature;
  void data;
}
