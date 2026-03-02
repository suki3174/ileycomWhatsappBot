/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type Product,
  type ProductVariation,
  MOCK_PRODUCTS,
} from "@/models/product_model";

declare global {
  // In-memory product list, can be hydrated from an external source later.
  // Using globalThis to keep data stable across hot reloads in dev.
  // eslint-disable-next-line no-var
  var products: Product[] | undefined;
}

globalThis.products = globalThis.products || [...MOCK_PRODUCTS];

export const products: Product[] = globalThis.products;

/**
 * Retourne tous les produits disponibles pour un vendeur donné.
 * Pour l'instant, on renvoie simplement la liste mockée, sans filtrage par vendeur.
 */
export async function findProductsBySellerFlowToken(
  _flowToken: string,
): Promise<Product[]> {
    console.log("Fetching products:", products);
  return products;
}

/**
 * Recherche un produit par son ID.
 */
export async function findProductById(
  productId: string,
): Promise<Product | undefined> {
  const pid = String(productId || "").trim();
  if (!pid) return undefined;
  return products.find((p) => p.id === pid);
}

/**
 * Recherche une variation spécifique d'un produit.
 */
export async function findVariationById(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const product = await findProductById(productId);
  if (!product || !product.variations || !product.variations.length) {
    return undefined;
  }

  const vid = String(variationId || "").trim();
  if (!vid) return undefined;

  return product.variations.find((v) => v.id === vid);
}

