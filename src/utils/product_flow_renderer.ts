/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FlowResponse } from "@/models/flowResponse";
import { ProductType, ProductVariation } from "@/models/product_model";
import { prefetchNavListImages, toSizedBase64 } from "./image_processor";
import { paginateArray } from "./core_utils";


const PAGE_SIZE = 5;
const MAX_CAROUSEL_IMAGES = 3;

// ─── Price & Stock Formatting ─────────────────────────────────────────────────

export function formatSimplePrices(product: any): string {
  const euro = String(
    product?.general_price_euro ?? "",
  ).trim();
  const tnd = String(
    product?.general_price_tnd ?? "",
  ).trim();

  if (!euro && !tnd) return "Prix non renseigne";
  if (!euro) return `${tnd} TND`;
  if (!tnd) return `${euro} EUR`;
  return `${euro} EUR | ${tnd} TND`;
}
export function formatPromoPrices(product: any): string {
  const euro = String(
    product.promo_price_euro ?? "",
  ).trim();
  const tnd = String(
    product.promo_price_tnd ?? "",
  ).trim();

  if (!euro && !tnd) return "";
  if (!euro) return `${tnd} TND`;
  if (!tnd) return `${euro} EUR`;
  return `${euro} EUR | ${tnd} TND`;
}

export function formatStock(product: any): string {
  if (!product.manage_stock) return "Stock non géré";
  return `${product.stock_quantity ?? 0} en stock`;
}

// ─── Image Building ─────────────────────────────────────────────────────────

export async function buildProductCarouselImages(
  imageUrls: string[] | undefined,
  fallbackImageUrl: string | undefined,
  altText: string,
  mapImageUrl: (rawUrl: string) => Promise<string>,
) {
  const normalizedUrls = [
    ...(Array.isArray(imageUrls) ? imageUrls : []),
    String(fallbackImageUrl || ""),
  ]
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, MAX_CAROUSEL_IMAGES);

  if (normalizedUrls.length === 0) {
    const mapped = await mapImageUrl("");
    return [{
      src: mapped,
      "alt-text": normalizeFlowLabel(altText || "Image produit"),
    }];
  }

  const mapped = await Promise.all(normalizedUrls.map((url) => mapImageUrl(url)));
  return mapped.map((src, index) => ({
    src,
    "alt-text": normalizeFlowLabel(index === 0 ? altText : `${altText} ${index + 1}`),
  }));
}

// ─── Product Detail Building ──────────────────────────────────────────────────

export async function buildVariableDetailData(product: {
  id: string;
  name: string;
  sku?: string;
  image_src?: string;
  image_gallery?: string[];
  short_description?: string;
  full_description?: string;
  categories?: string[];
  tags?: string[];
  created_at?: string;
  variations?: Array<{ id: string | number; title: string }>;
}, mapImageUrl: (rawUrl: string) => Promise<string>) {
  const categories = (product.categories || []).join(", ") || "Sans categorie";
  const dateCreation = product.created_at
    ? `Cree le: ${product.created_at}`
    : "Cree le: non renseigne";
  const tags = (product.tags ?? []).join(" · ") || "";
  const image = await mapImageUrl(product.image_src || "");
  const carouselImages = await buildProductCarouselImages(
    product.image_gallery,
    product.image_src,
    `Image principale de ${product.name || "produit"}`,
    mapImageUrl,
  );

  return {
    name: normalizeFlowLabel(product.name),
    img: image,
    carousel_images: carouselImages,
    id_sku: `ID: ${product.id} | SKU: ${product.sku || "non renseigne"}`,
    short_desc: normalizeFlowLabel(sanitizeRichText(product.short_description || "Description courte non renseignee")),
    full_desc: normalizeFlowLabel(sanitizeRichText(product.full_description || "Description complete non renseignee")),
    categories: normalizeFlowLabel(categories),
    tags,
    date_creation: normalizeFlowLabel(dateCreation),
    product_id: product.id,
    variations: product.variations?.map((v) => ({
      id: String(v.id),
      title: normalizeFlowLabel(v.title),
    })) ?? [],
  };
}

// ─── Text & Label Normalisation ──────────────────────────────────────────────

