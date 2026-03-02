/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProductType } from "@/models/product_model";
import {
  getSellerProductsByFlowToken,
  getProductById,
  getVariationDetail,
} from "@/services/products_service";
import{formatSimplePrices,formatStock}from  "@/utils/utilities"

export interface FlowRequest {
  action?: string;
  screen?: string;
  data?: Record<string, any>;
  flow_token?: string;
  version?: string;
}

export interface FlowResponse {
  screen: string;
  data: Record<string, any>;
}

function getFlowToken(parsed: FlowRequest): string {
  const t = parsed?.data?.flow_token ?? parsed?.flow_token ?? "";
  return typeof t === "string" ? t.trim() : String(t).trim();
}
export async function handleWelcome(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  // Load the products list
  const products = await getSellerProductsByFlowToken(token);

  // Shape for the PRODUCT_LIST screen
  const listItems = products.map((p) => ({
    id: p.id,
    title: p.name,
  }));

  // Return the PRODUCT_LIST screen with the products list
  return {
    screen: "PRODUCT_LIST",
    data: {
      products: listItems,
    },
  };
}
/* -------------------------------- */
/* PRODUCT LIST */
/* -------------------------------- */

async function handleProductList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const products = await getSellerProductsByFlowToken(token);

  const listItems = products.map((p) => ({
    id: String(p.id),
    title: p.name,
  }));

  const selectedId = String(data.product_id ?? "").trim();

  // If no selection → show list
  if (!selectedId) {
    return {
      screen: "PRODUCT_LIST",
      data: { products: listItems },
    };
  }

  const product = await getProductById(selectedId);

  if (!product) {
    return {
      screen: "PRODUCT_LIST",
      data: {
        products: listItems,
        error_msg: "Produit introuvable.",
      },
    };
  }

  const categories = (product.categories || []).join(", ");
  const dateCreation = `Créé le: ${product.created_at}`;

  // SIMPLE PRODUCT
  if (product.type === ProductType.SIMPLE && !product.is_variable) {
    return {
      screen: "PRODUCT_DETAIL_SIMPLE",
      data: {
        name: product.name,
        img: product.image_src,
        id_sku: `ID: ${product.id} | SKU: ${product.sku}`,
        short_desc: product.short_description,
        full_desc: product.full_description,
        prices: formatSimplePrices(product),
        stock_info: formatStock(product),
        categories,
        date_creation: dateCreation,
      },
    };
  }

  // VARIABLE PRODUCT
  return {
    screen: "PRODUCT_DETAIL_VARIABLE",
    data: {
      name: product.name,
      img: product.image_src,
      id_sku: `ID: ${product.id} | SKU: ${product.sku}`,
      short_desc: product.short_description,
      full_desc: product.full_description,
      categories,
      date_creation: dateCreation,

      // ⚠️ IMPORTANT → persist product_id
      product_id: product.id,

      variations:
        product.variations?.map((v) => ({
          id: String(v.id),
          title: v.title,
        })) ?? [],
    },
  };
}

/* -------------------------------- */
/* VARIATION DETAIL */
/* -------------------------------- */

async function handleVariationDetail(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const data = parsed.data || {};
    // 🔥 SUCCESS TRIGGER
  if (data.confirm_action) {
    return {
      screen: "SUCCESS",
      data: {
        message: "Action sur la variation effectuée avec succès !",
      },
    };
  }

  const productId = String(data.product_id ?? "").trim();
  const variationId = String(data.variation_id ?? "").trim();

  if (!productId || !variationId) {
    return {
      screen: "PRODUCT_DETAIL_VARIABLE",
      data: {
        error_msg: "Variation ou produit manquant.",
      },
    };
  }

  const variation = await getVariationDetail(productId, variationId);

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
async function handleSimpleDetail(
  parsed: FlowRequest,
): Promise<FlowResponse> {

  const data = parsed.data || {};

  // 🔥 SUCCESS TRIGGER
  if (data.confirm_action) {
    return {
      screen: "SUCCESS",
      data: {
        message: "Action sur le produit effectuée avec succès !",
      },
    };
  }

  // Otherwise just stay on same screen
  return {
    screen: "PRODUCT_DETAIL_SIMPLE",
    data: {},
  };
}
async function handleSuccess(): Promise<FlowResponse> {
  return {
    screen: "SUCCESS",
    data: {
      message: "Action terminée avec succès !",
    },
  };
}

/* -------------------------------- */
/* MAIN HANDLER */
/* -------------------------------- */

export async function handleProductsFlow(
  parsed: FlowRequest,
): Promise<FlowResponse | null> {

  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";

  if (action === "DATA_EXCHANGE" && screen === "WELCOME_SCREEN") {
    return handleProductList(parsed);
  }

  if (action === "DATA_EXCHANGE" && screen === "PRODUCT_LIST") {
    return handleProductList(parsed);
  }

  if (action === "DATA_EXCHANGE" && screen === "PRODUCT_DETAIL_VARIABLE") {
    return handleVariationDetail(parsed);
  }

  if (action === "DATA_EXCHANGE" && screen === "VARIATION_DETAIL") {
    return handleVariationDetail(parsed);
  }

  if (action === "DATA_EXCHANGE" && screen === "PRODUCT_DETAIL_SIMPLE") {
    return handleSimpleDetail(parsed);
  }

  if (action === "NAVIGATE") {
    return null;
  }

  return null;
}

export default handleProductsFlow;

