import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { getFlowToken } from "@/utils/core_utils";
import {
  getOptimizedProductFlowState,
  updateOptimizedProductFlowState,
} from "@/repositories/optimizedProductFlow/optimized_product_flow_cache";
import {
  getOptimizationStatus,
  getOptimizationResult,
} from "@/services/ai_optimization_service";
import { getAddProductState } from "@/repositories/addProduct/add_product_cache";
import { buildCarousel, toCarouselBase64 } from "@/utils/image_processor";

/**
 * Main handler for optimized product detail flow
 */
export async function handleOptimizedProductDetail(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const action = (parsed.action || "").toUpperCase();
  const token = getFlowToken(parsed);

  if (!token) {
    return {
      screen: "ERROR",
      data: { error_msg: "Seller not found" },
    };
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  if (action === "INIT") {
    return handleInitialization(token);
  }

  // Default: show optimized product
  return handleShowOptimizedProduct(token);
}

/**
 * Initialize the optimized product flow
 */
async function handleInitialization(token: string): Promise<FlowResponse> {
  // Get the product ID from the previous add product state
  const addProductState = getAddProductState(token);
  const productId = addProductState?.product_id;

  if (!productId) {
    return {
      screen: "ERROR",
      data: {
        error_msg: "No recently added product found. Please create a product first.",
      },
    };
  }

  // Initialize flow state with product ID
  updateOptimizedProductFlowState(token, {
    product_id: productId,
  });

  // Show optimized product
  return handleShowOptimizedProduct(token);
}

/**
 * Main screen: Show the optimized product with all details
 * Returns the AI_PRODUCT screen as per WhatsApp Flow template
 */
async function handleShowOptimizedProduct(token: string): Promise<FlowResponse> {
  const flowState = getOptimizedProductFlowState(token);
  const addProductState = getAddProductState(token) || {};
  const productId = flowState?.product_id;

  if (!productId) {
    return {
      screen: "ERROR",
      data: {
        error_msg: "Product ID not found. Please start over.",
      },
    };
  }

  const optimizationStatus = getOptimizationStatus(productId);

  // ── Still processing ──────────────────────────────────────────────────
  if (!optimizationStatus || optimizationStatus.status !== "completed") {
    return {
      screen: "LOADING",
      data: {
        message: "🤖 Loading optimized product details...",
        status: optimizationStatus?.status || "pending",
      },
    };
  }

  // ── Show optimized product ────────────────────────────────────────────
  const optimizationResult = getOptimizationResult(productId);

  // Build carousel images

    let rawImages: string[] = optimizationResult?.images ?? [];

    if (Array.isArray(optimizationResult?.images) && optimizationResult?.images.length > 0) {
      rawImages = optimizationResult.images;
rawImages = await Promise.all(
          rawImages.slice(0, 10).map((url: unknown) => toCarouselBase64(String(url || ""))),
        );
    } else {
      const product = await loadProductForEdit(productId, token);
      if (Array.isArray(product?.image_gallery) && product.image_gallery.length > 0) {
        rawImages = await Promise.all(
          product.image_gallery.slice(0, 10).map((url: unknown) => toCarouselBase64(String(url || ""))),
        );
      } else {
        const fallbackUrl = resolveFlowImageUrl(String(product?.image_src || ""), {});
        const mapped = await fallbackUrl;
        rawImages = mapped ? [mapped] : [];
      }
    }
  
  const carousel1   = buildCarousel(rawImages, 0);
  const CAROUSEL_SIZE = 3;
  const showCarousel2 = rawImages.length > CAROUSEL_SIZE;
  const carousel2 = showCarousel2 ? buildCarousel(rawImages, CAROUSEL_SIZE) : [];

  // Determine displayed values (use optimized if available, else original)
  const displayName =
    optimizationResult?.optimizedName || addProductState.product_name || "";
  const displayShortDesc =
    optimizationResult?.optimizedShortDescription ||
    addProductState.product_name ||
    "";
  const displayFullDesc =
    optimizationResult?.optimizedFullDescription ||
    addProductState.product_name ||
    "";
  const displayTags = optimizationResult?.suggestedTags
    ? optimizationResult.suggestedTags.join(" · ")
    : "Add tags";
  const displayCategories = optimizationResult?.suggestedCategories
    ? optimizationResult.suggestedCategories.join(", ")
    : addProductState.product_category_label || "";

  // Build the AI_PRODUCT response according to WhatsApp Flow template
  return {
    screen: "AI_PRODUCT",
    data: {
      carousel_images: carousel1,
      show_carousel2: showCarousel2,
      carousel_images2: carousel2,

      product_id: productId,
      sku: "", // TODO: Get from product details if available

      name: displayName,
      short_desc: displayShortDesc,
      full_desc: displayFullDesc,

      price_eur: String(addProductState.prix_regulier_eur || ""),
      price_tnd: String(addProductState.prix_regulier_tnd || ""),
      price_eur_promo: String(addProductState.prix_promo_eur || ""),
      price_tnd_promo: String(addProductState.prix_promo_tnd || ""),

      stock: String(addProductState.quantite || ""),
      categories: displayCategories,
      tags: displayTags,
      date_creation: addProductState.created_at || new Date().toLocaleDateString("fr-FR"),
    },
  };
}