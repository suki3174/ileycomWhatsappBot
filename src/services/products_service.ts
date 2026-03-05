/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Product, ProductVariation } from "@/models/product_model";
import { loadAndCacheProducts } from "@/repositories/poducts_cache";
import {
  findProductsBySellerFlowToken,
  findProductById,
  findVariationById,
} from "@/repositories/product_repo";
import { normToken } from "@/utils/utilities";


export async function getSellerProductsByFlowToken(
  token: string,
): Promise<Product[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return await findProductsBySellerFlowToken(normalized);
}

export async function getProductById(
  productId: string,
): Promise<Product | undefined> {
  return await findProductById(productId);
}

export async function getVariationDetail(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  return await findVariationById(productId, variationId);
}

export function primeProductsAsync(token: string): void {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return;
  void loadAndCacheProducts(normalized);
}