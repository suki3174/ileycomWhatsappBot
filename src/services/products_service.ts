/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Product, ProductVariation } from "@/models/product_model";
import {
  findProductsBySellerFlowToken,
  findProductById,
  findVariationById,
} from "@/repositories/product_repo";

const normToken = (t: string): string => (t ? String(t).trim() : "");

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

