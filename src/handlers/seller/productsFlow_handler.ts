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

/*
This handler is the entry for list-related interactions. It reads the incoming command
from the flow payload, resolves pagination and product selection, and returns either a
cached or freshly built screen response. It also branches to simple or variable detail
screens depending on the selected product type.
*/
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

    if (!product) {
      return await renderPage();
    }

    const categories = (product.categories || []).join(", ") || "Sans categorie";
    const dateCreation = product.created_at
      ? `Cree le: ${product.created_at}`
      : "Cree le: non renseigne";
    const tags = (product.tags ?? []).join(" · ") || "";

    if (product.type === ProductType.SIMPLE && !product.is_variable) {
      const priceEur = normalizeFlowLabel(String(product.general_price_euro || "").trim());
      const priceTnd = normalizeFlowLabel(String(product.general_price_tnd || "").trim());
      const promoPriceEur = normalizeFlowLabel(String(product.promo_price_euro || "").trim());
      const promoPriceTnd = normalizeFlowLabel(String(product.promo_price_tnd || "").trim());

      const cachedSimple = await getProductSimpleScreenCache(token, selectedId);
      if (cachedSimple) {
        const cachedData = (cachedSimple.data || {}) as Record<string, unknown>;
        const needsBackfill =
          !Object.prototype.hasOwnProperty.call(cachedData, "price_tnd") ||
          !Object.prototype.hasOwnProperty.call(cachedData, "price_eur") ||
          !Object.prototype.hasOwnProperty.call(cachedData, "promo_price_tnd") ||
          !Object.prototype.hasOwnProperty.call(cachedData, "promo_price_eur");

        if (!needsBackfill) {
          return cachedSimple;
        }

        const patched: FlowResponse = {
          ...cachedSimple,
          data: {
            ...cachedData,
            price_tnd: String(cachedData.price_tnd ?? priceTnd),
            price_eur: String(cachedData.price_eur ?? priceEur),
            promo_price_tnd: String(cachedData.promo_price_tnd ?? promoPriceTnd),
            promo_price_eur: String(cachedData.promo_price_eur ?? promoPriceEur),
          },
        };
        await writeProductSimpleScreenCache(token, selectedId, patched);
        return patched;
      }

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
          price_tnd: priceTnd,
          price_eur: priceEur,
          promo_price_tnd: promoPriceTnd,
          promo_price_eur: promoPriceEur,
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

/*
This handler resolves variable-product selection events and renders VARIATION_DETAIL.
It supports both direct variation lookups and fallback recovery paths, then formats stock,
attributes, image, and pricing fields expected by the flow schema. It also handles the
return-to-variable-detail behavior on transition edge cases.
*/
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

      if (product) {
        const cachedVariable = await getProductVariableScreenCache(token, String(product.id));
        if (cachedVariable) return cachedVariable;

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

/*
Main productsFlow state machine entry point. It validates seller access using the flow
token, normalizes effective token context, then routes INIT/NAVIGATE and DATA_EXCHANGE
actions to the appropriate screen handlers. Authentication failures are redirected through
the auth fallback mechanism with a user-facing reconnect message.
*/
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