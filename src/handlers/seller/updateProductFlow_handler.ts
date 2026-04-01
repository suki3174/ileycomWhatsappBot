/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";
import { getFlowToken, safeInitLabel } from "@/utils/core_utils";
import { buildCarousel, toCarouselBase64, toCarouselBase64FromBase64 } from "@/utils/image_processor";
import {
  buildProductListPagedResponse,
  resolveFlowImageUrl,
} from "@/utils/product_flow_renderer";
import {
  clearUpdateProductState,
  getUpdateProductState,
  updateUpdateProductState,
} from "@/repositories/products/update_product_cache";
import {
  getSellerProductsPageByFlowToken,
  loadProductForEdit,
  loadSubcategoriesForCategory,
  prefetchUpdateProductData,
  updateProductNow,
} from "@/services/update_product_service";
import { decryptWhatsAppMedia } from "@/utils/flow_crypto";
import { sendMenu } from "@/services/menu_service";
import { findSeller, isSessionActive } from "@/services/auth_service";
import { invalidateProductsListByTokenCache } from "@/services/products_cache_service";

const CAROUSEL_SIZE = 3;
// function splitCarousels(images: Array<{ src: string; "alt-text": string }>) {
//   const first = images.slice(0, 2);
//   let second = images.slice(2);
//   let showSecond = second.length > 0;

//   if (second.length === 0) {
//     const fallback = first[0] ?? { src: "", "alt-text": "Photo" };
//     second = [fallback];
//     showSecond = false;
//   }

//   return { images: first, images_2: second, show_carousel_2: showSecond };
// }

// async function buildProductCarouselsFromUrls(urls: string[], name: string) {
//   const limited = urls.filter(Boolean).slice(0, 10);
//   const base64s = await Promise.all(limited.map((u) => toCarouselBase64(u)));
//   const objs = base64s.map((src, idx) => ({
//     src,
//     "alt-text": `${name || "Photo"} ${idx + 1}`,
//   }));
//   return splitCarousels(objs);
// }

