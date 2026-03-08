import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { ProductType, type ProductVariation } from "@/models/product_model";
import {
  getProductsForToken,
  getProductsPageCursor,
  getLastVariableProductId,
  setLastVariableProductId,
  setProductsPageCursor,
} from "@/repositories/poducts_cache";
import {
  getProductById,
  getVariationDetail,
  primeProductsAsync,
} from "@/services/products_service";
import {
  normalizeFlowLabel,
  resolveFlowImageUrl,
  resolvePageValue,
  sanitizeRichText,
  toPositivePage,
} from "@/utils/products_flow_utils";
import { formatSimplePrices, formatStock, getFlowToken } from "@/utils/utilities";

const PAGE_SIZE = 5;

function buildVariableDetailData(product: {
  id: string;
  name: string;
  sku?: string;
  image_src?: string;
  short_description?: string;
  full_description?: string;
  categories?: string[];
  created_at?: string;
  variations?: Array<{ id: string | number; title: string }>;
}, mapImageUrl: (rawUrl: string) => string) {
  const categories = (product.categories || []).join(", ") || "Sans categorie";
  const dateCreation = product.created_at
    ? `Cree le: ${product.created_at}`
    : "Cree le: non renseigne";

  return {
    name: normalizeFlowLabel(product.name),
    img: mapImageUrl(product.image_src || ""),
    id_sku: `ID: ${product.id} | SKU: ${product.sku || ""}`,
    short_desc: normalizeFlowLabel(
      sanitizeRichText(
        product.short_description || "Description courte non renseignee",
      ),
    ),
    full_desc: normalizeFlowLabel(
      sanitizeRichText(
        product.full_description || "Description complete non renseignee",
      ),
    ),
    categories: normalizeFlowLabel(categories),
    date_creation: normalizeFlowLabel(dateCreation),
    product_id: product.id,
    variations:
      product.variations?.map((v) => ({
        id: String(v.id),
        title: normalizeFlowLabel(v.title),
      })) ?? [],
  };
}

function rememberVariableProduct(token: string, productId: string): void {
  setLastVariableProductId(token, productId);
}

function formatVariationStock(variation: ProductVariation): string {
  const stockStatus = String(variation.stock_status || "").toLowerCase();
  const managesStock = variation.manage_stock === true;

  if (managesStock) {
    if (variation.stock > 0) return `${variation.stock} en stock`;
    return "Rupture de stock";
  }

  if (stockStatus === "instock") return "En stock";
  if (stockStatus === "onbackorder") return "Disponible sur commande";
  if (stockStatus === "outofstock") return "Rupture de stock";

  return variation.stock > 0 ? `${variation.stock} en stock` : "Stock non renseigne";
}

function formatVariationAttributes(
  attrs: ProductVariation["attributes"] | undefined,
): string {
  if (!attrs) return "Attributs non precises";

  const parts = Object.entries(attrs)
    .map(([rawKey, rawValue]) => {
      const key = String(rawKey || "").trim();
      const value = String(rawValue || "").trim();
      if (!key || !value) return "";
      const label = key.replace(/[_-]+/g, " ");
      const pretty = label.charAt(0).toUpperCase() + label.slice(1);
      return `${pretty}: ${value}`;
    })
    .filter(Boolean);

  return parts.join(" | ") || "Attributs non precises";
}

/* -------------------------------- */
/* PRODUCT LIST */
/* -------------------------------- */

