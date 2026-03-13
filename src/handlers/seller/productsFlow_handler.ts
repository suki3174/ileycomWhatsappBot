/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { ProductType } from "@/models/product_model";
import {
  getProductsForToken,
  getLastVariableProductId,
} from "@/repositories/poducts_cache";
import {
  getProductById,
  getVariationDetail,
  primeProductsAsync,
  rememberVariableProduct,
} from "@/services/products_service";
import {
  buildProductListResponse,
  buildVariableDetailData,
  formatSimplePrices,
  formatStock,
  formatVariationAttributes,
  formatVariationStock,
  normalizeFlowLabel,
  resolveFlowImageUrl,
  sanitizeRichText,
  toPositivePage,
} from "@/utils/products_flow_utils";
import { getFlowToken, paginateArray } from "@/utils/utilities";





// ---------------------------------------------------------------------------
// Screen handlers
// ---------------------------------------------------------------------------

async function enrichVisiblePageProducts(products: any[], page: number): Promise<any[]> {
  if (products.length === 0) return products;

  const { pageItems } = paginateArray(products, page, 5);
  const missingIds = pageItems
    .filter((product: any) => !String(product?.image_src || "").trim())
    .map((product: any) => String(product.id || "").trim())
    .filter(Boolean);

  if (missingIds.length === 0) return products;

  const resolvedById = new Map<string, any>();
  const concurrency = 2;

  for (let index = 0; index < missingIds.length; index += concurrency) {
    const batch = missingIds.slice(index, index + concurrency);
    const resolvedBatch = await Promise.all(
      batch.map(async (productId) => {
        const detailedProduct = await getProductById(productId);
        return detailedProduct ? [productId, detailedProduct] as const : undefined;
      }),
    );

    for (const entry of resolvedBatch) {
      if (!entry) continue;
      resolvedById.set(entry[0], entry[1]);
    }
  }

  if (resolvedById.size === 0) return products;

  return products.map((product: any) => {
    const productId = String(product?.id || "").trim();
    const detailedProduct = resolvedById.get(productId);
    if (!detailedProduct) return product;

    return {
      ...product,
      image_src: String(product?.image_src || detailedProduct.image_src || "").trim(),
      created_at: product?.created_at || detailedProduct.created_at || "",
      short_description: product?.short_description || detailedProduct.short_description || "",
      full_description: product?.full_description || detailedProduct.full_description || "",
      categories: Array.isArray(product?.categories) && product.categories.length > 0
        ? product.categories
        : detailedProduct.categories,
      tags: Array.isArray(product?.tags) && product.tags.length > 0
        ? product.tags
        : detailedProduct.tags,
    };
  });
}

async function handleProductList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const rawData = parsed.data || {};

  console.log("handleProductList rawData:", JSON.stringify(rawData));

  const mode = String(rawData.cmd ?? rawData.action ?? "").toLowerCase();
  const requestedPage = Number(rawData.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const products = await getProductsForToken(token);
  console.log (`Products for token ${token}:`, products);
  const enrichedProducts = await enrichVisiblePageProducts(products, page);

  // Noop — empty list item tapped
  if (mode === "noop") {
    return await buildProductListResponse(enrichedProducts, page);
  }

  // Paginate — re-render at new page
  if (mode === "paginate") {
    return await buildProductListResponse(enrichedProducts, page);
  }

  // Product tapped — navigate to detail
  if (mode === "details") {
    const selectedId = String(rawData.product_id ?? "").trim();

    console.log("details — product_id:", selectedId);

    if (!selectedId || selectedId === "empty" || selectedId.startsWith("nav_")) {
      return await buildProductListResponse(enrichedProducts, page);
    }

    const requestHost = String(rawData.__request_host || "").trim();
    const requestProto = String(rawData.__request_proto || "").trim();
    const mapImageUrl = (rawUrl: string) =>
      resolveFlowImageUrl(rawUrl, { requestHost, requestProto });

    const product =
      (await getProductById(selectedId)) ||
      enrichedProducts.find((p: any) => String(p.id) === selectedId);

      console.log("produit:",product)

    if (!product) {
      console.log("product not found:", selectedId);
      return await buildProductListResponse(enrichedProducts, page);
    }

    const categories = (product.categories || []).join(", ") || "Sans categorie";
    const dateCreation = product.created_at
      ? `Cree le: ${product.created_at}`
      : "Cree le: non renseigne";
    const tags = (product.tags ?? []).join(" · ") || "";

    if (product.type === ProductType.SIMPLE && !product.is_variable) {
      return {
        screen: "PRODUCT_DETAIL_SIMPLE",
        data: {
          name: normalizeFlowLabel(product.name),
          img: await mapImageUrl(product.image_src || ""),
          id_sku: `ID: ${product.id} | SKU: ${product.sku || "non renseigne"}`,
          short_desc: normalizeFlowLabel(sanitizeRichText(product.short_description || "Description courte non renseignee")),
          full_desc: normalizeFlowLabel(sanitizeRichText(product.full_description || "Description complete non renseignee")),
          prices: formatSimplePrices(product),
          stock_info: formatStock(product),
          categories: normalizeFlowLabel(categories),
          tags,
          date_creation: normalizeFlowLabel(dateCreation),
        },
      };
    }

    rememberVariableProduct(token, String(product.id));
    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: await buildVariableDetailData(product, mapImageUrl),
    };
  }

  // Default — initial load or unknown cmd
  return await buildProductListResponse(enrichedProducts, page);
}

