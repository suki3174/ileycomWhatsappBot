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












