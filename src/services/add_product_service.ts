import type { AddProductState } from "@/repositories/add_product_cache";
import {
  saveProductDraft,
  markProductConfirmed,
  type CreateProductResult,
} from "@/repositories/add_product_repo";
import { fetchAllProductCategories, type ProductCategory } from "@/repositories/product_category_repo";
import { convertTndPricesViaPlugin } from "@/repositories/pricing_repo";
import { normToken } from "@/utils/utilities";

export async function persistDraftProduct(
  flowToken: string,
  state: AddProductState,
  quantity: number,
): Promise<CreateProductResult> {
  const token = normToken(flowToken);
  if (!token) {
    return saveProductDraft("unknown", state, quantity);
  }
  return saveProductDraft(token, state, quantity);
}

export async function confirmProduct(productId: string): Promise<void> {
  await markProductConfirmed(productId);
}

export async function getProductCategoriesCached(): Promise<ProductCategory[]> {
  return fetchAllProductCategories();
}

export async function convertTndPricesToEur(
  regularTnd: number,
  promoTnd: number,
) {
  return convertTndPricesViaPlugin(regularTnd, promoTnd);
}