async function handleProductList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const requestHost = String(data.__request_host || "").trim();
  const requestProto = String(data.__request_proto || "").trim();
  const mapImageUrl = (rawUrl: string) =>
    resolveFlowImageUrl(rawUrl, {
      requestHost,
      requestProto,
    });

  // Accept multiple key contracts because WhatsApp flow payload shape can vary
  // between button types (NavigationList vs action buttons).
  const mode = String(data.cmd ?? data.action ?? data.user_action ?? "").toLowerCase();
  const currentPage = toPositivePage(data.current_page) ?? getProductsPageCursor(token) ?? 1;
  const nextPage = toPositivePage(data.next_page);
  const prevPage = toPositivePage(data.prev_page);
  const explicitPage = resolvePageValue(data.page, currentPage, nextPage, prevPage);

  let page = explicitPage ?? 1;
  const selectedId = String(data.product_id ?? "").trim();

  // Support nav pseudo IDs if flow sends them as selected product id.
  if (selectedId === "nav_next") {
    page = nextPage ?? currentPage + 1;
  } else if (selectedId === "nav_prev") {
    page = prevPage ?? Math.max(1, currentPage - 1);
  } else if (!explicitPage) {
    // If no explicit page was sent, use computed navigation hints when available.
    if (mode === "paginate" && nextPage) {
      page = nextPage;
    } else if (mode === "paginate" && prevPage) {
      page = prevPage;
    } else if (mode.includes("next")) {
      page = nextPage ?? currentPage + 1;
    } else if (mode.includes("prev")) {
      page = prevPage ?? Math.max(1, currentPage - 1);
    }
  }

  // Fast path for product click: fetch detail directly and avoid list fetch latency.
  // Ignore nav pseudo IDs which are pagination controls, not real product ids.
  if (selectedId && selectedId !== "nav_next" && selectedId !== "nav_prev") {
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
          name: normalizeFlowLabel(product.name),
          img: mapImageUrl(product.image_src || ""),
          id_sku: `ID: ${product.id} | SKU: ${product.sku}`,
          short_desc: normalizeFlowLabel(
            sanitizeRichText(
              product.short_description || "Description courte non renseignee",
            ),
          ),
          full_desc: normalizeFlowLabel(
            sanitizeRichText(
              product.full_description || "Description complete non renseignee",
            ),
          ),
          prices: formatSimplePrices(product),
          stock_info: formatStock(product),
          categories: normalizeFlowLabel(categories),
          date_creation: normalizeFlowLabel(dateCreation),
        },
      };
    }

    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: (() => {
        rememberVariableProduct(token, String(product.id));
        return buildVariableDetailData(product, mapImageUrl);
      })(),
    };
  }

  const products = await getProductsForToken(token);

  const listItems = products.map((p) => ({
    id: String(p.id),
    title: normalizeFlowLabel(p.name),
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

  // Persist page cursor to support expression payloads like
  // "${data.current_page} + 1" where the client does not send resolved numbers.
  setProductsPageCursor(token, page);

  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = listItems.slice(startIndex, startIndex + PAGE_SIZE);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const baseListData = {
    error_msg: "",
    products: pageItems,
    current_page: page,
    next_page: page + 1,
    prev_page: Math.max(1, page - 1),
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
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const requestHost = String(data.__request_host || "").trim();
  const requestProto = String(data.__request_proto || "").trim();
  const mapImageUrl = (rawUrl: string) =>
    resolveFlowImageUrl(rawUrl, {
      requestHost,
      requestProto,
    });

  if (data.confirm_action || data.error === "invalid-screen-transition") {
    const productId = String(
      data.product_id ?? data.parent_product_id ?? getLastVariableProductId(token) ?? "",
    ).trim();

    // Respect routing model: go back to PRODUCT_DETAIL_VARIABLE from VARIATION_DETAIL.
    if (productId) {
      const product = await getProductById(productId);
      if (product) {
        rememberVariableProduct(token, String(product.id));
        return {
          screen: "PRODUCT_DETAIL_VARIABLE",
          data: buildVariableDetailData(product, mapImageUrl),
        };
      }
    }

    // If product context is missing, stay on current screen to avoid invalid transitions.
    return {
      screen: "VARIATION_DETAIL",
      data: {
        error_msg: "Impossible de revenir au produit. Reessayez.",
      },
    };
  }

  const productId = String(
    data.product_id ?? data.parent_product_id ?? getLastVariableProductId(token) ?? "",
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

  if (productId) {
    rememberVariableProduct(token, productId);
  }

  if (!variation) {
    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: {
        error_msg: "Variation introuvable.",
      },
    };
  }

  let displaySku = String(variation.sku || "").trim();
  if (!displaySku && productId) {
    const parent = await getProductById(productId);
    displaySku = String(parent?.sku || "").trim();
  }

  return {
    screen: "VARIATION_DETAIL",
    data: {
      var_img: mapImageUrl(variation.image_src || ""),
      var_id_sku: `ID: ${variation.id} | SKU: ${displaySku || "non renseigne"}`,
      stock: formatVariationStock(variation),
      attr: normalizeFlowLabel(formatVariationAttributes(variation.attributes)),
      price_euro: variation.price_euro || "Prix non renseigne",
      price_tnd: variation.price_tnd || "",
    },
  };
}

async function handleSimpleDetail(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const data = parsed.data || {};

  // Close/back actions from simple detail should return to list, not variation.
  if (data.confirm_action || data.error === "invalid-screen-transition") {
    const fallbackPage = toPositivePage(data.current_page ?? data.page) ?? 1;
    return handleProductList({
      ...parsed,
      screen: "PRODUCT_LIST",
      data: {
        ...data,
        cmd: "paginate",
        page: fallbackPage,
      },
    });
  }

  return handleProductList({
    ...parsed,
    screen: "PRODUCT_LIST",
    data: {
      ...data,
      cmd: "paginate",
      page: toPositivePage(data.current_page ?? data.page) ?? 1,
    },
  });
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
    // Some clients can send DATA_EXCHANGE with an empty screen value.
    // Treat it as list navigation to avoid bouncing back to WELCOME_SCREEN.
    if (!screen) {
      return handleProductList(parsed);
    }

    switch (screen) {
      case "WELCOME_SCREEN":
      case "PRODUCT_LIST":
        return handleProductList(parsed);
      case "PRODUCT_DETAIL_SIMPLE":
        return handleSimpleDetail(parsed);
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

