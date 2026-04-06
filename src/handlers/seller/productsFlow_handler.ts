/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { ProductType } from "@/models/product_model";
import { validateSellerFlowAccess } from "@/services/auth_service";
import {
  getProductById,
  getSellerProductsPageByFlowToken,
  getVariationDetail,
  primeProductsAsync,
  rememberVariableProduct,
} from "@/services/products_service";
import {
  getProductSimpleScreenCache,
  getProductsPageScreenCache,
  getProductVariableScreenCache,
  getVariationScreenCache,
  writeProductSimpleScreenCache,
  writeProductsPageScreenCache,
  writeProductVariableScreenCache,
  writeVariationScreenCache,
} from "@/services/cache/products_cache_service";
import {
  buildProductCarouselImages,
  buildProductListPagedResponse,
  buildVariableDetailData,
  formatPromoPrices,
  formatSimplePrices,
  formatStock,
  formatVariationAttributes,
  formatVariationStock,
  normalizeFlowLabel,
  resolveFlowImageUrl,
  sanitizeRichText,
  
} from "@/utils/product_flow_renderer";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";
import { getFlowToken } from "@/utils/core_utils";






// ---------------------------------------------------------------------------
// Screen handlers
// ---------------------------------------------------------------------------

async function handleProductList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const rawData = parsed.data || {};

  console.log("handleProductList rawData:", JSON.stringify(rawData));

  const mode = String(rawData.cmd ?? rawData.action ?? "").toLowerCase();
  const requestedPage = Number(rawData.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  let pageResultPromise:
    | Promise<Awaited<ReturnType<typeof getSellerProductsPageByFlowToken>>>
    | undefined;

  const getPageResult = async () => {
    if (!pageResultPromise) {
      pageResultPromise = getSellerProductsPageByFlowToken(token, page, 5);
    }
    return await pageResultPromise;
  };

  const renderPage = async (): Promise<FlowResponse> => {
    const cached = await getProductsPageScreenCache(token, page, 5);
    if (cached) return cached;

    const pageResult = await getPageResult();
    const built = await buildProductListPagedResponse(
      pageResult.products,
      pageResult.page,
      pageResult.hasMore,
      pageResult.nextPage,
    );
    await writeProductsPageScreenCache(token, pageResult.page, 5, built);
    return built;
  };

  // Noop — empty list item tapped
  if (mode === "noop") {
    return await renderPage();
  }

  // Paginate — re-render at new page
  if (mode === "paginate") {
    return await renderPage();
  }

  // Product tapped — navigate to detail
  if (mode === "details") {
    const selectedId = String(rawData.product_id ?? "").trim();

    console.log("details — product_id:", selectedId);

    if (!selectedId || selectedId === "empty" || selectedId.startsWith("nav_")) {
      return await renderPage();
    }

    const requestHost = String(rawData.__request_host || "").trim();
    const requestProto = String(rawData.__request_proto || "").trim();
    const mapImageUrl = (rawUrl: string) =>
      resolveFlowImageUrl(rawUrl, { requestHost, requestProto });

    const product =
      (await getProductById(selectedId)) ||
      (await getPageResult()).products.find((p: any) => String(p.id) === selectedId);

    console.log("produit:", product)

    if (!product) {
      console.log("product not found:", selectedId);
      return await renderPage();
    }

    const categories = (product.categories || []).join(", ") || "Sans categorie";
    const dateCreation = product.created_at
      ? `Cree le: ${product.created_at}`
      : "Cree le: non renseigne";
    const tags = (product.tags ?? []).join(" · ") || "";

    if (product.type === ProductType.SIMPLE && !product.is_variable) {
      const cachedSimple = await getProductSimpleScreenCache(token, selectedId);
      if (cachedSimple) return cachedSimple;

      const image = await mapImageUrl(product.image_src || "");
      const carouselImages = await buildProductCarouselImages(
        product.image_gallery,
        product.image_src,
        `Image principale de ${product.name || "produit"}`,
        mapImageUrl

      );

      const response: FlowResponse = {
        screen: "PRODUCT_DETAIL_SIMPLE",
        data: {
          name: normalizeFlowLabel(product.name),
          img: image,
          carousel_images: carouselImages,
          id_sku: `ID: ${product.id} | SKU: ${product.sku || "non renseigne"}`,
          short_desc: normalizeFlowLabel(
            sanitizeRichText(
              product.short_description ||
              "Description courte non renseignee",
            ),
          ),
          full_desc: normalizeFlowLabel(
            sanitizeRichText(
              product.full_description ||
              "Description complete non renseignee",
            ),
          ),
          prices: formatSimplePrices(product),
          promo_prices:formatPromoPrices(product),
          stock_info: formatStock(product),
          categories: normalizeFlowLabel(categories),
          tags,
          date_creation: normalizeFlowLabel(dateCreation),
        },
      };
      await writeProductSimpleScreenCache(token, selectedId, response);
      return response;
    }

    const cachedVariable = await getProductVariableScreenCache(token, String(product.id));
    if (cachedVariable) return cachedVariable;

    rememberVariableProduct(token, String(product.id));
    const response: FlowResponse = {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: await buildVariableDetailData(product, mapImageUrl),
    };
    await writeProductVariableScreenCache(token, String(product.id), response);
    return response;
  }

  // Default — initial load or unknown cmd
  return await renderPage();
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
      data.product_id ?? data.parent_product_id ?? "",
    ).trim();

    if (productId) {
      const product = await getProductById(productId);
      console.log("produit:", product)

      if (product) {
        const cachedVariable = await getProductVariableScreenCache(token, String(product.id));
        if (cachedVariable) return cachedVariable;

        rememberVariableProduct(token, String(product.id));
        const response: FlowResponse = {
          screen: "PRODUCT_DETAIL_VARIABLE",
          data: await buildVariableDetailData(product, mapImageUrl),
        };
        await writeProductVariableScreenCache(token, String(product.id), response);
        return response;
      }
    }

    return {
      screen: "VARIATION_DETAIL",
      data: { error_msg: "Impossible de revenir au produit. Reessayez." },
    };
  }

  const productId = String(
    data.product_id ?? data.parent_product_id ?? "",
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

  const cachedVariation = await getVariationScreenCache(token, productId, variationId);
  if (cachedVariation) return cachedVariation;

  let displaySku = String(variation.sku || "").trim();
  if (!displaySku && productId) {
    const parent = await getProductById(productId);
    displaySku = String(parent?.sku || "").trim();
  }

  const response: FlowResponse = {
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
  await writeVariationScreenCache(token, productId, variationId, response);
  return response;
}



// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleProductsFlow(
  parsed: FlowRequest,
): Promise<FlowResponse | null> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const token = getFlowToken(parsed);
  const auth = await validateSellerFlowAccess(token);
  if (!auth.ok || !auth.seller) {
    void sendAuthFlowOnce({
      phone: auth.phone || token,
      seller: auth.seller,
      source: auth.reason === "session-expired"
        ? "meta-flow:products:session-expired"
        : "meta-flow:products:seller-not-found",
    });
    return {
      screen: "WELCOME_SCREEN",
      data: {
        error_msg: auth.reason === "session-expired"
          ? "Session expiree. Reconnectez-vous."
          : "Authentification requise. Reconnectez-vous.",
      },
    };
  }
  const seller = auth.seller;

  const sellerToken = String(seller.flow_token || "").trim();
  const effectiveToken = sellerToken || token;
  const effectiveParsed: FlowRequest = {
    ...parsed,
    flow_token: effectiveToken,
    data: {
      ...(parsed.data || {}),
      flow_token: effectiveToken,
    },
  };

  if (action === "INIT" || action === "NAVIGATE") {
    if (effectiveToken) primeProductsAsync(effectiveToken);
    console.log("PLUGIN_BASE_URL env:", process.env.WP_PLUGIN_BASE_URL);
    return { screen: "WELCOME_SCREEN", data: {} };
  }

  if (action === "DATA_EXCHANGE") {
    if (!screen) return handleProductList(effectiveParsed);

    switch (screen) {
      case "WELCOME_SCREEN":
      case "PRODUCT_LIST":
        return handleProductList(effectiveParsed);
      case "PRODUCT_DETAIL_SIMPLE":
        return { screen: "SUCCESS", data: {} };
      case "PRODUCT_DETAIL_VARIABLE":
        return handleVariationDetail(effectiveParsed);
      case "VARIATION_DETAIL":
        return { screen: "SUCCESS", data: {} };

      default:
        return { screen: "WELCOME_SCREEN", data: {} };
    }
  }

  return { screen: "WELCOME_SCREEN", data: {} };
}

export default handleProductsFlow;