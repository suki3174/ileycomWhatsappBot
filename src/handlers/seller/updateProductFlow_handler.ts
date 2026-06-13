/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";
import type { UpdateProductState } from "@/models/product_model";
import {
  getFlowToken,
  hasInvalidPromoPrice,
  parsePrice,
  resolveEurPrices,
  safeInitLabel,
} from "@/utils/core_utils";
import { buildCarousel, toCarouselBase64, toCarouselBase64FromBase64 } from "@/utils/image_processor";
import {
  buildProductListPagedResponse,
  resolveFlowImageUrl,
} from "@/utils/product_flow_renderer";
import {
  getUpdateProductState,
  updateUpdateProductState,
} from "@/repositories/updateProduct/update_product_cache";
import {
  getSellerProductsPageByFlowToken,
  loadProductCategoryInfoForEditScreen,
  loadProductEditInfoForEditScreen,
  loadProductPhotosForEditScreen,
  loadSubcategoriesForCategory,
  prefetchUpdateProductData,
  updateProductNow,
} from "@/services/update_product_service";
import { decryptWhatsAppMedia } from "@/utils/flow_crypto";
import { validateSellerFlowAccess } from "@/services/auth_service";
import { invalidateProductsListByTokenCache } from "@/services/cache/products_cache_service";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";
import { dispatchFlowLifecycleMenu } from "@/services/flow_lifecycle_service";

const CAROUSEL_SIZE = 3;

/**
 * Normalizes unknown values into a safe trimmed string for downstream flow state
 * handling. This helper is used at virtually every screen transition to prevent
 * null/undefined values from leaking into payloads sent back to WhatsApp.
 */
function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Merges incremental form submissions by preserving the previous non-empty value
 * when the current screen sends an empty string. This keeps partial edits stable
 * across screens where not all fields are re-sent on each footer submission.
 */
function keepOldIfBlank(nextValue: unknown, previousValue: unknown): string {
  const next = asTrimmed(nextValue);
  if (next !== "") return next;
  return asTrimmed(previousValue);
}

/**
 * Converts optional text fields into canonical empty-or-value form by dropping
 * placeholder-like markers (n/a, null, undefined). It is used before persisting
 * state so summary/render screens do not show technical placeholder values.
 */
function normalizeOptionalValue(value: unknown): string {
  const normalized = asTrimmed(value);
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "null" || lower === "undefined") {
    return "";
  }

  return normalized;
}

/**
 * Ensures pricing, dimension, and attribute edit info is loaded for the selected
 * product and cached in flow state. The function short-circuits when the product
 * is already hydrated, otherwise fetches plugin-backed details and maps them to
 * handler state keys consumed by SCREEN_EDIT_INFO.
 */
async function ensureEditInfoInState(token: string, productId: string): Promise<void> {
  if (!productId) return;

  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
  if (asTrimmed(state.edit_info_loaded_for) === productId) {
    return;
  }

  const editInfo = await loadProductEditInfoForEditScreen(productId, token);
  if (!editInfo) return;

  await updateUpdateProductState(token, {
    product_id: productId,
    product_name: asTrimmed(editInfo.product_name),
    prix_regulier_tnd: Number(asTrimmed(editInfo.regular_tnd)) || 0,
    prix_promo_tnd: Number(asTrimmed(editInfo.sale_tnd)) || 0,
    prix_regulier_eur: Number(asTrimmed(editInfo.regular_eur)) || 0,
    prix_promo_eur: Number(asTrimmed(editInfo.sale_eur)) || 0,
    longueur: Number(normalizeOptionalValue(editInfo.length)) || undefined,
    largeur: Number(normalizeOptionalValue(editInfo.width)) || undefined,
    profondeur: Number(normalizeOptionalValue(editInfo.height)) || undefined,
    unite_dimension: asTrimmed(editInfo.dim_unit) || "cm",
    valeur_poids: Number(normalizeOptionalValue(editInfo.weight)) || undefined,
    unite_poids: asTrimmed(editInfo.weight_unit) || "kg",
    couleur: normalizeOptionalValue(editInfo.color),
    taille: normalizeOptionalValue(editInfo.size),
    quantite: asTrimmed(editInfo.stock) || "0",
    edit_info_loaded_for: productId,
  });
}

