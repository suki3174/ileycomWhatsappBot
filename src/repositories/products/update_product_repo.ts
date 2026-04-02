import { pluginPost } from "@/utils/plugin_client";
import {
  parsePluginJsonSafe,
  asRecord,
  normText,
  toNum,
  toBool,
} from "@/utils/data_parser";

// ---------------------------------------------------------------------------
// Shapes returned by each PHP endpoint
// ---------------------------------------------------------------------------

export type ProductListItem = {
  id: number;
  name: string;
  sku: string;
  price_eur: string;
  price_tnd: string;
  stock: number;
  post_status: string;
  image_url: string;
};

export type ProductListPage = {
  total: number;
  products: ProductListItem[];
};

export type ProductPhotos = {
  product_id: number;
  product_name: string;
  image_urls: string[];
};

export type ProductEditInfo = {
  product_id: number;
  product_name: string;
  regular_eur: string;
  sale_eur: string;
  regular_tnd: string;
  sale_tnd: string;
  stock: number;
  manage_stock: boolean;
  length: string;
  width: string;
  height: string;
  dim_unit: string;
  weight: string;
  weight_unit: string;
  color: string;
  size: string;
};

export type ProductCategoryInfo = {
  product_id: number;
  category_slug: string;
  category_name: string;
  category_label: string;
  subcategory_slug: string;
  subcategory_name: string;
  subcategory_label: string;
};

// ---------------------------------------------------------------------------
// EP1 — Paginated product list
// ---------------------------------------------------------------------------

export async function fetchProductsPagedByFlowToken(
  flowToken: string,
  page: number,
  limit: number,
): Promise<ProductListPage | null> {
  try {
    const res = await pluginPost("/seller/product/list-paged/by-flow-token", {
      flow_token: flowToken,
      page,
      limit,
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductsPagedByFlowToken");
    if (!payload) return null;
    const data = asRecord(payload.data);
    if (!data) return null;

    const rawProducts = Array.isArray(data.products) ? data.products : [];
    const products: ProductListItem[] = rawProducts.map((item: unknown) => {
      const r = asRecord(item) ?? {};
      return {
        id: toNum(r.id, 0),
        name: normText(r.name),
        sku: normText(r.sku),
        price_eur: normText(r.price_eur),
        price_tnd: normText(r.price_tnd),
        stock: toNum(r.stock, 0),
        post_status: normText(r.post_status),
        image_url: normText(r.image_url),
      };
    });

    return { total: toNum(data.total, 0), products };
  } catch (err) {
    console.error("fetchProductsPagedByFlowToken error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// EP2 — Photos screen
// ---------------------------------------------------------------------------

export async function fetchProductPhotosByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductPhotos | null> {
  try {
    const res = await pluginPost("/seller/product/photos/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductPhotosByFlowToken");
    if (!payload) return null;
    const data = asRecord(payload.data);
    if (!data) return null;

    const urls = Array.isArray(data.image_urls)
      ? (data.image_urls as unknown[]).map((u) => normText(u)).filter(Boolean)
      : [];

    return {
      product_id: toNum(data.product_id, 0),
      product_name: normText(data.product_name),
      image_urls: urls,
    };
  } catch (err) {
    console.error("fetchProductPhotosByFlowToken error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// EP3 — Edit-info screen
// ---------------------------------------------------------------------------

export async function fetchProductEditInfoByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductEditInfo | null> {
  try {
    const res = await pluginPost("/seller/product/edit-info/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductEditInfoByFlowToken");
    if (!payload) return null;
    const d = asRecord(payload.data);
    if (!d) return null;

    const regularEur = normText(d.regular_eur || d.regular_price_eur || d.price_eur || d._regular_price);
    const saleEur = normText(d.sale_eur || d.sale_price_eur || d._sale_price);
    const regularTnd = normText(d.regular_tnd || d.regular_price_tnd || d.price_tnd || d._regular_price_tnd);
    const saleTnd = normText(d.sale_tnd || d.sale_price_tnd || d._sale_price_tnd);
    const stockRaw = d.stock ?? d.stock_quantity ?? d.quantity ?? d._stock;

    return {
      product_id: toNum(d.product_id, 0),
      product_name: normText(d.product_name),
      regular_eur: regularEur,
      sale_eur: saleEur,
      regular_tnd: regularTnd,
      sale_tnd: saleTnd,
      stock: toNum(stockRaw, 0),
      manage_stock: toBool(d.manage_stock),
      length: normText(d.length || d.longueur),
      width: normText(d.width || d.largeur),
      height: normText(d.height || d.profondeur || d.depth),
      dim_unit: normText(d.dim_unit || d.dimension_unit) || "cm",
      weight: normText(d.weight || d.poids),
      weight_unit: normText(d.weight_unit || d.poids_unit || d.weight_measure) || "kg",
      color: normText(d.color || d.couleur),
      size: normText(d.size || d.taille),
    };
  } catch (err) {
    console.error("fetchProductEditInfoByFlowToken error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// EP4 — Category-info screen
// ---------------------------------------------------------------------------

export async function fetchProductCategoryInfoByFlowToken(
  flowToken: string,
  productId: string,
): Promise<ProductCategoryInfo | null> {
  try {
    const res = await pluginPost("/seller/product/category-info/by-flow-token", {
      flow_token: flowToken,
      product_id: Number(productId),
    });
    const payload = await parsePluginJsonSafe(res, "fetchProductCategoryInfoByFlowToken");
    if (!payload) return null;
    const d = asRecord(payload.data);
    if (!d) return null;

    return {
      product_id: toNum(d.product_id, 0),
      category_slug: normText(d.category_slug),
      category_name: normText(d.category_name),
      category_label: normText(d.category_label),
      subcategory_slug: normText(d.subcategory_slug),
      subcategory_name: normText(d.subcategory_name),
      subcategory_label: normText(d.subcategory_label),
    };
  } catch (err) {
    console.error("fetchProductCategoryInfoByFlowToken error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// EP5 — Apply update
// ---------------------------------------------------------------------------

export async function persistProductUpdate(
  flowToken: string,
  productId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await pluginPost(
      "/seller/product/update/by-flow-token",
      { flow_token: flowToken, product_id: Number(productId), data },
      { timeoutMs: 30_000 },
    );
    const payload = await parsePluginJsonSafe(res, "persistProductUpdate");
    if (!payload) return false;
    return toBool(payload.success) && toBool(asRecord(payload.data)?.updated);
  } catch (err) {
    console.error("persistProductUpdate error:", err);
    return false;
  }
}
