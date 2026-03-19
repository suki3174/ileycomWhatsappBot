/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import {
  getFlowToken,
  computeSellingPrice,
  formatGainTnd,
  formatGainEur,
  toNumber,
  hasInvalidPromoPrice,
  parsePrice,
  resolveEurPrices,
} from "@/utils/utilities";
import {
  getAddProductState,
  updateAddProductState,
} from "@/repositories/addProduct/add_product_cache";
import {
  getProductCategoriesCached,
  getSubcategoriesByCategoryCached,
  persistDraftProduct,
} from "@/services/add_product_service";
import { buildCarousel, toCarouselBase64FromBase64 } from "@/utils/image_utils";
import crypto from "crypto";
import { SubCategory } from "@/models/category_model";
import { decryptWhatsAppMedia } from "@/utils/crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { id: "mode", title: "Mode & Vetements" },
  { id: "electronique", title: "Electronique" },
  { id: "maison", title: "Maison & Decoration" },
  { id: "beaute", title: "Beaute & Sante" },
  { id: "sport", title: "Sport & Loisirs" },
  { id: "alimentaire", title: "Alimentaire" },
  { id: "jouets", title: "Jouets & Enfants" },
  { id: "auto", title: "Auto & Moto" },
  { id: "livres", title: "Livres & Papeterie" },
  { id: "autre", title: "Autre" },
];

/**
 * Fallback subcategories map keyed by category id.
 * Each item includes a `description` field rendered as the breadcrumb
 * path inside the Dropdown (e.g. "Mode & Vetements > Robes").
 */
const DEFAULT_SUBCATEGORIES: Record<
  string,
  Array<{ id: string; title: string; description: string }>
> = {
  mode: [
    { id: "robes",      title: "Robes",            description: "Mode & Vetements > Robes" },
    { id: "hauts",      title: "Hauts & T-shirts",  description: "Mode & Vetements > Hauts & T-shirts" },
    { id: "pantalons",  title: "Pantalons & Jeans", description: "Mode & Vetements > Pantalons & Jeans" },
    { id: "chaussures", title: "Chaussures",        description: "Mode & Vetements > Chaussures" },
    { id: "accessoires_mode", title: "Autres accessoires", description: "Mode & Vetements > Autres accessoires" },
  ],
  electronique: [
    { id: "smartphones",  title: "Smartphones",      description: "Electronique > Smartphones" },
    { id: "ordinateurs",  title: "Ordinateurs",      description: "Electronique > Ordinateurs" },
    { id: "tv",           title: "TV & Audio",       description: "Electronique > TV & Audio" },
    { id: "accessoires_elec", title: "Accessoires",  description: "Electronique > Accessoires" },
  ],
  maison: [
    { id: "meubles",    title: "Meubles",           description: "Maison & Decoration > Meubles" },
    { id: "deco",       title: "Decoration",        description: "Maison & Decoration > Decoration" },
    { id: "cuisine",    title: "Cuisine",           description: "Maison & Decoration > Cuisine" },
    { id: "linge",      title: "Linge de maison",   description: "Maison & Decoration > Linge de maison" },
  ],
  beaute: [
    { id: "skincare",   title: "Skincare",          description: "Beaute & Sante > Skincare" },
    { id: "maquillage", title: "Maquillage",        description: "Beaute & Sante > Maquillage" },
    { id: "parfums",    title: "Parfums",           description: "Beaute & Sante > Parfums" },
    { id: "sante",      title: "Sante & Hygiene",   description: "Beaute & Sante > Sante & Hygiene" },
  ],
  sport: [
    { id: "fitness",    title: "Fitness",           description: "Sport & Loisirs > Fitness" },
    { id: "outdoor",    title: "Outdoor",           description: "Sport & Loisirs > Outdoor" },
    { id: "sports_eau", title: "Sports aquatiques", description: "Sport & Loisirs > Sports aquatiques" },
  ],
  alimentaire: [
    { id: "epicerie",   title: "Epicerie",          description: "Alimentaire > Epicerie" },
    { id: "boissons",   title: "Boissons",          description: "Alimentaire > Boissons" },
    { id: "bio",        title: "Bio & Naturel",     description: "Alimentaire > Bio & Naturel" },
  ],
  jouets: [
    { id: "bebes",      title: "Bebe (0-3 ans)",    description: "Jouets & Enfants > Bebe (0-3 ans)" },
    { id: "jeux",       title: "Jeux de societe",   description: "Jouets & Enfants > Jeux de societe" },
    { id: "peluches",   title: "Peluches",          description: "Jouets & Enfants > Peluches" },
  ],
  auto: [
    { id: "pieces",     title: "Pieces detachees",  description: "Auto & Moto > Pieces detachees" },
    { id: "accessoires_auto", title: "Accessoires", description: "Auto & Moto > Accessoires" },
    { id: "entretien",  title: "Entretien",         description: "Auto & Moto > Entretien" },
  ],
  livres: [
    { id: "romans",     title: "Romans",            description: "Livres & Papeterie > Romans" },
    { id: "scolaire",   title: "Scolaire",          description: "Livres & Papeterie > Scolaire" },
    { id: "papeterie",  title: "Papeterie",         description: "Livres & Papeterie > Papeterie" },
  ],
  autre: [
    { id: "autre_divers", title: "Divers",          description: "Autre > Divers" },
  ],
};