/**
 * Ensures category/subcategory context is present in flow state for the current
 * product. This avoids repeated plugin calls while navigating category screens
 * and guarantees labels are available for recap and summary rendering.
 */
async function ensureCategoryInfoInState(token: string, productId: string): Promise<void> {
  if (!productId) return;

  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
  if (asTrimmed(state.category_info_loaded_for) === productId) {
    return;
  }

  const categoryInfo = await loadProductCategoryInfoForEditScreen(productId, token);
  if (!categoryInfo) return;

  await updateUpdateProductState(token, {
    product_id: productId,
    product_category: asTrimmed(categoryInfo.category_id) || "autre",
    product_category_label: asTrimmed(categoryInfo.category_label) || "Autre",
    product_subcategory: asTrimmed(categoryInfo.subcategory_id),
    product_subcategory_label: asTrimmed(categoryInfo.subcategory_label),
    category_info_loaded_for: productId,
  });
}
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

/**
 * Loads seller products for PRODUCT_LIST using paginated service data and shared
 * list rendering utilities. The resulting click payloads are rewritten from the
 * generic details command to update-flow specific load_product_for_edit routing.
 */
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

/**
 * Initializes edit state for the selected product by loading photos, resetting
 * stale values, and preparing SCREEN_PHOTOS payload carousels. Invalid or nav
 * pseudo IDs fall back to product list reload to keep flow navigation resilient.
 */
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

  const photosData = await loadProductPhotosForEditScreen(productId, token);
  if (!photosData) {
    return handleLoadProducts({
      ...parsed,
      screen: "PRODUCT_LIST",
      data: { ...data, cmd: "load_products", page: data.page ?? 1 },
    });
  }

  // Reset per-product edit state
  await updateUpdateProductState(token, {
    product_id: productId,
    photos_modified: false,
    images: undefined,
    submit_status: "",
    product_name: asTrimmed(photosData.product_name),
    prix_regulier_tnd: 0,
    prix_promo_tnd: 0,
    prix_regulier_eur: 0,
    prix_promo_eur: 0,
    longueur: 0,
    largeur: 0,
    profondeur: 0,
    unite_dimension: "cm",
    valeur_poids: 0,
    unite_poids: "kg",
    couleur: "",
    taille: "",
    quantite: "0",
    product_category: "",
    product_category_label: "",
    product_subcategory: "",
    product_subcategory_label: "",
    edit_info_loaded_for: "",
    category_info_loaded_for: "",
  });
  const sourceImages: string[] = Array.isArray(photosData.image_gallery)
    ? photosData.image_gallery.filter((img) => typeof img === "string" && img.trim().length > 0)
    : [];

  const rawImages: string[] = await Promise.all(
    sourceImages.map((img) => toCarouselBase64(String(img || ""))),
  );

  // Some products have no gallery in plugin payload; provide a safe fallback
  // so SCREEN_PHOTOS always receives at least one image slot.
  if (rawImages.length === 0) {
    const fallback = await toCarouselBase64(String(photosData.image_src || ""));
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
      product_name_display: safeInitLabel(photosData.product_name, { fallback: "Produit", maxLen: 40 }),
      images: carousel1,
      images_2: carousel2,
      show_carousel_2: showCarousel2,
    },
  };
}

/**
 * Routes from SCREEN_PHOTOS to SCREEN_EDIT_PHOTOS while preserving product id.
 * This is a pure screen transition helper with no state mutation.
 */
async function handleGoEditPhotos(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return { screen: "SCREEN_EDIT_PHOTOS", data: { product_id: productId } };
}

/**
 * Persists newly uploaded photos by decrypting WhatsApp media objects (or direct
 * base64 fallback), converting them to flow-ready base64 images, and marking the
 * product as photos_modified. After storage it advances to SCREEN_EDIT_INFO.
 */
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
    photos_modified: true,
  });

  return buildEditInfoScreen(token, productId);
}

/**
 * Skips photo replacement and proceeds to edit-info stage while reusing the same
 * product context. This keeps the flow fast for users who only edit metadata.
 */
async function handleSkipPhotos(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return buildEditInfoScreen(token, productId);
}