async function handleLoadProducts(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const rawData = parsed.data || {};
  const requestedPage = Number(rawData.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageResult = await getSellerProductsPageByFlowToken(token, page, 5);
  const response = await buildProductListPagedResponse(
    pageResult.products,
    pageResult.page,
    pageResult.hasMore,
    pageResult.nextPage,
  );
  const list = Array.isArray(response.data?.products) ? response.data.products : [];

  // Reuse shared product list builder but remap click command for update flow.
  for (const item of list) {
    const click = (item as Record<string, unknown>)?.["on-click-action"] as Record<string, unknown> | undefined;
    const payload = click?.payload as Record<string, unknown> | undefined;
    if (payload && String(payload.cmd ?? "").toLowerCase() === "details") {
      payload.cmd = "load_product_for_edit";
    }
  }

  return response;
}

async function handleLoadProductForEdit(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();

  if (!productId || productId === "empty" || productId.startsWith("nav_")) {
    return handleLoadProducts({
      ...parsed,
      screen: "PRODUCT_LIST",
      data: { ...data, cmd: "load_products", page: data.page ?? 1 },
    });
  }

  const product = await loadProductForEdit(productId, token);
  if (!product) {
    return handleLoadProducts({
      ...parsed,
      screen: "PRODUCT_LIST",
      data: { ...data, cmd: "load_products", page: data.page ?? 1 },
    });
  }

  // Reset per-product edit state
  await updateUpdateProductState(token, {
    product_id: productId,
    photos_modifiees: false,
    images: undefined,
    product_name: product.name,
    prix_regulier_tnd: safeInitLabel(product.general_price_tnd ?? "", { fallback: "N/A" }),
    prix_promo_tnd: safeInitLabel(product.promo_price_tnd ?? "", { fallback: "" }),
    prix_regulier_eur: safeInitLabel(product.general_price_euro ?? "", { fallback: "N/A" }),
    prix_promo_eur: safeInitLabel(product.promo_price_euro ?? "", { fallback: "" }),
    longueur: "",
    largeur: "",
    profondeur: "",
    unite_dimension: "cm",
    valeur_poids: "",
    unite_poids: "kg",
    couleur: "",
    taille: "",
    quantite: safeInitLabel(product.stock_quantity ?? "", { fallback: "0" }),
    product_category: safeInitLabel(product.category_id ?? product.categories?.[0] ?? "", { fallback: "autre" }),
    product_category_label: safeInitLabel(product.category_label ?? product.category_id ?? "", { fallback: "Autre" }),
    product_subcategory: safeInitLabel(product.subcategory_id ?? "", { fallback: "" }),
    product_subcategory_label: safeInitLabel(product.subcategory_label ?? product.subcategory_id ?? "", { fallback: "Autre" }),
  });
  const rawImages: string[] = Array.isArray(product.image_gallery)
    ? product.image_gallery.filter((img) => typeof img === "string" && img.trim().length > 0)
    : [];

  // Some products have no gallery in plugin payload; provide a safe fallback
  // so SCREEN_PHOTOS always receives at least one image slot.
  if (rawImages.length === 0) {
    const fallback = await toCarouselBase64(String(product.image_src || ""));
    if (fallback) {
      rawImages.push(fallback);
    }
  }

  const carousel1   = buildCarousel(rawImages, 0);
  const showCarousel2 = rawImages.length > CAROUSEL_SIZE;
  const carousel2   = showCarousel2 ? buildCarousel(rawImages, CAROUSEL_SIZE) : [];

  return {
    screen: "SCREEN_PHOTOS",
    data: {
      product_id: productId,
      product_name_display: safeInitLabel(product.name, { fallback: "Produit", maxLen: 40 }),
      images: carousel1,
      images_2: carousel2,
      show_carousel_2: showCarousel2,
    },
  };
}

async function handleGoEditPhotos(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return { screen: "SCREEN_EDIT_PHOTOS", data: { product_id: productId } };
}

async function handleSavePhotos(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const newImages = Array.isArray(data.new_images) ? (data.new_images as any[]) : [];

  const images = (
    await Promise.all(
      newImages.map(async (img: any) => {
        if (
          !img ||
          typeof img !== "object" ||
          typeof img.cdn_url !== "string" ||
          !img.encryption_metadata
        ) {
          if (typeof img === "string" && img.length > 0) {
            return toCarouselBase64FromBase64(img);
          }
          return null;
        }
        const plainBuffer = await decryptWhatsAppMedia(img);
        if (!plainBuffer) return null;
        return toCarouselBase64FromBase64(plainBuffer.toString("base64"));
      })
    )
  ).filter((b64): b64 is string => typeof b64 === "string" && b64.length > 0);

  await updateUpdateProductState(token, {
    product_id: productId,
    images: images,
    photos_modifiees: true,
  });

  return buildEditInfoScreen(token, productId);
}

async function handleSkipPhotos(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return buildEditInfoScreen(token, productId);
}

function buildEditInfoPayload(state: any, productId: string) {
  return {
    product_id: productId,
    product_name_init: safeInitLabel(state.product_name, { fallback: "Produit" }),
    prix_regulier_tnd_init: safeInitLabel(state.prix_regulier_tnd, { fallback: "N/A" }),
    prix_promo_tnd_init: safeInitLabel(state.prix_promo_tnd, { fallback: "N/A" }),
    prix_regulier_eur_init: safeInitLabel(state.prix_regulier_eur, { fallback: "N/A" }),
    prix_promo_eur_init: safeInitLabel(state.prix_promo_eur, { fallback: "N/A" }),
    longueur_init: safeInitLabel(state.longueur, { fallback: "N/A" }),
    largeur_init: safeInitLabel(state.largeur, { fallback: "N/A" }),
    profondeur_init: safeInitLabel(state.profondeur, { fallback: "N/A" }),
    unite_dimension_init: safeInitLabel(state.unite_dimension, { fallback: "cm" }),
    valeur_poids_init: safeInitLabel(state.valeur_poids, { fallback: "N/A" }),
    unite_poids_init: safeInitLabel(state.unite_poids, { fallback: "kg" }),
    couleur_init: safeInitLabel(state.couleur, { fallback: "N/A" }),
    taille_init: safeInitLabel(state.taille, { fallback: "N/A" }),
    quantite_init: safeInitLabel(state.quantite, { fallback: "0" }),
  };
}

async function buildEditInfoScreen(token: string, productId: string): Promise<FlowResponse> {
  const state = (await getUpdateProductState(token)) || {};
  return {
    screen: "SCREEN_EDIT_INFO",
    data: buildEditInfoPayload(state, productId),
  };
}

async function handleSaveInfoAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();

  await updateUpdateProductState(token, {
    product_id: productId,
    product_name: String(data.product_name ?? "").trim(),
    prix_regulier_tnd: safeInitLabel(data.prix_regulier_tnd, { fallback: "" }),
    prix_promo_tnd: safeInitLabel(data.prix_promo_tnd, { fallback: "" }),
    prix_regulier_eur: safeInitLabel(data.prix_regulier_eur, { fallback: "" }),
    prix_promo_eur: safeInitLabel(data.prix_promo_eur, { fallback: "" }),
    longueur: safeInitLabel(data.longueur, { fallback: "" }),
    largeur: safeInitLabel(data.largeur, { fallback: "" }),
    profondeur: safeInitLabel(data.profondeur, { fallback: "" }),
    unite_dimension: safeInitLabel(data.unite_dimension, { fallback: "cm" }),
    valeur_poids: safeInitLabel(data.valeur_poids, { fallback: "" }),
    unite_poids: safeInitLabel(data.unite_poids, { fallback: "kg" }),
    couleur: safeInitLabel(data.couleur, { fallback: "" }),
    taille: safeInitLabel(data.taille, { fallback: "" }),
    quantite: safeInitLabel(data.quantite, { fallback: "" }),
  });

  const st = (await getUpdateProductState(token)) || {};
  return {
    screen: "SCREEN_CATEGORY_INFO",
    data: {
      product_id: productId,
      current_category_label: safeInitLabel(st.product_category_label || st.product_category, { fallback: "Autre", maxLen: 40 }),
      current_subcategory_label: safeInitLabel(st.product_subcategory_label || st.product_subcategory, { fallback: "Autre", maxLen: 60 }),
    },
  };
}

