/* eslint-disable @typescript-eslint/no-explicit-any */

import { FlowResponse } from "@/models/flowResponse";
import { ProductType, ProductVariation } from "@/models/product_model";
import { prefetchNavListImages } from "./navlist_image_utils";
import { paginateArray } from "./utilities";


const PAGE_SIZE = 10;

export function formatSimplePrices(product: any): string {
  const euro = String(
    product?.promo_price_euro ?? product?.general_price_euro ?? "",
  ).trim();
  const tnd = String(
    product?.promo_price_tnd ?? product?.general_price_tnd ?? "",
  ).trim();

  if (!euro && !tnd) return "Prix non renseigne";
  if (!euro) return `${tnd} TND`;
  if (!tnd) return `${euro} EUR`;
  return `${euro} EUR | ${tnd} TND`;
}

export function formatStock(product: any): string {
  if (!product.manage_stock) return "Stock non géré";
  return `${product.stock_quantity ?? 0} en stock`;
}
export function buildVariableDetailData(product: {
  id: string;
  name: string;
  sku?: string;
  image_src?: string;
  short_description?: string;
  full_description?: string;
  categories?: string[];
  tags?: string[];           // ← add this
  created_at?: string;
  variations?: Array<{ id: string | number; title: string }>;
}, mapImageUrl: (rawUrl: string) => string) {
  const categories = (product.categories || []).join(", ") || "Sans categorie";
  const dateCreation = product.created_at
    ? `Cree le: ${product.created_at}`
    : "Cree le: non renseigne";
  const tags = (product.tags ?? []).join(" · ") || "";   // ← add this

  return {
    name: normalizeFlowLabel(product.name),
    img: mapImageUrl(product.image_src || ""),
    id_sku: `ID: ${product.id} | SKU: ${product.sku || "non renseigne"}`,
    short_desc: normalizeFlowLabel(sanitizeRichText(product.short_description || "Description courte non renseignee")),
    full_desc: normalizeFlowLabel(sanitizeRichText(product.full_description || "Description complete non renseignee")),
    categories: normalizeFlowLabel(categories),
    tags,                                                  // ← add this
    date_creation: normalizeFlowLabel(dateCreation),
    product_id: product.id,
    variations: product.variations?.map((v) => ({
      id: String(v.id),
      title: normalizeFlowLabel(v.title),
    })) ?? [],
  };
}
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

export function resolveFlowImageUrl(
  rawUrl: string,
  options: { requestHost?: string; requestProto?: string },
): string {
  void rawUrl;
  void options;

  // Temporary mode: force a simple public placeholder image URL.
  return "https://placehold.co/640x400/png?text=No+Image";
}
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

export function formatProductNavItem(product: any, imageBase64?: string) {
  const isVariable = product.is_variable || product.type === ProductType.VARIABLE;
  const typeLabel = isVariable ? "Variable" : "Simple";
  const status = String(product.status === "publish" ? "Publié" : product.status ?? "");
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
  const imageMap = await prefetchNavListImages(rawPage);

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