/**
 * Shapes SCREEN_EDIT_INFO response data with *_init fields expected by flow JSON.
 * It centralizes defaulting/label formatting so all edit-info responses remain
 * consistent for both validation errors and happy-path transitions.
 */
function buildEditInfoPayload(state: any, productId: string, errorMessage = "") {
  return {
    product_id: productId,
    product_name_init: safeInitLabel(state.product_name, { fallback: "Produit" }),
    prix_regulier_tnd_init: safeInitLabel(state.prix_regulier_tnd, { fallback: "0" }),
    prix_promo_tnd_init: safeInitLabel(state.prix_promo_tnd, { fallback: "N/A" }),
    prix_regulier_eur_init: safeInitLabel(state.prix_regulier_eur, { fallback: "0" }),
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
    error_message: errorMessage,
  };
}

/**
 * Builds SCREEN_EDIT_INFO by first ensuring plugin-backed edit details are loaded
 * in state, then serializing through buildEditInfoPayload. This function is used
 * by both initial load and validation-error loops.
 */
async function buildEditInfoScreen(token: string, productId: string, errorMessage = ""): Promise<FlowResponse> {
  await ensureEditInfoInState(token, productId);
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
  return {
    screen: "SCREEN_EDIT_INFO",
    data: buildEditInfoPayload(state, productId, errorMessage),
  };
}

/**
 * Validates and saves mutable product info (name, prices, dimensions, attributes,
 * quantity). It enforces pricing rules, performs EUR auto-conversion fallback,
 * persists normalized values, and advances to category-info stage.
 */
async function handleSaveInfoAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const previous = ((await getUpdateProductState(token)) || {}) as UpdateProductState;

  const mergedName = keepOldIfBlank(data.product_name, previous.product_name);
  const mergedRegularTnd = keepOldIfBlank(data.prix_regulier_tnd, previous.prix_regulier_tnd);
  const mergedPromoTnd = keepOldIfBlank(data.prix_promo_tnd, previous.prix_promo_tnd);
  let mergedRegularEur = keepOldIfBlank(data.prix_regulier_eur, previous.prix_regulier_eur);
  let mergedPromoEur = keepOldIfBlank(data.prix_promo_eur, previous.prix_promo_eur);

  const regularTndValue = parsePrice(mergedRegularTnd, 0);
  const promoTndValue = parsePrice(mergedPromoTnd, 0);
  let regularEurValue = parsePrice(mergedRegularEur, 0);
  let promoEurValue = parsePrice(mergedPromoEur, 0);

  if (regularTndValue <= 0) {
    await updateUpdateProductState(token, {
      product_id: productId,
      product_name: mergedName,
      prix_regulier_tnd: parsePrice(mergedRegularTnd, 0),
      prix_promo_tnd: parsePrice(mergedPromoTnd, 0),
      prix_regulier_eur: parsePrice(mergedRegularEur, 0),
      prix_promo_eur: parsePrice(mergedPromoEur, 0),
      longueur: Number(keepOldIfBlank(data.longueur, previous.longueur)) || undefined,
      largeur: Number(keepOldIfBlank(data.largeur, previous.largeur)) || undefined,
      profondeur: Number(keepOldIfBlank(data.profondeur, previous.profondeur)) || undefined,
      unite_dimension: keepOldIfBlank(data.unite_dimension, previous.unite_dimension) || "cm",
      valeur_poids: Number(keepOldIfBlank(data.valeur_poids, previous.valeur_poids)) || undefined,
      unite_poids: keepOldIfBlank(data.unite_poids, previous.unite_poids) || "kg",
      couleur: keepOldIfBlank(data.couleur, previous.couleur),
      taille: keepOldIfBlank(data.taille, previous.taille),
      quantite: keepOldIfBlank(data.quantite, previous.quantite),
    });
    return buildEditInfoScreen(token, productId, "Le prix regulier en TND est obligatoire et doit etre > 0.");
  }

  if (regularEurValue <= 0 || (promoTndValue > 0 && promoEurValue <= 0)) {
    const converted = await resolveEurPrices(regularTndValue, promoTndValue);
    if (regularEurValue <= 0) regularEurValue = converted.regularEur;
    if (promoTndValue > 0 && promoEurValue <= 0) promoEurValue = converted.promoEur;
  }

  if (hasInvalidPromoPrice(regularTndValue, promoTndValue) || hasInvalidPromoPrice(regularEurValue, promoEurValue)) {
    return buildEditInfoScreen(token, productId, "Le prix promo doit etre inferieur au prix regulier.");
  }

  mergedRegularEur = regularEurValue > 0 ? String(regularEurValue) : "";
  mergedPromoEur = promoEurValue > 0 ? String(promoEurValue) : "";

  await updateUpdateProductState(token, {
    product_id: productId,
    product_name: mergedName,
    prix_regulier_tnd: regularTndValue,
    prix_promo_tnd: promoTndValue,
    prix_regulier_eur: regularEurValue,
    prix_promo_eur: promoEurValue,
    longueur: Number(keepOldIfBlank(data.longueur, previous.longueur)) || undefined,
    largeur: Number(keepOldIfBlank(data.largeur, previous.largeur)) || undefined,
    profondeur: Number(keepOldIfBlank(data.profondeur, previous.profondeur)) || undefined,
    unite_dimension: keepOldIfBlank(data.unite_dimension, previous.unite_dimension) || "cm",
    valeur_poids: Number(keepOldIfBlank(data.valeur_poids, previous.valeur_poids)) || undefined,
    unite_poids: keepOldIfBlank(data.unite_poids, previous.unite_poids) || "kg",
    couleur: keepOldIfBlank(data.couleur, previous.couleur),
    taille: keepOldIfBlank(data.taille, previous.taille),
    quantite: keepOldIfBlank(data.quantite, previous.quantite),
  });

  await ensureCategoryInfoInState(token, productId);

  const st = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
  return {
    screen: "SCREEN_CATEGORY_INFO",
    data: {
      product_id: productId,
      current_category_label: safeInitLabel(st.product_category_label || st.product_category, { fallback: "Autre", maxLen: 40 }),
      current_subcategory_label: safeInitLabel(st.product_subcategory_label || st.product_subcategory, { fallback: "", maxLen: 120 }),
    },
  };
}

