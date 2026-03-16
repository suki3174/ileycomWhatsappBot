import type { Product } from "@/models/product_model";
import { fetchAllProductCategories, type ProductCategory } from "@/repositories/product_category_repo";

export interface ProductSubcategory {
  id: string;
  title: string;
  description: string;
}

const MOCK_SUBCATEGORIES: Record<string, ProductSubcategory[]> = {
  mode: [
    { id: "robes", title: "Robes", description: "Mode & Vêtements > Robes" },
    { id: "hauts", title: "Hauts & T-shirts", description: "Mode & Vêtements > Hauts & T-shirts" },
    { id: "pantalons", title: "Pantalons & Jeans", description: "Mode & Vêtements > Pantalons & Jeans" },
    { id: "chaussures", title: "Chaussures", description: "Mode & Vêtements > Chaussures" },
    { id: "accessoires", title: "Autres accessoires", description: "Mode & Vêtements > Autres accessoires" },
  ],
};

// In-memory store for "updated" products (placeholder persistence)
declare global {
  var updatedProductsStore: Map<string, Partial<Product> & { id: string }> | undefined;
}

globalThis.updatedProductsStore =
  globalThis.updatedProductsStore || new Map<string, Partial<Product> & { id: string }>();

const updatedProductsStore = globalThis.updatedProductsStore;

export async function findAllCategories(): Promise<ProductCategory[]> {
  return fetchAllProductCategories();
}

export async function findSubcategoriesByCategory(categoryId: string): Promise<ProductSubcategory[]> {
  return MOCK_SUBCATEGORIES[String(categoryId || "").trim()] || [];
}

export async function persistProductUpdate(
  productId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const id = String(productId || "").trim();
  if (!id) return false;
  updatedProductsStore.set(id, { id, ...(patch as any) });
  return true;
}

