import type { Product } from "@/models/product_model";
import { getProductById } from "@/services/products_service";
import {
  findAllCategories,
  findSubcategoriesByCategory,
  persistProductUpdate,
  type ProductSubcategory,
} from "@/repositories/update_product_repo";
import type { ProductCategory } from "@/models/category_model";

export async function prefetchUpdateProductData(): Promise<{
  categories: ProductCategory[];
  subcategoriesByCategory: Record<string, ProductSubcategory[]>;
}> {
  const categories = await findAllCategories();
  return { categories, subcategoriesByCategory: {} };
}

export async function loadSubcategoriesForCategory(categoryId: string): Promise<ProductSubcategory[]> {
  return findSubcategoriesByCategory(categoryId);
}

export async function loadProductForEdit(productId: string): Promise<Product | undefined> {
  return getProductById(productId);
}

export async function updateProductNow(
  productId: string,
  flowToken: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  return persistProductUpdate(productId, flowToken, patch);
}

