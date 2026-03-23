import {
  fetchProductsPagedByFlowToken,
  fetchProductPhotosByFlowToken,
  fetchProductEditInfoByFlowToken,
  fetchProductCategoryInfoByFlowToken,
  persistProductUpdate,
} from "@/repositories/products/update_product_repo";
import {
  fetchAllProductCategories,
  fetchSubCategoriesByCategory,
} from "@/repositories/addProduct/product_category_repo";
import { normText } from "@/utils/repository_utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductForEdit = {
  name: string;
  general_price_tnd?: string;
  promo_price_tnd?: string;
  general_price_euro?: string;
  promo_price_euro?: string;
  stock_quantity?: string | number;
  dim_unit?: string;
  weight_unit?: string;
  length?: string;
  width?: string;
  height?: string;
  weight?: string;
  color?: string;
  size?: string;
  categories?: (string | number)[];
  category_label?: string;
  subcategory_label?: string;
  image_gallery?: string[];
  image_src?: string;
};

export type ProductsPage = {
  products: unknown[];
  page: number;
  hasMore: boolean;
  nextPage: number;
};

// ---------------------------------------------------------------------------
// EP1 — Paginated product list
// ---------------------------------------------------------------------------

/**
 * Returns a page of the seller's products mapped to the shape expected by
 * buildProductListPagedResponse / formatProductNavItem.
 */
export async function getSellerProductsPageByFlowToken(
  flowToken: string,
  page: number,
  pageSize: number,
): Promise<ProductsPage> {
  const result = await fetchProductsPagedByFlowToken(flowToken, page, pageSize);
  if (!result) return { products: [], page: 1, hasMore: false, nextPage: 1 };

  const totalPages = Math.ceil(result.total / pageSize);
  const hasMore = page < totalPages;
  const nextPage = hasMore ? page + 1 : page;

  const products = result.products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    status: p.post_status,
    general_price_euro: p.price_eur,
    general_price_tnd: p.price_tnd,
    promo_price_euro: "",
    promo_price_tnd: "",
    stock_quantity: p.stock,
    manage_stock: true,
    image_src: p.image_url,
  }));

  return { products, page, hasMore, nextPage };
}

// ---------------------------------------------------------------------------
// EP2+3+4 — Load full product for the edit flow (photos + info + category)
// ---------------------------------------------------------------------------

/**
 * Fetches photos, edit-info, and category-info in parallel and merges them
 * into the ProductForEdit shape used by the handler.
 *
 * @param productId  WooCommerce product ID as string.
 * @param flowToken  Seller's flow token (required for ownership check).
 */
export async function loadProductForEdit(
  productId: string,
  flowToken: string,
): Promise<ProductForEdit | null> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return null;

  const [photos, editInfo, catInfo] = await Promise.all([
    fetchProductPhotosByFlowToken(tok, pid),
    fetchProductEditInfoByFlowToken(tok, pid),
    fetchProductCategoryInfoByFlowToken(tok, pid),
  ]);

  if (!editInfo) return null;

  const imageGallery = photos?.image_urls ?? [];

  return {
    name: editInfo.product_name,
    general_price_tnd: editInfo.regular_tnd,
    promo_price_tnd: editInfo.sale_tnd,
    general_price_euro: editInfo.regular_eur,
    promo_price_euro: editInfo.sale_eur,
    stock_quantity: editInfo.stock,
    dim_unit: editInfo.dim_unit,
    weight_unit: editInfo.weight_unit,
    length: editInfo.length,
    width: editInfo.width,
    height: editInfo.height,
    weight: editInfo.weight,
    color: editInfo.color,
    size: editInfo.size,
    categories: catInfo?.category_slug ? [catInfo.category_slug] : [],
    category_label: catInfo?.category_label ?? "",
    subcategory_label: catInfo?.subcategory_label ?? "",
    image_gallery: imageGallery,
    image_src: imageGallery[0] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Lazy subcategory loader (reuses add-product category repo)
// ---------------------------------------------------------------------------

export async function loadSubcategoriesForCategory(
  categoryId: string,
): Promise<Array<{ id: string; title: string; description: string }>> {
  const subcats = await fetchSubCategoriesByCategory(categoryId);
  return subcats.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? s.title,
  }));
}

// ---------------------------------------------------------------------------
// Prefetch: warm up categories list on INIT / NAVIGATE
// ---------------------------------------------------------------------------

export async function prefetchUpdateProductData(): Promise<Record<string, unknown>> {
  try {
    const categories = await fetchAllProductCategories();
    return { categories };
  } catch {
    return { categories: [] };
  }
}

// ---------------------------------------------------------------------------
// EP5 — Apply update
// ---------------------------------------------------------------------------

export async function updateProductNow(
  productId: string,
  flowToken: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return false;

  // Map handler state keys → PHP endpoint keys
  const payload: Record<string, unknown> = {
    name:               data.product_name,
    regular_tnd:        data.prix_regulier_tnd,
    sale_tnd:           data.prix_promo_tnd,
    regular_eur:        data.prix_regulier_eur,
    sale_eur:           data.prix_promo_eur,
    stock:              data.quantite,
    length:             data.longueur,
    width:              data.largeur,
    height:             data.profondeur,
    dim_unit:           data.unite_dimension,
    weight:             data.valeur_poids,
    weight_unit:        data.unite_poids,
    color:              data.couleur,
    size:               data.taille,
    category_id:        data.product_category,
    category_label:     data.product_category_label,
    subcategory_id:     data.product_subcategory,
    subcategory_label:  data.product_subcategory_label,
  };

  // Only attach images when the seller explicitly replaced them
  if (data.photos_modifiees && Array.isArray(data.images_base64)) {
    payload.images = data.images_base64;
  }

  return persistProductUpdate(tok, pid, payload);
}
