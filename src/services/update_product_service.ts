import {
  fetchProductsPagedByFlowToken,
  fetchProductPhotosByFlowToken,
  fetchProductEditInfoByFlowToken,
  fetchProductCategoryInfoByFlowToken,
  persistProductUpdate,
} from "@/repositories/products/update_product_repo";
import {
  getCachedUpdateProductForEdit,
  getCachedUpdateProductCategoryInfo,
  getCachedUpdateProductEditInfo,
  getCachedUpdateProductPhotos,
  getCachedUpdateProductsPage,
  invalidateUpdateProductForEdit,
  invalidateUpdateProductsByToken,
  setCachedUpdateProductForEdit,
  setCachedUpdateProductCategoryInfo,
  setCachedUpdateProductEditInfo,
  setCachedUpdateProductPhotos,
  setCachedUpdateProductsPage,
} from "@/services/cache/update_product_cache_service";
import {
  fetchAllProductCategories,
  fetchSubCategoriesByCategory,
} from "@/repositories/addProduct/product_category_repo";
import { normText } from "@/utils/data_parser";

const inflightFetches = new Map<string, Promise<unknown>>();
const submitInflight = new Map<string, Promise<boolean>>();
const submitSuccessCache = new Map<string, number>();
const SUBMIT_SUCCESS_TTL_MS = 2 * 60 * 1000;

