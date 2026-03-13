/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import {
  getFlowToken,
  computeSellingPrice,
  convertTndToEur,
  formatGainTnd,
  formatGainEur,
  toNumber,
} from "@/utils/utilities";
import {
  getAddProductState,
  updateAddProductState,
} from "@/repositories/add_product_cache";
import {
  getProductCategoriesCached,
  persistDraftProduct,
} from "@/services/add_product_service";
import { toCarouselBase64FromBase64 } from "@/utils/image_utils";
import crypto from "crypto";

// ─── Constants ───────────────────────────────────────────────────────────────

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

/** 1×1 transparent PNG — used to fill empty carousel slots */
const IMAGE_PLACEHOLDER =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const CAROUSEL_SIZE = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses a number that may use a comma as decimal separator (e.g. "55,5" → 55.5).
 * Falls back to `defaultVal` when the value is empty, undefined, or not a number.
 */
function parsePrice(value: unknown, defaultVal: number = 0): number {
  if (value === null || value === undefined || value === "") return defaultVal;
  const normalized = String(value).replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

/**
 * Build a fixed-length carousel array (always CAROUSEL_SIZE slots).
 * Empty slots are filled with the placeholder image.
 */
function buildCarousel(
  images: string[],
  offset: number
): Array<{ src: string; "alt-text": string }> {
  return Array.from({ length: CAROUSEL_SIZE }, (_, i) => {
    const globalIdx = offset + i;
    const src = images[globalIdx] ?? IMAGE_PLACEHOLDER;
    return {
      src,
      "alt-text": images[globalIdx] ? `Photo ${globalIdx + 1}` : "",
    };
  });
}

// ─── WhatsApp media decryption ────────────────────────────────────────────────

/**
 * Downloads and decrypts a WhatsApp Flows PhotoPicker image.
 *
 * WhatsApp encrypts uploaded media with AES-256-CBC. The .enc file structure is:
 *   [ ciphertext ][ mac: 10 bytes ]
 *
 * Decryption steps:
 *   1. Fetch the cdn_url
 *   2. Split off the last 10 bytes (HMAC-SHA256 truncated MAC)
 *   3. Verify: HMAC-SHA256(hmac_key, iv + ciphertext)[0..9] === mac
 *   4. Decrypt: AES-256-CBC(encryption_key, iv, ciphertext) → plaintext media
 *
 * Returns null on any failure (network, decryption, verification).
 */
async function decryptWhatsAppMedia(img: {
  cdn_url: string;
  encryption_metadata: {
    encryption_key: string;
    hmac_key: string;
    iv: string;
    plaintext_hash: string;
    encrypted_hash: string;
  };
}): Promise<Buffer | null> {
  try {
    const encryptionKey = Buffer.from(img.encryption_metadata.encryption_key, "base64");
    const hmacKey       = Buffer.from(img.encryption_metadata.hmac_key, "base64");
    const iv            = Buffer.from(img.encryption_metadata.iv, "base64");

    // 1. Download the encrypted file
    const response = await fetch(img.cdn_url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("WhatsApp CDN fetch failed:", img.cdn_url, response.status);
      return null;
    }
    const encryptedBytes = Buffer.from(await response.arrayBuffer());

    // 2. Split: last 10 bytes = MAC, rest = ciphertext
    const mac        = encryptedBytes.subarray(encryptedBytes.length - 10);
    const ciphertext = encryptedBytes.subarray(0, encryptedBytes.length - 10);

    // 3. Verify HMAC-SHA256(hmac_key, iv + ciphertext) — first 10 bytes must match
    const hmac = crypto.createHmac("sha256", hmacKey);
    hmac.update(iv);
    hmac.update(ciphertext);
    const expectedMac = hmac.digest().subarray(0, 10);

    if (!crypto.timingSafeEqual(expectedMac, mac)) {
      console.warn("WhatsApp media HMAC verification failed:", img.cdn_url);
      return null;
    }

    // 4. Decrypt AES-256-CBC
    const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted;
  } catch (err) {
    console.warn("decryptWhatsAppMedia error:", err);
    return null;
  }
}

// ─── Screen handlers ──────────────────────────────────────────────────────────

/**
 * SCREEN_PHOTO → decrypt, resize & save images → SCREEN_NAME
 *
 * WhatsApp Flows PhotoPicker returns objects shaped:
 *   { file_name, media_id, cdn_url, encryption_metadata: { encryption_key, hmac_key, iv, ... } }
 *
 * Images are AES-256-CBC encrypted on the CDN. We decrypt each one, then run
 * it through sharp (320×240 JPEG, <100KB) before storing.
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
          // Fallback: plain base64 string (should not happen in production)
          if (typeof img === "string" && img.length > 0) {
            return toCarouselBase64FromBase64(img);
          }
          return null;
        }

        // Decrypt the WhatsApp-encrypted CDN image
        const plainBuffer = await decryptWhatsAppMedia(img);
        if (!plainBuffer) return null;

        // Process through sharp: 320×240 JPEG <100KB
        return toCarouselBase64FromBase64(plainBuffer.toString("base64"));
      })
    )
  ).filter((b64): b64 is string => typeof b64 === "string" && b64.length > 0);

  updateAddProductState(token, { images });

  return { screen: "SCREEN_NAME", data: {} };
}

/**
 * SCREEN_NAME → save product_name, return cached categories → SCREEN_CATEGORY
 */
async function handleSaveName(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const productName = String(data.product_name ?? "").trim();
  updateAddProductState(token, { product_name: productName });

  const state = getAddProductState(token);
  const categories =
    state?.categories?.length ? state.categories : DEFAULT_CATEGORIES;

  return {
    screen: "SCREEN_CATEGORY",
    data: { categories },
  };
}

/**
 * SCREEN_CATEGORY → save category → SCREEN_PRICE_TND
 */
async function handleSaveCategory(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const productCategory = String(data.product_category ?? "").trim();
  updateAddProductState(token, { product_category: productCategory });

  return {
    screen: "SCREEN_PRICE_TND",
    data: { gain_tnd: "" },
  };
}

/**
 * SCREEN_PRICE_TND — EmbeddedLink "Calculer gain"
 * Computes the gain and stays on the same screen.
 * Promo validation is handled by the flow itself (inline If condition).
 */
async function handleCalculateGainTnd(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const data = parsed.data || {};

  const prixRegulierTnd = parsePrice(data.prix_regulier_tnd);
  const prixPromoTnd = parsePrice(data.prix_promo_tnd);

  const sellingPrice = computeSellingPrice(prixRegulierTnd, prixPromoTnd);
  const gainTnd = formatGainTnd(sellingPrice);

  return {
    screen: "SCREEN_PRICE_TND",
    data: { gain_tnd: gainTnd },
  };
}

/**
 * SCREEN_PRICE_TND — Footer "Continuer"
 * Saves TND prices, converts to EUR as initial hints → SCREEN_PRICE_EUR
 */
async function handleSavePriceTnd(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const prixRegulierTnd = parsePrice(data.prix_regulier_tnd);
  const prixPromoTnd = parsePrice(data.prix_promo_tnd);

  updateAddProductState(token, {
    prix_regulier_tnd: prixRegulierTnd,
    prix_promo_tnd: prixPromoTnd,
  });

  const eurRegular = convertTndToEur(prixRegulierTnd);
  const eurPromo = prixPromoTnd > 0 ? convertTndToEur(prixPromoTnd) : null;

  return {
    screen: "SCREEN_PRICE_EUR",
    data: {
      prix_regulier_eur_init: eurRegular ? String(eurRegular) : "",
      prix_promo_eur_init: eurPromo ? String(eurPromo) : "Optionnel",
      gain_eur: "",
      // TND prices passed through so they survive a gain recalculation round-trip
      prix_regulier_tnd: String(prixRegulierTnd),
      prix_promo_tnd: prixPromoTnd > 0 ? String(prixPromoTnd) : "",
    },
  };
}

/**
 * SCREEN_PRICE_EUR — EmbeddedLink "Calculer gain"
 * Computes EUR gain and stays on the same screen.
 * TND prices are echoed back so the data model stays intact.
 * Promo validation is handled by the flow itself (inline If condition).
 */
async function handleCalculateGainEur(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const state = getAddProductState(token) || {};

  // Parse typed value — fall back to TND conversion if empty
  let prixRegulierEur = parsePrice(data.prix_regulier_eur);
  if (prixRegulierEur <= 0) {
    prixRegulierEur = convertTndToEur(state.prix_regulier_tnd ?? 0) ?? 0;
  }

  let prixPromoEur = parsePrice(data.prix_promo_eur);
  if (prixPromoEur <= 0 && (state.prix_promo_tnd ?? 0) > 0) {
    prixPromoEur = convertTndToEur(state.prix_promo_tnd!) ?? 0;
  }

  // Persist so the footer "Continuer" sees the resolved values
  updateAddProductState(token, {
    prix_regulier_eur: prixRegulierEur,
    prix_promo_eur: prixPromoEur,
  });

  const sellingPrice = computeSellingPrice(prixRegulierEur, prixPromoEur);
  const gainEur = formatGainEur(sellingPrice);

  return {
    screen: "SCREEN_PRICE_EUR",
    data: {
      prix_regulier_eur_init: String(prixRegulierEur),
      prix_promo_eur_init: prixPromoEur > 0 ? String(prixPromoEur) : "Optionnel",
      gain_eur: gainEur,
      prix_regulier_tnd: String(state.prix_regulier_tnd ?? 0),
      prix_promo_tnd: state.prix_promo_tnd ? String(state.prix_promo_tnd) : "",
    },
  };
}

/**
 * SCREEN_PRICE_EUR — Footer "Continuer"
 * Saves EUR prices → SCREEN_DETAILS
 */
async function handleSavePriceEur(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  const state = getAddProductState(token) || {};

  // Parse what the user typed (supports comma decimals)
  let prixRegulierEur = parsePrice(data.prix_regulier_eur);
  let prixPromoEur = parsePrice(data.prix_promo_eur);

  // If the user left the regular EUR field empty, fall back to the TND conversion
  if (prixRegulierEur <= 0) {
    prixRegulierEur = convertTndToEur(state.prix_regulier_tnd ?? 0) ?? 0;
  }

  // If the user left the promo EUR field empty but there is a TND promo, convert it
  if (prixPromoEur <= 0 && (state.prix_promo_tnd ?? 0) > 0) {
    prixPromoEur = convertTndToEur(state.prix_promo_tnd!) ?? 0;
  }

  updateAddProductState(token, {
    prix_regulier_eur: prixRegulierEur,
    prix_promo_eur: prixPromoEur,
  });

  return { screen: "SCREEN_DETAILS", data: {} };
}

/**
 * SCREEN_DETAILS — Footer "Continuer"
 * Saves product details → SCREEN_QUANTITY
 */
async function handleSaveDetails(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  updateAddProductState(token, {
    longueur: toNumber(data.longueur, 0),
    largeur: toNumber(data.largeur, 0),
    profondeur: toNumber(data.profondeur, 0),
    unite_dimension: String(data.unite_dimension ?? "").trim(),
    valeur_poids: toNumber(data.valeur_poids, 0),
    unite_poids: String(data.unite_poids ?? "").trim(),
    couleur: String(data.couleur ?? "").trim(),
    taille: String(data.taille ?? "").trim(),
  });

  return {
    screen: "SCREEN_QUANTITY",
    data: { error_quantite: "" },
  };
}

/**
 * SCREEN_QUANTITY — Footer "Continuer"
 * Validates & saves quantity, persists the draft, builds SCREEN_SUMMARY data.
 *
 * Carousel rules:
 *  - Each carousel holds exactly CAROUSEL_SIZE (3) slots.
 *  - Empty slots are filled with IMAGE_PLACEHOLDER.
 *  - show_carousel_2 = true only when there are more than 3 real images.
 */
async function handleSaveQuantity(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};

  // Resolve quantity: chips take priority, fallback to manual input, default 1
  const chips = Array.isArray(data.quantite_chips)
    ? (data.quantite_chips as string[])
    : [];
  let quantity = chips[0] ? parseInt(chips[0], 10) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const manual = toNumber(data.quantite_manuelle, 0);
    quantity = manual > 0 ? manual : 1;
  }

  const current = updateAddProductState(token, { quantite: String(quantity) });
  await persistDraftProduct(token, current, quantity);

  const rawImages: string[] = current.images ?? [];

  // Carousel 1: slots 0-2
  const carousel1 = buildCarousel(rawImages, 0);

  // Carousel 2: slots 3-5 — only shown when more than 3 real images exist
  const showCarousel2 = rawImages.length > CAROUSEL_SIZE;
  const carousel2 = buildCarousel(rawImages, CAROUSEL_SIZE);

  return {
    screen: "SCREEN_SUMMARY",
    data: {
      images: carousel1,
      images_2: carousel2,
      show_carousel_2: showCarousel2,

      product_name: current.product_name ?? "",
      product_category: current.product_category ?? "",

      prix_regulier_tnd: current.prix_regulier_tnd
        ? String(current.prix_regulier_tnd)
        : "",
      prix_promo_tnd: current.prix_promo_tnd
        ? String(current.prix_promo_tnd)
        : "",
      prix_regulier_eur: current.prix_regulier_eur
        ? String(current.prix_regulier_eur)
        : "",
      prix_promo_eur: current.prix_promo_eur
        ? String(current.prix_promo_eur)
        : "",

      longueur: current.longueur ? String(current.longueur) : "",
      largeur: current.largeur ? String(current.largeur) : "",
      profondeur: current.profondeur ? String(current.profondeur) : "",
      unite_dimension: current.unite_dimension ?? "",

      valeur_poids: current.valeur_poids ? String(current.valeur_poids) : "",
      unite_poids: current.unite_poids ?? "",

      couleur: current.couleur ?? "",
      taille: current.taille ?? "",
      quantite: String(quantity),
    },
  };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function handleAddProductFlow(
  parsed: FlowRequest
): Promise<FlowResponse | null> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const data = parsed.data || {};

  // ── INIT ──────────────────────────────────────────────────────────────────
  if (action === "INIT") {
    const token = getFlowToken(parsed);
    if (token) {
      // Fetch and cache categories during INIT so they are ready for SCREEN_NAME
      try {
        const categories = await getProductCategoriesCached();
        updateAddProductState(token, { categories });
      } catch {
        updateAddProductState(token, { categories: DEFAULT_CATEGORIES });
      }
    }
    return { screen: "SCREEN_PHOTO", data: {} };
  }

  // ── DATA_EXCHANGE ─────────────────────────────────────────────────────────
  if (action === "DATA_EXCHANGE") {
    const cmd = String(data.cmd || "").toLowerCase();

    switch (screen) {
      case "SCREEN_PHOTO":
        return handlePhoto(parsed);

      case "SCREEN_NAME":
        return handleSaveName(parsed);

      case "SCREEN_CATEGORY":
        return handleSaveCategory(parsed);

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
    }
  }

  return null;
}

export default handleAddProductFlow;