/**
 * Loads editable category options and opens SCREEN_EDIT_CATEGORY with preselected
 * category. If categories are absent in state, it prefetches from service and
 * caches them for subsequent category/subcategory interactions.
 */
async function handleGoEditCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  await ensureCategoryInfoInState(token, productId);
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;

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

/**
 * Loads subcategories for the chosen category and returns SCREEN_EDIT_SUBCATEGORY.
 * The selected category metadata is first persisted, then subcategory lists are
 * reused from state cache or fetched lazily when missing.
 */
async function handleLoadSubcategories(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const categoryId = String(data.product_category ?? "").trim();
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
  const categoryLabel =
    (state.categories as Array<{ id: string; title: string }> || []).find((c) => c.id === categoryId)?.title || categoryId;

  if (categoryId) {
    await updateUpdateProductState(token, {
      product_category: categoryId,
      product_category_label: categoryLabel,
      product_subcategory: "",
      product_subcategory_label: "",
    });
  }

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

  return {
    screen: "SCREEN_EDIT_SUBCATEGORY",
    data: {
      product_id: productId,
      parent_category_label: safeInitLabel(categoryLabel, { fallback: "Categorie", maxLen: 40 }),
      subcategories: subcats,
    },
  };
}

/**
 * Persists category selection and immediately delegates to subcategory loading so
 * users continue in one action. This function bridges footer submit behavior in
 * SCREEN_EDIT_CATEGORY to the load_subcategories command path.
 */
async function handleSaveCategoryAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const categoryId = String(data.product_category ?? "").trim();
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;
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

/**
 * Saves selected subcategory label/id and transitions to summary rendering. Label
 * resolution scans cached subcategory lists so recap screens display human text
 * rather than raw slug values.
 */
async function handleSaveSubcategoryAndContinue(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const subcatId = String(data.product_subcategory ?? "").trim();
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;

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
    product_subcategory_label: asTrimmed(label),
  });
  return buildSummaryScreen(token, productId);
}

/**
 * Skips category editing and directly builds summary from current state, useful
 * when sellers keep existing category taxonomy.
 */
async function handleSkipCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  return buildSummaryScreen(token, productId);
}