export function normalizeFlowLabel(value: string): string {
  // Replace typographic apostrophes/quotes with plain ASCII equivalents to
  // avoid rendering artifacts in some WhatsApp clients.
  return String(value || "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2039\u203A\u276C\u276D]/g, "'")
    .replace(/[\uFFFD]/g, "'")
    .replace(/\u00A0/g, " ")
    .trim();
}

export function sanitizeRichText(value: string): string {
  const raw = String(value || "");
  if (!raw) return "";

  const noTags = raw.replace(/<[^>]*>/g, " ");
  const decoded = noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // Remove control characters and collapse whitespace for compact flow text.
  return normalizeFlowLabel(decoded)
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Pagination Helpers ─────────────────────────────────────────────────────────

export function toPositivePage(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0) return undefined;
  return Math.floor(n);
}

export function resolvePageValue(
  value: unknown,
  currentPage: number,
  nextPage?: number,
  prevPage?: number,
): number | undefined {
  const direct = toPositivePage(value);
  if (direct) return direct;

  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  // Handle literal flow-template style payloads such as:
  // "${data.current_page} + 1", "${data.current_page}-1", "${data.next_page}"
  if (raw.includes("next_page")) {
    return nextPage ?? currentPage + 1;
  }
  if (raw.includes("prev_page")) {
    return prevPage ?? Math.max(1, currentPage - 1);
  }

  const expr = raw.match(/current_page\}\s*([+-])\s*(\d+)/i);
  if (expr) {
    const op = expr[1];
    const delta = Number(expr[2]);
    if (Number.isFinite(delta) && delta > 0) {
      return op === "+" ? currentPage + delta : Math.max(1, currentPage - delta);
    }
  }

  return undefined;
}

export async function resolveFlowImageUrl(
  rawUrl: string,
  _options: { requestHost?: string; requestProto?: string },
): Promise<string> {
  return toSizedBase64(rawUrl, 280);
}

// ─── Variation Formatting ─────────────────────────────────────────────────────

