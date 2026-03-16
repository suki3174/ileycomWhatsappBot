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
  const subcategoriesByCategory: Record<string, ProductSubcategory[]> = {};

  // Placeholder: prefetch subcategories only for known categories; keep fast.
  await Promise.all(
    categories.map(async (c) => {
      subcategoriesByCategory[c.id] = await findSubcategoriesByCategory(c.id);
    }),
  );

  return { categories, subcategoriesByCategory };
}

export async function loadProductForEdit(productId: string): Promise<Product | undefined> {
  return getProductById(productId);
}

export async function updateProductNow(
  productId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  return persistProductUpdate(productId, patch);
}