const CAROUSEL_SIZE = 3;

function previewLabels(
  items: Array<{ id: string; title: string; description?: string }>,
  max = 8,
): Array<{ id: string; title: string; description?: string }> {
  return items.slice(0, max).map((item) => ({
    id: item.id,
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
  }));
}

/**
 * Returns the subcategories for a given category id, trying the service first
 * then falling back to the in-memory cache stored during INIT, then to the
 * hard-coded DEFAULT_SUBCATEGORIES map.
 */
async function resolveSubcategories(
  token: string,
  categoryId: string
): Promise<SubCategory[]> {
  try {
    const fromService = await getSubcategoriesByCategoryCached(categoryId);
    if (Array.isArray(fromService) && fromService.length > 0) {
      return fromService;
    }
  } catch {
    // fall through to cache / defaults
  }

  const state = getAddProductState(token);
  const cached = state?.subcategories?.[categoryId];
  if (Array.isArray(cached) && cached.length > 0) return cached;

  return DEFAULT_SUBCATEGORIES[categoryId] ?? [
    { id: "autre", title: "Autre", description: `${categoryId} > Autre` },
  ];
}

function toFlowSubcategories(items: SubCategory[]): Array<{ id: string; title: string; description: string }> {
  return items
    .map((s) => ({
      id: String(s.id ?? "").trim(),
      title: String(s.title ?? "").trim(),
      description: String(s.description ?? s.title ?? "").trim(),
    }))
    .filter((s) => s.id.length > 0 && s.title.length > 0);
}





// ─── Screen handlers ──────────────────────────────────────────────────────────

/**
 * SCREEN_PHOTO → decrypt & compress images → SCREEN_NAME
 */