async function handleGoEditCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const state = (await getUpdateProductState(token)) || {};

  let categories = (state.categories && state.categories.length > 0)
    ? state.categories
    : [];

  if (categories.length === 0) {
    const warm = await prefetchUpdateProductData();
    const fetched = Array.isArray(warm.categories)
      ? warm.categories as Array<{ id: string; title: string }>
      : [];
    categories = fetched;
    await updateUpdateProductState(token, { categories: fetched });
  }

  let selectedCategory = String(state.product_category || "").trim();
  if (!selectedCategory && categories.length > 0) {
    selectedCategory = String(categories[0]?.id || "").trim();
  }

  return {
    screen: "SCREEN_EDIT_CATEGORY",
    data: {
      product_id: productId,
      categories,
      product_category: selectedCategory,
    },
  };
}

async function handleLoadSubcategories(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const categoryId = String(data.product_category ?? "").trim();
  const state = (await getUpdateProductState(token)) || {};
  let subcats = state.subcategoriesByCategory?.[categoryId] ?? [];

  if (subcats.length === 0 && categoryId) {
    subcats = await loadSubcategoriesForCategory(categoryId);
    await updateUpdateProductState(token, {
      subcategoriesByCategory: {
        ...(state.subcategoriesByCategory || {}),
        [categoryId]: subcats,
      },
    });
  }

  const parentLabel =
    (state.categories as Array<{ id: string; title: string }> || []).find((c) => c.id === categoryId)?.title || categoryId;

  return {
    screen: "SCREEN_EDIT_SUBCATEGORY",
    data: {
      product_id: productId,
      parent_category_label: safeInitLabel(parentLabel, { fallback: "Categorie", maxLen: 40 }),
      subcategories: subcats,
    },
  };
}