/**
 * Builds the final SCREEN_SUMMARY payload by combining state values and resolved
 * image carousels. If local images are absent it reloads product photos to keep
 * summary robust even after cache evictions or partial navigation paths.
 */
async function buildSummaryScreen(token: string, productId: string): Promise<FlowResponse> {
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;

  let rawImages: string[] = [];
  if (Array.isArray(state.images) && state.images.length > 0) {
    rawImages = state.images;
  } else {
    const photosData = await loadProductPhotosForEditScreen(productId, token);
    if (Array.isArray(photosData?.image_gallery) && photosData.image_gallery.length > 0) {
      rawImages = await Promise.all(
        photosData.image_gallery.slice(0, 10).map((url: unknown) => toCarouselBase64(String(url || ""))),
      );
    } else {
      const fallbackUrl = resolveFlowImageUrl(String(photosData?.image_src || ""), {});
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
      photos_modified: !!state.photos_modified,
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

/**
 * Executes final submit orchestration: idempotency guards, required price checks,
 * state transition to submitting, plugin update dispatch, error fallback routing,
 * and success side effects (cache invalidation + menu dispatch).
 */
async function handleSubmitUpdate(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const productId = String(data.product_id ?? "").trim();
  const state = ((await getUpdateProductState(token)) || {}) as UpdateProductState;

  if (!productId) {
    return {
      screen: "SCREEN_SUMMARY",
      data: { ...(await buildSummaryScreen(token, productId)).data, error_message: "Produit manquant." },
    };
  }

  if (state.submit_status === "submitted") {
    return { screen: "SUCCESS", data: {} };
  }

  if (state.submit_status === "submitting") {
    return {
      screen: "SCREEN_SUMMARY",
      data: {
        ...(await buildSummaryScreen(token, productId)).data,
        error_message: "Mise a jour en cours. Veuillez patienter...",
      },
    };
  }

  const regularTndValue = parsePrice(state.prix_regulier_tnd, 0);
  if (regularTndValue <= 0) {
    return {
      screen: "SCREEN_SUMMARY",
      data: {
        ...(await buildSummaryScreen(token, productId)).data,
        error_message: "Le prix regulier en TND est obligatoire et doit etre > 0.",
      },
    };
  }

  await updateUpdateProductState(token, {
    submit_status: "submitting",
    submitted_at: Date.now(),
  });

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
    photos_modified: !!state.photos_modified,
    submitted_at: Date.now(),
  });

  if (!ok) {
    await updateUpdateProductState(token, { submit_status: "error" });
    return {
      screen: "SCREEN_SUMMARY",
      data: { ...(await buildSummaryScreen(token, productId)).data, error_message: "Mise à jour impossible. Réessayez." },
    };
  }

  await updateUpdateProductState(token, { submit_status: "submitted" });
  
  void invalidateProductsListByTokenCache(token);
  dispatchFlowLifecycleMenu({
    flowTokenOrPhone: token,
    source: "success",
    flow: "update-product",
  });
  return { screen: "SUCCESS", data: {} };
}

/**
 * Main update-product state machine entry. It validates auth first, handles INIT
 * and DATA_EXCHANGE actions, and dispatches by screen/cmd to the corresponding
 * handler function while preserving WhatsApp Flow response contract.
 */
export async function handleUpdateProductFlow(parsed: FlowRequest): Promise<FlowResponse | null> {
  const action = String(parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const data = parsed.data || {};
  const token = getFlowToken(parsed);

  const auth = await validateSellerFlowAccess(token);
  if (!auth.ok || !auth.seller) {
    void sendAuthFlowOnce({
      phone: auth.phone || token,
      seller: auth.seller,
      source: auth.reason === "session-expired"
        ? "meta-flow:update-product:session-expired"
        : "meta-flow:update-product:seller-not-found",
    });
    return {
      screen: "WELCOME",
      data: {
        error_message: auth.reason === "session-expired"
          ? "Session expiree. Reconnectez-vous."
          : "Authentification requise. Reconnectez-vous.",
        error_msg: auth.reason === "session-expired"
          ? "Session expiree. Reconnectez-vous."
          : "Authentification requise. Reconnectez-vous.",
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