async function handlePhoto(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const raw = Array.isArray(data.images) ? data.images : [];

  const images = (
    await Promise.all(
      raw.map(async (img: any) => {
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

  updateAddProductState(token, { images });

  return { screen: "SCREEN_NAME", data: {} };
}

/**
 * SCREEN_NAME → save product_name → SCREEN_CATEGORY (categories already cached in INIT)
 */
async function handleSaveName(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const productName = String(data.product_name ?? "").trim();
  updateAddProductState(token, { product_name: productName });

  // Prefer categories cached during INIT; re-fetch only as a last resort
  const state = getAddProductState(token);
  let categories =
    Array.isArray(state?.categories) && state.categories.length > 0
      ? state.categories
      : DEFAULT_CATEGORIES;

  if (categories === DEFAULT_CATEGORIES) {
    try {
      const fromService = await getProductCategoriesCached();
      if (Array.isArray(fromService) && fromService.length > 0) {
        categories = fromService;
        updateAddProductState(token, { categories });
      }
    } catch { /* keep defaults */ }
  }

  console.log("AddProduct categories payload", {
    count: categories.length,
    sample: previewLabels(categories),
  });

  return { screen: "SCREEN_CATEGORY", data: { categories } };
}

/**
 * SCREEN_CATEGORY → save category id → SCREEN_SUBCATEGORY
 * Loads the matching subcategories (from INIT cache or service).
 */
async function handleSaveCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const categoryId    = String(data.product_category ?? "").trim();
  const state         = getAddProductState(token);

  // Resolve the human-readable label for the selected category
  const allCategories: Array<{ id: string; title: string }> =
    Array.isArray(state?.categories) && state.categories.length > 0
      ? state.categories
      : DEFAULT_CATEGORIES;

  const categoryLabel =
    allCategories.find((c) => c.id === categoryId)?.title ?? categoryId;

  updateAddProductState(token, {
    product_category: categoryId,
    product_category_label: categoryLabel,
    product_subcategory: "",
    product_subcategory_label: "",
  });

  const subcategories = await resolveSubcategories(token, categoryId);
  const flowSubcategories = toFlowSubcategories(subcategories);
  const refreshedState = getAddProductState(token);
  updateAddProductState(token, {
    subcategories: {
      ...(refreshedState?.subcategories ?? {}),
      [categoryId]: subcategories,
    },
  });

  console.log("AddProduct subcategories payload", {
    categoryId,
    categoryLabel,
    count: flowSubcategories.length,
    sample: previewLabels(flowSubcategories),
  });

  return {
    screen: "SCREEN_SUBCATEGORY",
    data: {
      parent_category_label: categoryLabel,
      subcategories: flowSubcategories,
    },
  };
}

/**
 * SCREEN_SUBCATEGORY → save subcategory → SCREEN_PRICE_TND
 */
async function handleSaveSubcategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const subcategoryId = String(data.product_subcategory ?? "").trim();
  const state         = getAddProductState(token);

  // Build the human-readable breadcrumb label from the cached subcategories map
  const categoryId    = state?.product_category ?? "";
  const cachedSubs: Array<{ id: string; title: string; description?: string }> =
    state?.subcategories?.[categoryId] ??
    DEFAULT_SUBCATEGORIES[categoryId] ??
    [];

  const subcategoryLabel =
    cachedSubs.find((s) => s.id === subcategoryId)?.description ??
    subcategoryId;

  updateAddProductState(token, {
    product_subcategory: subcategoryId,
    product_subcategory_label: subcategoryLabel,
  });

  return { screen: "SCREEN_PRICE_TND", data: { gain_tnd: "" } };
}

/**
 * SCREEN_PRICE_TND — EmbeddedLink "Calculer gain"
 */
async function handleCalculateGainTnd(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};

  const prixRegulierTnd = parsePrice(data.prix_regulier_tnd);
  const prixPromoTnd    = parsePrice(data.prix_promo_tnd);

  const sellingPrice = computeSellingPrice(prixRegulierTnd, prixPromoTnd);
  const gainTnd      = formatGainTnd(sellingPrice);

  return { screen: "SCREEN_PRICE_TND", data: { gain_tnd: gainTnd } };
}

/**
 * SCREEN_PRICE_TND — Footer "Continuer"
 */
async function handleSavePriceTnd(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data  = parsed.data || {};

  const prixRegulierTnd = parsePrice(data.prix_regulier_tnd);
  const prixPromoTnd    = parsePrice(data.prix_promo_tnd);

  if (hasInvalidPromoPrice(prixRegulierTnd, prixPromoTnd)) {
    return { screen: "SCREEN_PRICE_TND", data: { gain_tnd: "" } };
  }

  updateAddProductState(token, {
    prix_regulier_tnd: prixRegulierTnd,
    prix_promo_tnd: prixPromoTnd,
  });

  const eurPrices  = await resolveEurPrices(prixRegulierTnd, prixPromoTnd);
  const eurRegular = eurPrices.regularEur;
  const eurPromo   = eurPrices.promoEur > 0 ? eurPrices.promoEur : null;

  return {
    screen: "SCREEN_PRICE_EUR",
    data: {
      prix_regulier_eur_init: eurRegular ? String(eurRegular) : "",
      prix_promo_eur_init:    eurPromo   ? String(eurPromo)   : "Optionnel",
      gain_eur:               "",
      prix_regulier_tnd:      String(prixRegulierTnd),
      prix_promo_tnd:         prixPromoTnd > 0 ? String(prixPromoTnd) : "",
    },
  };
}

/**
 * SCREEN_PRICE_EUR — EmbeddedLink "Calculer gain"
 */
async function handleCalculateGainEur(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data  = parsed.data || {};
  const state = getAddProductState(token) || undefined;

  let prixRegulierEur = parsePrice(data.prix_regulier_eur);
  let prixPromoEur    = parsePrice(data.prix_promo_eur);

  if (prixRegulierEur <= 0 || (prixPromoEur <= 0 && (state?.prix_promo_tnd ?? 0) > 0)) {
    const eurPrices = await resolveEurPrices(
      state?.prix_regulier_tnd ?? 0,
      state?.prix_promo_tnd   ?? 0
    );
    if (prixRegulierEur <= 0) prixRegulierEur = eurPrices.regularEur;
    if (prixPromoEur <= 0 && (state?.prix_promo_tnd ?? 0) > 0) prixPromoEur = eurPrices.promoEur;
  }

  updateAddProductState(token, {
    prix_regulier_eur: prixRegulierEur,
    prix_promo_eur:    prixPromoEur,
  });

  const sellingPrice = computeSellingPrice(prixRegulierEur, prixPromoEur);
  const gainEur      = formatGainEur(sellingPrice);

  return {
    screen: "SCREEN_PRICE_EUR",
    data: {
      prix_regulier_eur_init: String(prixRegulierEur),
      prix_promo_eur_init:    prixPromoEur > 0 ? String(prixPromoEur) : "Optionnel",
      gain_eur:               gainEur,
      prix_regulier_tnd:      String(state?.prix_regulier_tnd ?? 0),
      prix_promo_tnd:         state?.prix_promo_tnd ? String(state.prix_promo_tnd) : "",
    },
  };
}

/**
 * SCREEN_PRICE_EUR — Footer "Continuer"
 */
async function handleSavePriceEur(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data  = parsed.data || {};
  const state = getAddProductState(token) || undefined;

  let prixRegulierEur = parsePrice(data.prix_regulier_eur);
  let prixPromoEur    = parsePrice(data.prix_promo_eur);

  if (prixRegulierEur <= 0 || (prixPromoEur <= 0 && (state?.prix_promo_tnd ?? 0) > 0)) {
    const eurPrices = await resolveEurPrices(
      state?.prix_regulier_tnd ?? 0,
      state?.prix_promo_tnd   ?? 0
    );
    if (prixRegulierEur <= 0) prixRegulierEur = eurPrices.regularEur;
    if (prixPromoEur <= 0 && (state?.prix_promo_tnd ?? 0) > 0) prixPromoEur = eurPrices.promoEur;
  }

  if (hasInvalidPromoPrice(prixRegulierEur, prixPromoEur)) {
    return {
      screen: "SCREEN_PRICE_EUR",
      data: {
        prix_regulier_eur_init: String(prixRegulierEur),
        prix_promo_eur_init:    prixPromoEur > 0 ? String(prixPromoEur) : "Optionnel",
        gain_eur:               "",
        prix_regulier_tnd:      String(state?.prix_regulier_tnd ?? 0),
        prix_promo_tnd:         state?.prix_promo_tnd ? String(state.prix_promo_tnd) : "",
      },
    };
  }

  updateAddProductState(token, {
    prix_regulier_eur: prixRegulierEur,
    prix_promo_eur:    prixPromoEur,
  });

  return { screen: "SCREEN_DETAILS", data: {} };
}

/**
 * SCREEN_DETAILS — Footer "Continuer"
 */
async function handleSaveDetails(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data  = parsed.data || {};

  updateAddProductState(token, {
    longueur:        toNumber(data.longueur, 0),
    largeur:         toNumber(data.largeur, 0),
    profondeur:      toNumber(data.profondeur, 0),
    unite_dimension: String(data.unite_dimension ?? "").trim(),
    valeur_poids:    toNumber(data.valeur_poids, 0),
    unite_poids:     String(data.unite_poids ?? "").trim(),
    couleur:         String(data.couleur ?? "").trim(),
    taille:          String(data.taille  ?? "").trim(),
  });

  return { screen: "SCREEN_QUANTITY", data: {} };
}

/**
 * SCREEN_QUANTITY — Footer "Continuer"
 * Saves the quantity then builds the summary data.
 * Product creation is intentionally deferred to SCREEN_SUMMARY (final confirmation).
 */
async function handleSaveQuantity(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data  = parsed.data || {};

  const chips = Array.isArray(data.quantite_chips) ? (data.quantite_chips as string[]) : [];
  let quantity = chips[0] ? parseInt(chips[0], 10) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const manual = toNumber(data.quantite_manuelle, 0);
    quantity = manual > 0 ? manual : 1;
  }

  const current = updateAddProductState(token, { quantite: String(quantity) });

  const rawImages: string[] = current.images ?? [];
  const carousel1   = buildCarousel(rawImages, 0);
  const showCarousel2 = rawImages.length > CAROUSEL_SIZE;
  const carousel2   = showCarousel2 ? buildCarousel(rawImages, CAROUSEL_SIZE) : [];

  return {
    screen: "SCREEN_SUMMARY",
    data: {
      images:          carousel1,
      images_2:        carousel2,
      show_carousel_2: showCarousel2,

      product_name:         current.product_name         ?? "",
      product_category:      current.product_category_label ?? current.product_category ?? "",
      product_subcategory: current.product_subcategory_label ?? current.product_subcategory ?? "",

      prix_regulier_tnd: current.prix_regulier_tnd ? String(current.prix_regulier_tnd) : "",
      prix_promo_tnd:    current.prix_promo_tnd    ? String(current.prix_promo_tnd)    : "",
      prix_regulier_eur: current.prix_regulier_eur ? String(current.prix_regulier_eur) : "",
      prix_promo_eur:    current.prix_promo_eur    ? String(current.prix_promo_eur)    : "",

      longueur:        current.longueur    ? String(current.longueur)    : "",
      largeur:         current.largeur     ? String(current.largeur)     : "",
      profondeur:      current.profondeur  ? String(current.profondeur)  : "",
      unite_dimension: current.unite_dimension ?? "",

      valeur_poids: current.valeur_poids ? String(current.valeur_poids) : "",
      unite_poids:  current.unite_poids  ?? "",

      couleur:  current.couleur  ?? "",
      taille:   current.taille   ?? "",
      quantite: String(quantity),
    },
  };
}