async function handleSaveCategoryAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const categoryId = String(data.product_category ?? "").trim();
  const state = (await getUpdateProductState(token)) || {};
  const label =
    (state.categories as Array<{ id: string; title: string }> || []).find((c) => c.id === categoryId)?.title || categoryId;

  await updateUpdateProductState(token, {
    product_category: categoryId,
    product_category_label: label,
    product_subcategory: "",
    product_subcategory_label: "",
  });

  return handleLoadSubcategories({
    ...parsed,
    screen: "SCREEN_EDIT_CATEGORY",
    data: { ...data, product_id: productId, product_category: categoryId, cmd: "load_subcategories" },
  });
}

async function handleSaveSubcategoryAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const subcatId = String(data.product_subcategory ?? "").trim();
  const state = (await getUpdateProductState(token)) || {};

  let label = subcatId;
  for (const list of Object.values(state.subcategoriesByCategory || {}) as Array<Array<{ id: string; description: string }>>) {
    const match = list.find((s) => s.id === subcatId);
    if (match) {
      label = match.description;
      break;
    }
  }

  await updateUpdateProductState(token, {
    product_subcategory: subcatId,
    product_subcategory_label: label,
  });
  return buildSummaryScreen(token, productId);
}

async function handleSkipCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return buildSummaryScreen(token, productId);
}