export function formatVariationStock(variation: ProductVariation): string {
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

export function formatVariationAttributes(
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

// ─── Navigation List Items ───────────────────────────────────────────────────

export function formatProductNavItem(product: any, imageBase64?: string) {
  const isVariable = product.is_variable || product.type === ProductType.VARIABLE;
  const typeLabel = isVariable ? "Variable" : "Simple";
  const rawStatus = String(product.status ?? product.state ?? product.post_status ?? "").trim().toLowerCase();
  const status =
    rawStatus === "publish" || rawStatus === "published"
      ? "Publié"
      : rawStatus === "draft"
        ? "Brouillon"
        : rawStatus === "pending"
          ? "En attente"
          : rawStatus === "private"
            ? "Privé"
            : rawStatus === "future"
              ? "Planifié"
              : rawStatus === "archived" || rawStatus === "archiv"
                ? "Archivé"
              : rawStatus === "trash"
                ? "Corbeille"
                : String(product.status ?? product.state ?? product.post_status ?? "").trim();
  const sku = String(product.sku ?? "").trim();
  const stock = formatStock(product);
  const price = isVariable ? "Prix variable" : formatSimplePrices(product);

  // Enforce NavigationList character limits
  const title = normalizeFlowLabel(product.name ?? "").slice(0, 30);
  const description = `${typeLabel} · ${status}`.slice(0, 20);
  const metadata = [sku, stock, price].filter(Boolean).join(" · ").slice(0, 80);
  const endTitle = typeLabel.slice(0, 10);
  const tags = status ? [status.slice(0, 15)] : [];

  const item: any = {
    id: String(product.id),
    "main-content": { title, description, metadata },
    end: { title: endTitle, metadata: "" },
    tags,
    "on-click-action": {
      name: "data_exchange",
      payload: { product_id: String(product.id), cmd: "details" },
    },
  };

  if (imageBase64) {
    item["start"] = { image: imageBase64, "alt-text": title };
  }

  return item;
}

export function formatEmptyProductNavItem() {
  return {
    id: "empty",
    "main-content": {
      title: "Aucun produit",
      description: "Catalogue vide",
      metadata: "Aucun produit disponible",
    },
    end: { title: "", metadata: "" },
    tags: [],
    "on-click-action": {
      name: "data_exchange",
      payload: { cmd: "noop" },
    },
  };
}

export function buildNavItems(
  hasPrev: boolean,
  hasNext: boolean,
  currentPage: number,
  totalPages: number,
): any[] {
  const items: any[] = [];

  if (hasPrev) {
    items.push({
      id: "nav_prev",
      "main-content": {
        title: "⬅️ Page Précédente",
        metadata: `Page ${currentPage - 1} / ${totalPages}`,
      },
      end: { title: "", metadata: "" },
      tags: [],
      "on-click-action": {
        name: "data_exchange",
        payload: { page: currentPage - 1, cmd: "paginate" },
      },
    });
  }

  if (hasNext) {
    items.push({
      id: "nav_next",
      "main-content": {
        title: "Page Suivante ➡️",
        metadata: `Page ${currentPage + 1} / ${totalPages}`,
      },
      end: { title: "", metadata: "" },
      tags: [],
      "on-click-action": {
        name: "data_exchange",
        payload: { page: currentPage + 1, cmd: "paginate" },
      },
    });
  }

  return items;
}

// ─── Screen Response Builders ────────────────────────────────────────────────

export async function buildProductListResponse(products: any[], page: number): Promise<FlowResponse> {
  if (products.length === 0) {
    return {
      screen: "PRODUCT_LIST",
      data: {
        current_page: 1,
        products: [formatEmptyProductNavItem()],
      },
    };
  }

  // Paginate raw products first so we only fetch images for current page
  const { pageItems: rawPage, totalPages, hasNext, hasPrev, currentPage } =
    paginateArray(products, page, PAGE_SIZE);

  // Fetch and process images for this page in parallel
  const imageMap = await prefetchNavListImages(rawPage, 200);

  const navItems = rawPage.map((p: any) =>
    formatProductNavItem(p, imageMap.get(String(p.id)) || ""),
  );

  const paginationItems = buildNavItems(hasPrev, hasNext, currentPage, totalPages);

  return {
    screen: "PRODUCT_LIST",
    data: {
      current_page: currentPage,
      products: [...navItems, ...paginationItems],
    },
  };
}

export async function buildProductListPagedResponse(
  pageItems: any[],
  currentPage: number,
  hasMore: boolean,
  nextPage?: number,
  options?: { includeImages?: boolean },
): Promise<FlowResponse> {
  if (pageItems.length === 0) {
    return {
      screen: "PRODUCT_LIST",
      data: {
        current_page: Math.max(1, currentPage),
        products: [formatEmptyProductNavItem()],
      },
    };
  }

  const includeImages = options?.includeImages !== false;
  let imageMap: Map<string, string> | undefined;
  if (includeImages) {
    imageMap = await prefetchNavListImages(pageItems, 200);
  }

  const navItems = pageItems.map((p: any) =>
    formatProductNavItem(p, includeImages ? (imageMap?.get(String(p.id)) || "") : ""),
  );

  const paginationItems: any[] = [];
  if (currentPage > 1) {
    paginationItems.push({
      id: "nav_prev",
      "main-content": {
        title: "⬅️ Page Précédente",
        metadata: `Page ${currentPage - 1}`,
      },
      end: { title: "", metadata: "" },
      tags: [],
      "on-click-action": {
        name: "data_exchange",
        payload: { page: currentPage - 1, cmd: "paginate" },
      },
    });
  }

  if (hasMore) {
    const targetNext = nextPage && nextPage > 0 ? nextPage : currentPage + 1;
    paginationItems.push({
      id: "nav_next",
      "main-content": {
        title: "Page Suivante ➡️",
        metadata: `Page ${targetNext}`,
      },
      end: { title: "", metadata: "" },
      tags: [],
      "on-click-action": {
        name: "data_exchange",
        payload: { page: targetNext, cmd: "paginate" },
      },
    });
  }

  return {
    screen: "PRODUCT_LIST",
    data: {
      current_page: Math.max(1, currentPage),
      products: [...navItems, ...paginationItems],
    },
  };
}