/**
 * SCREEN_SUMMARY — Footer "Soumettre le produit"
 * Performs the final product insert and redirects to SUCCESS.
 */
async function handleSubmitSummary(parsed: FlowRequest): Promise<FlowResponse> {
  const token   = getFlowToken(parsed);
  const current = getAddProductState(token) ?? {};

  const quantity = parseInt(String(current.quantite ?? "1"), 10);

  // Guard: skip if already submitted (e.g. user double-taps the footer)
  if (current.submitted_at && current.product_id) {
    console.info("Product already submitted, skipping duplicate insert:", current.product_id);
    return { screen: "SUCCESS", data: {} };
  }

  const createResult = await persistDraftProduct(token, current, quantity);

  if (!createResult.ok) {
    console.error(
      "persistDraftProduct failed:",
      createResult.errorCode,
      createResult.errorMessage
    );
    updateAddProductState(token, {
      submit_status:      "error",
      submit_message:     createResult.errorMessage ?? "Impossible d'ajouter le produit.",
      submit_error_code:  createResult.errorCode    ?? "create_failed",
      product_id:         "",
    });

    // Stay on the summary screen and surface the error
    return {
      screen: "SCREEN_SUMMARY",
      data: {
        
        error_message: createResult.errorMessage ?? "Une erreur est survenue. Veuillez réessayer.",
      },
    };
  }

  updateAddProductState(token, {
    submitted_at:      Date.now(),
    submit_status:     "submitted",
    submit_message:    "Produit ajouté avec succès.",
    submit_error_code: "",
    product_id:        createResult.productId,
  });

  return { screen: "SUCCESS", data: {} };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function handleAddProductFlow(
  parsed: FlowRequest
): Promise<FlowResponse | null> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const data   = parsed.data   || {};

  // ── INIT ──────────────────────────────────────────────────────────────────
  if (action === "INIT") {
    const token = getFlowToken(parsed);

    if (token) {
      // Keep INIT fast and deterministic; categories/subcategories are loaded on-demand.
      updateAddProductState(token, {
        categories: DEFAULT_CATEGORIES,
        subcategories: {},
      });
    }

    return { screen: "SCREEN_PHOTO", data: {} };
  }

  

  // ── DATA_EXCHANGE ─────────────────────────────────────────────────────────
  if (action === "DATA_EXCHANGE") {
    const cmd = String(data.cmd || "").toLowerCase();

    if (!screen) {
      // Recover gracefully from client transition glitches.
      const token = getFlowToken(parsed);
      const state = getAddProductState(token);
      const categories =
        Array.isArray(state?.categories) && state.categories.length > 0
          ? state.categories
          : await getProductCategoriesCached().catch(() => DEFAULT_CATEGORIES);

      const categoryFromRequest = String(data.product_category ?? "").trim();
      if (categoryFromRequest) {
        const categoryLabel =
          categories.find((c) => c.id === categoryFromRequest)?.title ?? categoryFromRequest;

        updateAddProductState(token, {
          product_category: categoryFromRequest,
          product_category_label: categoryLabel,
        });

        const subcategories = await resolveSubcategories(token, categoryFromRequest);
        const flowSubcategories = toFlowSubcategories(subcategories);
        console.log("AddProduct empty-screen recovery to subcategories", {
          categoryFromRequest,
          categoryLabel,
          count: flowSubcategories.length,
          sample: previewLabels(flowSubcategories),
        });
        return {
          screen: "SCREEN_SUBCATEGORY",
          data: {
            parent_category_label: categoryLabel,
            subcategories: flowSubcategories,
          },
        };
      }

      return { screen: "SCREEN_CATEGORY", data: { categories } };
    }

    switch (screen) {
      case "SCREEN_PHOTO":
        return handlePhoto(parsed);

      case "SCREEN_NAME":
        return handleSaveName(parsed);

      case "SCREEN_CATEGORY":
        if (cmd === "load_subcategories") return handleSaveCategory(parsed);
        return handleSaveCategory(parsed);

      case "SCREEN_SUBCATEGORY":
        return handleSaveSubcategory(parsed);

      case "SCREEN_PRICE_TND":
        if (cmd === "calculate_gain_tnd") return handleCalculateGainTnd(parsed);
        return handleSavePriceTnd(parsed);

      case "SCREEN_PRICE_EUR":
        if (cmd === "calculate_gain_eur") return handleCalculateGainEur(parsed);
        return handleSavePriceEur(parsed);

      case "SCREEN_DETAILS":
        return handleSaveDetails(parsed);

      case "SCREEN_QUANTITY":
        return handleSaveQuantity(parsed);

      case "SCREEN_SUMMARY":
        return handleSubmitSummary(parsed);
    }
  }

  return { screen: "SCREEN_PHOTO", data: {} };
}

export default handleAddProductFlow;