async function buildSummaryScreen(token: string, productId: string): Promise<FlowResponse> {
  const state = (await getUpdateProductState(token)) || {};

  let rawImages: string[] = [];
  if (Array.isArray(state.images) && state.images.length > 0) {
    rawImages = state.images;
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
  const showCarousel2 = rawImages.length > CAROUSEL_SIZE;
  const carousel2   = showCarousel2 ? buildCarousel(rawImages, CAROUSEL_SIZE) : [];

  return {
    screen: "SCREEN_SUMMARY",
    data: {
      product_id: productId,
      images: carousel1,
      images_2:carousel2,
      show_carousel_2: showCarousel2,
      photos_modifiees: !!state.photos_modifiees,
      product_name: safeInitLabel(state.product_name, { fallback: "Produit", maxLen: 80 }),
      product_category: safeInitLabel(state.product_category_label || state.product_category, { fallback: "Autre", maxLen: 40 }),
      product_subcategory: safeInitLabel(state.product_subcategory_label || state.product_subcategory, { fallback: "Autre", maxLen: 60 }),
      prix_regulier_tnd: safeInitLabel(state.prix_regulier_tnd, { fallback: "" }),
      prix_promo_tnd: safeInitLabel(state.prix_promo_tnd, { fallback: "" }),
      prix_regulier_eur: safeInitLabel(state.prix_regulier_eur, { fallback: "" }),
      prix_promo_eur: safeInitLabel(state.prix_promo_eur, { fallback: "" }),
      longueur: safeInitLabel(state.longueur, { fallback: "" }),
      largeur: safeInitLabel(state.largeur, { fallback: "" }),
      profondeur: safeInitLabel(state.profondeur, { fallback: "" }),
      unite_dimension: safeInitLabel(state.unite_dimension, { fallback: "cm" }),
      valeur_poids: safeInitLabel(state.valeur_poids, { fallback: "" }),
      unite_poids: safeInitLabel(state.unite_poids, { fallback: "kg" }),
      couleur: safeInitLabel(state.couleur, { fallback: "" }),
      taille: safeInitLabel(state.taille, { fallback: "" }),
      quantite: safeInitLabel(state.quantite, { fallback: "" }),
      error_message: "",
    },
  };
}

async function handleSubmitUpdate(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const state = (await getUpdateProductState(token)) || {};

  if (!productId) {
    return {
      screen: "SCREEN_SUMMARY",
      data: { ...(await buildSummaryScreen(token, productId)).data, error_message: "Produit manquant." },
    };
  }

  const ok = await updateProductNow(productId, token, {
    product_id: productId,
    product_name: state.product_name,
    product_category: state.product_category,
    product_category_label: state.product_category_label,
    product_subcategory: state.product_subcategory,
    product_subcategory_label: state.product_subcategory_label,
    prix_regulier_tnd: state.prix_regulier_tnd,
    prix_promo_tnd: state.prix_promo_tnd,
    prix_regulier_eur: state.prix_regulier_eur,
    prix_promo_eur: state.prix_promo_eur,
    longueur: state.longueur,
    largeur: state.largeur,
    profondeur: state.profondeur,
    unite_dimension: state.unite_dimension,
    valeur_poids: state.valeur_poids,
    unite_poids: state.unite_poids,
    couleur: state.couleur,
    taille: state.taille,
    quantite: state.quantite,
    images_base64: Array.isArray(state.images) ? state.images : [],
    photos_modifiees: !!state.photos_modifiees,
    submittedAt: Date.now(),
  });

  if (!ok) {
    return {
      screen: "SCREEN_SUMMARY",
      data: { ...(await buildSummaryScreen(token, productId)).data, error_message: "Mise à jour impossible. Réessayez." },
    };
  }

  await invalidateProductsListByTokenCache(token);
  await sendMenu(token);
  await clearUpdateProductState(token);
  return { screen: "SUCCESS", data: {} };
}

export async function handleUpdateProductFlow(parsed: FlowRequest): Promise<FlowResponse | null> {
  const action = String(parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const data = parsed.data || {};
  const token = getFlowToken(parsed);

  const seller = await findSeller(token);
  if (!seller) {
    return {
      screen: "WELCOME",
      data: { error_message: "Seller not found", error_msg: "Seller not found" },
    };
  }

  const active = await isSessionActive(token);
  if (!active) {
    return {
      screen: "WELCOME",
      data: {
        error_message: "Session expiree. Reconnectez-vous.",
        error_msg: "Session expiree. Reconnectez-vous.",
      },
    };
  }

  if (action === "INIT" || action === "NAVIGATE") {
    // Keep flow startup fast: categories/subcategories are loaded lazily only
    // when the seller reaches category-edit screens.
    return { screen: "WELCOME", data: {} };
  }

  if (action !== "DATA_EXCHANGE") {
    return { screen: "WELCOME", data: {} };
  }

  const cmd = String((data as any).cmd || "").toLowerCase();

  switch (screen) {
    case "WELCOME":
      if (cmd === "load_products") return handleLoadProducts(parsed);
      return { screen: "WELCOME", data: {} };
    case "PRODUCT_LIST":
      if (cmd === "paginate" || cmd === "load_products") return handleLoadProducts(parsed);
      if (cmd === "details") return handleLoadProductForEdit(parsed);
      if (cmd === "load_product_for_edit") return handleLoadProductForEdit(parsed);
      return handleLoadProducts(parsed);
    case "SCREEN_PHOTOS":
      if (cmd === "go_edit_photos") return handleGoEditPhotos(parsed);
      if (cmd === "skip_photos") return handleSkipPhotos(parsed);
      return { screen: "SCREEN_PHOTOS", data };
    case "SCREEN_EDIT_PHOTOS":
      if (cmd === "save_photos") return handleSavePhotos(parsed);
      return { screen: "SCREEN_EDIT_PHOTOS", data };
    case "SCREEN_EDIT_INFO":
      // No explicit cmd: the footer submits data directly.
      return handleSaveInfoAndContinue(parsed);
    case "SCREEN_CATEGORY_INFO":
      if (cmd === "go_edit_category") return handleGoEditCategory(parsed);
      if (cmd === "skip_category") return handleSkipCategory(parsed);
      return { screen: "SCREEN_CATEGORY_INFO", data };
    case "SCREEN_EDIT_CATEGORY":
      if (cmd === "load_subcategories") return handleLoadSubcategories(parsed);
      // footer submit without cmd
      return handleSaveCategoryAndContinue(parsed);
    case "SCREEN_EDIT_SUBCATEGORY":
      // footer submit without cmd
      return handleSaveSubcategoryAndContinue(parsed);
    case "SCREEN_SUMMARY":
      if (cmd === "submit_update") return handleSubmitUpdate(parsed);
      return { screen: "SCREEN_SUMMARY", data };
    default:
      return { screen: "WELCOME", data: {} };
  }
}

export default handleUpdateProductFlow;

