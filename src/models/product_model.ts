/* eslint-disable @typescript-eslint/no-explicit-any */

import { SubCategory } from "./category_model";

/**
 * Enum pour les types de produits supportés par votre Flow
 */
export enum ProductType {
  SIMPLE = 'simple',
  VARIABLE = 'variable',
}

/**
 * Interface pour les variations de produits
 */
export interface ProductVariation {
  id: string;
  sku: string;
  title: string;
  stock: number;
  stock_status?: string;
  manage_stock?: boolean;
  attributes: {
    weight?: string;
    size?: string;
    [key: string]: any; // Pour d'autres attributs dynamiques
  };
  price_euro: string;
  price_tnd: string;
  image_src: string;
}

/**
 * Modèle de Produit complet
 */
export interface Product {
  id: string;
  name: string;
  type: ProductType;
  sku: string;
  image_src: string;
  image_gallery?: string[];
  created_at: string; // ISO Date string ou format "02/03/2026"
  
  // Descriptions
  short_description: string;
  full_description: string;

  // Catégories et Tags
  categories: string[];
  tags: string[];

  // Champs conditionnels pour Produit Simple
  general_price_euro?: string;
  general_price_tnd?: string;
  promo_price_euro?: string;
  promo_price_tnd?: string;
  stock_quantity?: number;
  manage_stock: boolean;

  // Champs conditionnels pour Produit Variable
  variations?: ProductVariation[];
  
  // Flag utilitaire pour le Flow
  is_variable: boolean;
}

/**
 * Exemple de produit SIMPLE pour tester votre Flow
 */
export const MOCK_PRODUCT_SIMPLE: Product = {
  id: "283891",
  name: "Sucre en cubes irrésistible",
  type: ProductType.SIMPLE,
  is_variable: false,
  sku: "VNDSUCREXX55597",
  image_src: "https://example.com/sucre.jpg",
  image_gallery: ["https://example.com/sucre.jpg"],
  created_at: "02/03/2026",
  short_description: "❀ Poids : 73 g ❀ Style : Élégance et modernité...",
  full_description: "Présentation du produit Le sucre en cubes est l'élément indispensable...",
  categories: ["Bain & Corps", "Produits de Beauté"],
  tags: ["sucre raffiné", "élégance"],
  general_price_euro: "27€",
  promo_price_euro: "24€",
  general_price_tnd: "60 TND",
  promo_price_tnd: "50 TND",
  stock_quantity: 10,
  manage_stock: true
};

/**
 * Exemple de produit VARIABLE pour tester votre Flow
 */
export const MOCK_PRODUCT_VARIABLE: Product = {
  id: "283894",
  name: "Sucre en cubes irrésistible - Pack",
  type: ProductType.VARIABLE,
  is_variable: true,
  sku: "VNDSUCREPACK999",
  image_src: "https://example.com/sucre-pack.jpg",
  image_gallery: ["https://example.com/sucre-pack.jpg"],
  created_at: "02/03/2026",
  short_description: "❀ Sucre en cubes - différentes variantes de poids.",
  full_description: "Présentation du produit variable avec plusieurs variations de poids.",
  categories: ["Suppléments Alimentaires"],
  tags: ["sucre", "variable"],
  manage_stock: true,
  variations: [
    {
      id: "283894",
      sku: "VNDSUCRE250",
      title: "Variation #283894 (250g)",
      stock: 15,
      attributes: {
        weight: "250g",
      },
      price_euro: "14.80€",
      price_tnd: "45 TND",
      image_src: "https://example.com/sucre-250.jpg",
    },
    {
      id: "283895",
      sku: "VNDSUCRE500",
      title: "Variation #283895 (500g)",
      stock: 8,
      attributes: {
        weight: "500g",
      },
      price_euro: "24.80€",
      price_tnd: "70 TND",
      image_src: "https://example.com/sucre-500.jpg",
    },
  ],
};

export interface AddProductState {
  images?: string[];
  product_name?: string;
  product_category?: string;
  product_category_label?: string;
  categories?: { id: string; title: string }[];
  prix_regulier_tnd?: number;
  prix_promo_tnd?: number;
  prix_regulier_eur?: number;
  prix_promo_eur?: number;
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  unite_dimension?: string;
  valeur_poids?: number;
  unite_poids?: string;
  couleur?: string;
  taille?: string;
  quantite?: string;
  product_id?: string;
  submitted_at?: number;
  created_at?: string; // Date in format "dd/mm/yyyy"
  submit_status?: string;
  submit_message?: string;
  submit_error_code?: string;
  product_subcategory?: string;
  product_subcategory_label?: string;
  subcategories?: Record<string, SubCategory[]>;
}


/**
 * Liste mockée de produits pour un vendeur.
 * Dans le futur, ceci pourra être remplacé par une récupération depuis WordPress.
 */
export const MOCK_PRODUCTS: Product[] = [MOCK_PRODUCT_SIMPLE, MOCK_PRODUCT_VARIABLE];