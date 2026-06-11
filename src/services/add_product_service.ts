import type { AddProductState } from "@/models/product_model";
import {
  saveProductDraft,
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
import { normToken } from "@/utils/core_utils";

/**
 * Persists a product draft through the repository layer using the flow token.
 * It derives a seller-specific SKU prefix from seller name when available.
 */
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

/**
 * Returns cached or plugin-fetched product categories.
 */
export async function getProductCategoriesCached(): Promise<ProductCategory[]> {
  return fetchAllProductCategories();
}

/**
 * Returns cached or plugin-fetched subcategories for a parent category.
 */
export async function getSubcategoriesByCategoryCached(categoryId: string): Promise<SubCategory[]> {
  return fetchSubCategoriesByCategory(categoryId);
}


/**
 * Converts TND pricing to EUR via plugin conversion service.
 */
export async function convertTndPricesToEur(
  regularTnd: number,
  promoTnd: number,
) {
  return convertTndPricesViaPlugin(regularTnd, promoTnd);
}