function withInFlightDedup<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflightFetches.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = task().finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, run as Promise<unknown>);
  return run;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`);
  return `{${entries.join(",")}}`;
}

function normalizeForComparison(value: unknown): string {
  return normText(value).toLowerCase();
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  return normalizeForComparison(actual) === normalizeForComparison(expected);
}

async function verifyPersistedUpdate(
  flowToken: string,
  productId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const [editInfo, categoryInfo] = await Promise.all([
    fetchProductEditInfoByFlowToken(flowToken, productId),
    fetchProductCategoryInfoByFlowToken(flowToken, productId),
  ]);
  if (!editInfo) return false;

  const editChecks: Array<[unknown, unknown]> = [
    [editInfo.product_name, payload.name],
    [editInfo.regular_tnd, payload.regular_tnd],
    [editInfo.sale_tnd, payload.sale_tnd],
    [editInfo.regular_eur, payload.regular_eur],
    [editInfo.sale_eur, payload.sale_eur],
    [String(editInfo.stock ?? ""), payload.stock],
    [editInfo.length, payload.length],
    [editInfo.width, payload.width],
    [editInfo.height, payload.height],
    [editInfo.dim_unit, payload.dim_unit],
    [editInfo.weight, payload.weight],
    [editInfo.weight_unit, payload.weight_unit],
    [editInfo.color, payload.color],
    [editInfo.size, payload.size],
  ];

  for (const [actual, expected] of editChecks) {
    if (!valuesMatch(actual, expected)) return false;
  }

  const requestedCategory = normText(payload.category_id);
  const requestedSubcategory = normText(payload.subcategory_id);
  if (categoryInfo && requestedCategory && !valuesMatch(categoryInfo.category_slug, requestedCategory)) {
    return false;
  }
  if (categoryInfo && requestedSubcategory && !valuesMatch(categoryInfo.subcategory_slug, requestedSubcategory)) {
    return false;
  }

  return true;
}

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
  category_id?: string;
  subcategory_id?: string;
  category_label?: string;
  subcategory_label?: string;
  image_gallery?: string[];
  image_src?: string;
};

export type ProductPhotosForEditScreen = {
  product_name: string;
  image_gallery: string[];
  image_src: string;
};

export type ProductEditInfoForEditScreen = {
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
};

export type ProductCategoryInfoForEditScreen = {
  category_id: string;
  subcategory_id: string;
  category_label: string;
  subcategory_label: string;
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
  const cached = await getCachedUpdateProductsPage(flowToken, page, pageSize);
  if (cached && Array.isArray(cached.products)) {
    return {
      products: cached.products,
      page: cached.page,
      hasMore: cached.hasMore,
      nextPage: cached.nextPage,
    };
  }

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

  const response = { products, page, hasMore, nextPage };
  await setCachedUpdateProductsPage(flowToken, page, pageSize, response);
  return response;
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

  const cached = await getCachedUpdateProductForEdit(tok, pid);
  if (cached) {
    return cached as ProductForEdit;
  }

  const [photos, editInfo, catInfo] = await Promise.all([
    fetchProductPhotosByFlowToken(tok, pid),
    fetchProductEditInfoByFlowToken(tok, pid),
    fetchProductCategoryInfoByFlowToken(tok, pid),
  ]);

  if (!editInfo) return null;

  const imageGallery = photos?.image_urls ?? [];

  const merged = {
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
    category_id: catInfo?.category_slug ?? "",
    subcategory_id: catInfo?.subcategory_slug ?? "",
    category_label: catInfo?.category_label ?? "",
    subcategory_label: catInfo?.subcategory_label ?? "",
    image_gallery: imageGallery,
    image_src: imageGallery[0] ?? "",
  };

  await setCachedUpdateProductForEdit(tok, pid, merged);
  return merged;
}

export async function loadProductPhotosForEditScreen(
  productId: string,
  flowToken: string,
): Promise<ProductPhotosForEditScreen | null> {
  const pid = normText(productId);
  const tok = normText(flowToken);
  if (!pid || !tok) return null;

  const cached = await getCachedUpdateProductPhotos(tok, pid);
  if (cached) {
    return {
      product_name: normText(cached.product_name),
      image_gallery: Array.isArray(cached.image_gallery)
        ? cached.image_gallery.map((value) => normText(value)).filter(Boolean)
        : [],
      image_src: normText(cached.image_src),
    };
  }

  return withInFlightDedup(`photos:${tok}:${pid}`, async () => {
    const photos = await fetchProductPhotosByFlowToken(tok, pid);
    if (!photos) return null;

    const imageGallery = Array.isArray(photos.image_urls) ? photos.image_urls : [];
    const value: ProductPhotosForEditScreen = {
      product_name: photos.product_name,
      image_gallery: imageGallery,
      image_src: imageGallery[0] ?? "",
    };
    await setCachedUpdateProductPhotos(tok, pid, value as unknown as Record<string, unknown>);
    return value;
  });
}

export async function loadProductEditInfoForEditScreen(
  productId: string,
  flowToken: string,
): Promise<ProductEditInfoForEditScreen | null> {
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

    const value: ProductEditInfoForEditScreen = {
      product_name: editInfo.product_name,
      regular_tnd: editInfo.regular_tnd,
      sale_tnd: editInfo.sale_tnd,
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
    await setCachedUpdateProductEditInfo(tok, pid, value as unknown as Record<string, unknown>);
    return value;
  });
}

export async function loadProductCategoryInfoForEditScreen(
  productId: string,
  flowToken: string,
): Promise<ProductCategoryInfoForEditScreen | null> {
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

    const value: ProductCategoryInfoForEditScreen = {
      category_id: cat.category_slug,
      subcategory_id: cat.subcategory_slug,
      category_label: cat.category_label || cat.category_name,
      subcategory_label: cat.subcategory_label || cat.subcategory_name,
    };
    await setCachedUpdateProductCategoryInfo(tok, pid, value as unknown as Record<string, unknown>);
    return value;
  });
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

  const submitKey = `submit:${tok}:${pid}:${stableSerialize(payload)}`;
  const cachedSuccessUntil = submitSuccessCache.get(submitKey) ?? 0;
  if (cachedSuccessUntil > Date.now()) {
    return true;
  }

  const inflight = submitInflight.get(submitKey);
  if (inflight) {
    return inflight;
  }

  const run = (async (): Promise<boolean> => {
    const updated = await persistProductUpdate(tok, pid, payload);
    let ok = updated;

    if (!ok) {
      // If plugin update timed out but was committed, verify by reading latest values.
      ok = await verifyPersistedUpdate(tok, pid, payload);
    }

    if (ok) {
      submitSuccessCache.set(submitKey, Date.now() + SUBMIT_SUCCESS_TTL_MS);
      await invalidateUpdateProductsByToken(tok);
      await invalidateUpdateProductForEdit(tok, pid);
    }

    return ok;
  })().finally(() => {
    submitInflight.delete(submitKey);
  });

  submitInflight.set(submitKey, run);
  return run;
}