async function handleVariationDetail(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const requestHost = String(data.__request_host || "").trim();
  const requestProto = String(data.__request_proto || "").trim();
  const mapImageUrl = (rawUrl: string) =>
    resolveFlowImageUrl(rawUrl, { requestHost, requestProto });

  if (data.confirm_action || data.error === "invalid-screen-transition") {
    const productId = String(
      data.product_id ?? data.parent_product_id ?? getLastVariableProductId(token) ?? "",
    ).trim();

    if (productId) {
      const product = await getProductById(productId);
            console.log("produit:",product)

      if (product) {
        rememberVariableProduct(token, String(product.id));
        return {
          screen: "PRODUCT_DETAIL_VARIABLE",
          data: await buildVariableDetailData(product, mapImageUrl),
        };
      }
    }

    return {
      screen: "VARIATION_DETAIL",
      data: { error_msg: "Impossible de revenir au produit. Reessayez." },
    };
  }

  const productId = String(
    data.product_id ?? data.parent_product_id ?? getLastVariableProductId(token) ?? "",
  ).trim();
  const variationId = String(
    data.variation_id ?? data.selected_variation_id ?? data.id ?? "",
  ).trim();

  if (!productId || !variationId) {
    return { screen: "PRODUCT_DETAIL_VARIABLE", data: { error_msg: "Variation ou produit manquant." } };
  }

  let variation = await getVariationDetail(productId, variationId);

  if (!variation) {
    const product = await getProductById(productId);
    variation = product?.variations?.find((v: any) => String(v.id) === String(variationId));
  }

  if (productId) rememberVariableProduct(token, productId);

  if (!variation) {
    return { screen: "PRODUCT_DETAIL_VARIABLE", data: { error_msg: "Variation introuvable." } };
  }

  let displaySku = String(variation.sku || "").trim();
  if (!displaySku && productId) {
    const parent = await getProductById(productId);
    displaySku = String(parent?.sku || "").trim();
  }

  return {
    screen: "VARIATION_DETAIL",
    data: {
      var_img: await mapImageUrl(variation.image_src || ""),
      var_id_sku: `ID: ${variation.id} | SKU: ${displaySku || "non renseigne"}`,
      stock: formatVariationStock(variation),
      attr: normalizeFlowLabel(formatVariationAttributes(variation.attributes)),
      price_euro: variation.price_euro || "Prix non renseigne",
      price_tnd: variation.price_tnd || "",
    },
  };
}

async function handleSimpleDetail(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const page = toPositivePage(data.current_page ?? data.page) ?? 1;

  return handleProductList({
    ...parsed,
    screen: "PRODUCT_LIST",
    data: { ...data, cmd: "paginate", page },
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleProductsFlow(
  parsed: FlowRequest,
): Promise<FlowResponse | null> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";

  if (action === "INIT" || action === "NAVIGATE") {
    const token = getFlowToken(parsed);
    if (token) primeProductsAsync(token);
    console.log("PLUGIN_BASE_URL env:", process.env.WP_PLUGIN_BASE_URL);
    return { screen: "WELCOME_SCREEN", data: {} };
  }

  if (action === "DATA_EXCHANGE") {
    if (!screen) return handleProductList(parsed);

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
        return { screen: "WELCOME_SCREEN", data: {} };
    }
  }

  return { screen: "WELCOME_SCREEN", data: {} };
}

export default handleProductsFlow;