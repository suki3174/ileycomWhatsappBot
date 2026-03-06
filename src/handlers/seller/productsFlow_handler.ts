import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { ProductType } from "@/models/product_model";
import { getProductsForToken } from "@/repositories/poducts_cache";
import {
  getProductById,
  getVariationDetail,
  primeProductsAsync,
} from "@/services/products_service";
import{formatSimplePrices,formatStock, getFlowToken}from  "@/utils/utilities"



const PAGE_SIZE = 5;

/* -------------------------------- */
/* PRODUCT LIST */
/* -------------------------------- */

async function handleProductList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const mode = String(data.action || "").toLowerCase();
  const requestedPage = Number(data.page ?? 1);
  let page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedId = String(data.product_id ?? "").trim();

  // Fast path for product click: fetch detail directly and avoid list fetch latency.
  if (selectedId) {
    const detailedProduct = await getProductById(selectedId);
    const product =
      detailedProduct ||
      (await getProductsForToken(token)).find((p) => String(p.id) === selectedId);

    if (!product) {
      return {
        screen: "PRODUCT_LIST",
        data: {
          error_msg: "Produit introuvable.",
          products: [],
          current_page: 1,
          has_next: false,
          has_prev: false,
        },
      };
    }

    const categories = (product.categories || []).join(", ") || "Sans categorie";
    const dateCreation = product.created_at
      ? `Cree le: ${product.created_at}`
      : "Cree le: non renseigne";

    if (product.type === ProductType.SIMPLE && !product.is_variable) {
      return {
        screen: "PRODUCT_DETAIL_SIMPLE",
        data: {
          name: product.name,
          img: product.image_src,
          id_sku: `ID: ${product.id} | SKU: ${product.sku}`,
          short_desc: product.short_description || "Description courte non renseignee",
          full_desc: product.full_description || "Description complete non renseignee",
          prices: formatSimplePrices(product),
          stock_info: formatStock(product),
          categories,
          date_creation: dateCreation,
        },
      };
    }

    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: {
        name: product.name,
        img: product.image_src,
        id_sku: `ID: ${product.id} | SKU: ${product.sku}`,
        short_desc: product.short_description || "Description courte non renseignee",
        full_desc: product.full_description || "Description complete non renseignee",
        categories,
        date_creation: dateCreation,
        product_id: product.id,
        variations:
          product.variations?.map((v) => ({
            id: String(v.id),
            title: v.title,
          })) ?? [],
      },
    };
  }

  const products = await getProductsForToken(token);

  const listItems = products.map((p) => ({
    id: String(p.id),
    title: p.name,
  }));

  if (listItems.length === 0) {
    return {
      screen: "PRODUCT_LIST",
      data: {
        error_msg: "Auccun produit a afficher",
        products: [],
        current_page: 1,
        has_next: false,
        has_prev: false,
      },
    };
  }

  const totalItems = listItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (page > totalPages) page = totalPages;

  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = listItems.slice(startIndex, startIndex + PAGE_SIZE);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const baseListData = {
    error_msg: "",
    products: pageItems,
    current_page: page,
    has_next: hasNext,
    has_prev: hasPrev,
  };

  // Pagination actions and empty actions keep list when no product was selected.
  if (mode === "paginate" || !mode) {
    return {
      screen: "PRODUCT_LIST",
      data: baseListData,
    };
  }

  return {
    screen: "PRODUCT_LIST",
    data: baseListData,
  };
}

/* -------------------------------- */
/* VARIATION DETAIL */
/* -------------------------------- */

async function handleVariationDetail(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const data = parsed.data || {};

  const productId = String(
    data.product_id ?? data.parent_product_id ?? "",
  ).trim();
  const variationId = String(
    data.variation_id ?? data.selected_variation_id ?? data.id ?? "",
  ).trim();

  if (!productId || !variationId) {
    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: {
        error_msg: "Variation ou produit manquant.",
      },
    };
  }

  let variation = await getVariationDetail(productId, variationId);

  // Fallback: reuse product detail payload when variation endpoint misses.
  if (!variation) {
    const product = await getProductById(productId);
    variation = product?.variations?.find(
      (v) => String(v.id) === String(variationId),
    );
  }

  if (!variation) {
    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: {
        error_msg: "Variation introuvable.",
      },
    };
  }

  const attrParts: string[] = [];

  if (variation.attributes?.weight) {
    attrParts.push(`Poids: ${variation.attributes.weight}`);
  }
  if (variation.attributes?.size) {
    attrParts.push(`Taille: ${variation.attributes.size}`);
  }

  return {
    screen: "VARIATION_DETAIL",
    data: {
      var_img: variation.image_src,
      var_id_sku: `ID: ${variation.id} | SKU: ${variation.sku}`,
      stock: variation.stock > 0 ? "En stock" : "Rupture de stock",
      attr: attrParts.join(" | ") || "Attributs non précisés",
      price_euro: variation.price_euro,
      price_tnd: variation.price_tnd,
    },
  };
}

/* -------------------------------- */
/* MAIN HANDLER */
/* -------------------------------- */

export async function handleProductsFlow(
  parsed: FlowRequest,
): Promise<FlowResponse | null> {
  const rawAction = parsed.action || "";
  const action = rawAction.toUpperCase();
  const screen = parsed.screen || "";

  // INIT / NAVIGATE: warm up product list for this seller without blocking Meta.
  if (action === "INIT" || action === "NAVIGATE") {
    const token = getFlowToken(parsed);
    if (token) {
      primeProductsAsync(token);
    }

    // Initial screen is the static WELCOME_SCREEN defined in the flow JSON.
    return {
      screen: "WELCOME_SCREEN",
      data: {},
    };
  }

  if (action === "DATA_EXCHANGE") {
    switch (screen) {
      case "WELCOME_SCREEN":
      case "PRODUCT_LIST":
        return handleProductList(parsed);
      case "PRODUCT_DETAIL_SIMPLE":
      case "PRODUCT_DETAIL_VARIABLE":
      case "VARIATION_DETAIL":
        return handleVariationDetail(parsed);
      default:
        return {
          screen: "WELCOME_SCREEN",
          data: {},
        };
    }
  }

  return {
    screen: "WELCOME_SCREEN",
    data: {},
  };
}

export default handleProductsFlow;

