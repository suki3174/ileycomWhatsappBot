/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SubCategory } from "@/models/category_model";
import type { ProductCategory } from "@/repositories/addProduct/product_category_repo";
import {
  getCachedUpdateProductsPage,
  setCachedUpdateProductsPage,
  getCachedUpdateProductPhotos,
  setCachedUpdateProductPhotos,
  getCachedUpdateProductEditInfo,
  setCachedUpdateProductEditInfo,
  getCachedUpdateProductCategoryInfo,
  setCachedUpdateProductCategoryInfo,
  invalidateUpdateProductForEdit,
  invalidateUpdateProductsByToken,
} from "@/services/cache/update_product_cache_service";
import {
  fetchProductsPagedByFlowToken,
  fetchProductPhotosByFlowToken,
  fetchProductEditInfoByFlowToken,
  fetchProductCategoryInfoByFlowToken,
  saveProductUpdate,
  type ProductListPage,
  type ProductPhotos,
  type ProductEditInfo,
  type ProductCategoryInfo,
} from "@/repositories/updateProduct/update_product_repo";
import {
  fetchAllProductCategories,
  fetchSubCategoriesByCategory,
} from "@/repositories/addProduct/product_category_repo";
import { convertTndPricesViaPlugin } from "@/repositories/addProduct/pricing_repo";
import { normText } from "@/utils/data_parser";

const inflightFetches = new Map<string, Promise<unknown>>();

function withInFlightDedup<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflightFetches.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = task().finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, run as Promise<unknown>);
  return run;
}

/**
 * Returns a page of the seller's products for the product list screen.
 */
export async function getSellerProductsPageByFlowToken(
  flowToken: string,
  page: number,
  pageSize: number,
): Promise<{ products: unknown[]; page: number; hasMore: boolean; nextPage: number }> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.min(5, Math.floor(pageSize))
    : 5;

  const cached = await getCachedUpdateProductsPage(flowToken, safePage, safePageSize);
  if (cached && Array.isArray(cached.products)) {
    return {
      products: cached.products,
      page: cached.page,
      hasMore: cached.hasMore,
      nextPage: cached.nextPage,
    };
  }

  const result = await fetchProductsPagedByFlowToken(flowToken, safePage, safePageSize);
  if (!result) return { products: [], page: 1, hasMore: false, nextPage: 1 };

  const totalPages = Math.ceil(result.total / safePageSize);
  const hasMore = safePage < totalPages;
  const nextPage = hasMore ? safePage + 1 : safePage;

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

  const response = { products, page: safePage, hasMore, nextPage };
  await setCachedUpdateProductsPage(flowToken, safePage, safePageSize, response);
  return response;
}

/**
 * Loads product photos for the edit screen.
 */
export async function loadProductPhotosForEditScreen(
  productId: string,
  flowToken: string,
): Promise<{ product_name: string; image_gallery: string[]; image_src: string } | null> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return null;

  const cached = await getCachedUpdateProductPhotos(tok, pid);
  if (cached) {
    return {
      product_name: normText(cached.product_name),
      image_gallery: Array.isArray(cached.image_gallery)
        ? (cached.image_gallery as string[]).map((v) => normText(v)).filter(Boolean)
        : [],
      image_src: normText(cached.image_src),
    };
  }

  return withInFlightDedup(`photos:${tok}:${pid}`, async () => {
    const photos = await fetchProductPhotosByFlowToken(tok, pid);
    if (!photos) return null;

    const imageGallery = Array.isArray(photos.image_urls) ? photos.image_urls : [];
    const result = {
      product_name: photos.product_name,
      image_gallery: imageGallery,
      image_src: imageGallery[0] ?? "",
    };
    await setCachedUpdateProductPhotos(tok, pid, result as any);
    return result;
  });
}

/**
 * Loads product edit info (pricing, dimensions, attributes) for the edit screen.
 */
