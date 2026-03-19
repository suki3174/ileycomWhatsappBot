import type { AddProductState } from "@/models/product_model";
import {
  saveProductDraft,
  markProductConfirmed,
  type CreateProductResult,
} from "@/repositories/addProduct/add_product_repo";
import { findSellerByTokenOrPhone } from "@/services/auth_service";
import {
  fetchAllProductCategories,
  fetchSubCategoriesByCategory,
  SubCategory,
  type ProductCategory,
} from "@/repositories/addProduct/product_category_repo";
import { convertTndPricesViaPlugin } from "@/repositories/addProduct/pricing_repo";
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

  // Extract seller abbreviation from seller name
  let sellerAbbr = "GEN";
  try {
    const seller = await findSellerByTokenOrPhone(flowToken);
    if (seller?.name) {
      // Extract first letters of each word (e.g., "Taher Vendor" => "TAHER")
      sellerAbbr = seller.name
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase())
        .join("")
        .substring(0, 10);
    }
  } catch (err) {
    console.warn("Could not extract seller abbr:", err);
  }

  return saveProductDraft(token, state, quantity, sellerAbbr);
}

export async function confirmProduct(productId: string): Promise<void> {
  await markProductConfirmed(productId);
}

export async function getProductCategoriesCached(): Promise<ProductCategory[]> {
  return fetchAllProductCategories();
}
export async function getSubcategoriesByCategoryCached(categoryId: string): Promise<SubCategory[]> {
  return fetchSubCategoriesByCategory(categoryId);
}


export async function convertTndPricesToEur(
  regularTnd: number,
  promoTnd: number,
) {
  return convertTndPricesViaPlugin(regularTnd, promoTnd);
}