export async function loadProductEditInfoForEditScreen(
  productId: string,
  flowToken: string,
): Promise<{
  product_name: string;
  regular_tnd: string;
  sale_tnd: string;
  regular_eur: string;
  sale_eur: string;
  stock: string;
  dim_unit: string;
  weight_unit: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  color: string;
  size: string;
} | null> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return null;

  const cached = await getCachedUpdateProductEditInfo(tok, pid);
  if (cached) {
    return {
      product_name: normText(cached.product_name),
      regular_tnd: normText(cached.regular_tnd),
      sale_tnd: normText(cached.sale_tnd),
      regular_eur: normText(cached.regular_eur),
      sale_eur: normText(cached.sale_eur),
      stock: normText(cached.stock),
      dim_unit: normText(cached.dim_unit),
      weight_unit: normText(cached.weight_unit),
      length: normText(cached.length),
      width: normText(cached.width),
      height: normText(cached.height),
      weight: normText(cached.weight),
      color: normText(cached.color),
      size: normText(cached.size),
    };
  }

  return withInFlightDedup(`edit:${tok}:${pid}`, async () => {
    const editInfo = await fetchProductEditInfoByFlowToken(tok, pid);
    if (!editInfo) return null;

    const result = {
      product_name: editInfo.product_name,
      regular_tnd: editInfo.regular_eur,
      sale_tnd: editInfo.sale_eur,
      regular_eur: editInfo.regular_eur,
      sale_eur: editInfo.sale_eur,
      stock: String(editInfo.stock ?? ""),
      dim_unit: editInfo.dim_unit,
      weight_unit: editInfo.weight_unit,
      length: editInfo.length,
      width: editInfo.width,
      height: editInfo.height,
      weight: editInfo.weight,
      color: editInfo.color,
      size: editInfo.size,
    };
    await setCachedUpdateProductEditInfo(tok, pid, result as any);
    return result;
  });
}

/**
 * Loads product category and subcategory info for the edit screen.
 */
export async function loadProductCategoryInfoForEditScreen(
  productId: string,
  flowToken: string,
): Promise<{
  category_id: string;
  subcategory_id: string;
  category_label: string;
  subcategory_label: string;
} | null> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return null;

  const cached = await getCachedUpdateProductCategoryInfo(tok, pid);
  if (cached) {
    return {
      category_id: normText(cached.category_id),
      subcategory_id: normText(cached.subcategory_id),
      category_label: normText(cached.category_label),
      subcategory_label: normText(cached.subcategory_label),
    };
  }

  return withInFlightDedup(`cat:${tok}:${pid}`, async () => {
    const cat = await fetchProductCategoryInfoByFlowToken(tok, pid);
    if (!cat) return null;

    const result = {
      category_id: cat.category_slug,
      subcategory_id: cat.subcategory_slug,
      category_label: cat.category_label || cat.category_name,
      subcategory_label: cat.subcategory_label || cat.subcategory_name,
    };
    await setCachedUpdateProductCategoryInfo(tok, pid, result as any);
    return result;
  });
}

/**
 * Loads subcategories for a category.
 */
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

/**
 * Prefetches categories for the update product flow.
 */
export async function prefetchUpdateProductData(): Promise<Record<string, unknown>> {
  try {
    const categories = await fetchAllProductCategories();
    return { categories };
  } catch {
    return { categories: [] };
  }
}

/**
 * Updates a product with the given changes.
 * Maps handler state keys → plugin payload keys.
 */
export async function updateProductNow(
  productId: string,
  flowToken: string,
  data: Record<string, any>,
): Promise<boolean> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return false;

  // Map handler state -> repository update state.
  const stateForUpdate = {
    product_id: pid,
    product_name: data.product_name,
    prix_regulier_tnd: Number(data.prix_regulier_tnd) || 0,
    prix_promo_tnd: Number(data.prix_promo_tnd) || 0,
    prix_regulier_eur: Number(data.prix_regulier_eur) || 0,
    prix_promo_eur: Number(data.prix_promo_eur) || 0,
    quantite: String(data.quantite ?? ""),
    longueur: Number(data.longueur) || undefined,
    largeur: Number(data.largeur) || undefined,
    profondeur: Number(data.profondeur) || undefined,
    unite_dimension: data.unite_dimension,
    valeur_poids: Number(data.valeur_poids) || undefined,
    unite_poids: data.unite_poids,
    couleur: data.couleur,
    taille: data.taille,
    product_category: data.product_category,
    product_subcategory: data.product_subcategory,
    images: Array.isArray(data.images) ? data.images : [],
  };

  const changedFields = new Set<string>([
    "product_name",
    "prix_regulier_tnd",
    "prix_promo_tnd",
    "prix_regulier_eur",
    "prix_promo_eur",
    "quantite",
    "longueur",
    "largeur",
    "profondeur",
    "unite_dimension",
    "valeur_poids",
    "unite_poids",
    "couleur",
    "taille",
    "product_category",
    "product_subcategory",
  ]);
  if (data.photos_modified && Array.isArray(data.images) && data.images.length > 0) {
    changedFields.add("images");
  }

  const result = await saveProductUpdate(tok, stateForUpdate as any, changedFields);
  if (!result.ok) return false;

  await invalidateUpdateProductsByToken(tok);
  await invalidateUpdateProductForEdit(tok, pid);
  return true;
}

