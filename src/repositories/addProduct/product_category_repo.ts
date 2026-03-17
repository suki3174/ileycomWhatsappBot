
import { ProductCategory, SubCategory } from "@/models/category_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/repository_utils";

let cachedCategories: ProductCategory[] | null = null;
let lastFetchAt = 0;
let cachedCategoriesSource: "plugin" | "fallback" | null = null;
const cachedSubcategoriesByCategory: Record<string, SubCategory[]> = {};
const subcategoriesFetchAtByCategory: Record<string, number> = {};
const CATEGORIES_TTL_MS = 60 * 60 * 1000;
const FALLBACK_CATEGORIES_TTL_MS = 5 * 1000;
const MAX_FLOW_CATEGORIES = 60;

const DEFAULT_CATEGORIES: ProductCategory[] = [
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


function extractCategories(payload: Record<string, unknown> | undefined): ProductCategory[] {
  const data = asRecord(payload?.data);
  if (!data || !Array.isArray(data.categories)) return [];

  const mapped: ProductCategory[] = [];
  for (const raw of data.categories) {
    const row = asRecord(raw);
    if (!row) continue;
    const id = normText(row.id);
    const title = normText(row.title);
    if (!id || !title) continue;
    mapped.push({ id, title });
  }

  return mapped.slice(0, MAX_FLOW_CATEGORIES);
}

function extractSubcategories(
  payload: Record<string, unknown> | undefined,
  parentId: string,
): SubCategory[] {
  const data = asRecord(payload?.data);
  if (!data || !Array.isArray(data.subcategories)) return [];

  const mapped: SubCategory[] = [];
  for (const raw of data.subcategories) {
    const row = asRecord(raw);
    if (!row) continue;
    const id = normText(row.id);
    const title = normText(row.title);
    const description = normText(row.description);
    if (!id || !title) continue;
    mapped.push({
      id,
      title,
      parentId: normText(row.parentId) || parentId,
      description,
    });
  }

  return mapped.slice(0, MAX_FLOW_CATEGORIES);
}

export async function fetchSubCategoriesByCategory(categoryId: string): Promise<SubCategory[]> {
  const normalizedCategoryId = normText(categoryId);
  if (!normalizedCategoryId) return [];

  const lastSubFetch = subcategoriesFetchAtByCategory[normalizedCategoryId] ?? 0;
  const cachedSub = cachedSubcategoriesByCategory[normalizedCategoryId] ?? [];
  if (cachedSub.length && Date.now() - lastSubFetch <= CATEGORIES_TTL_MS) {
    return cachedSub;
  }

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/subcategories/list",
      { category_id: normalizedCategoryId, include_empty: false, limit: MAX_FLOW_CATEGORIES },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 8_000), retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/subcategories/list failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return [];
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/subcategories/list");
    const subcategories = extractSubcategories(payload, normalizedCategoryId);
    cachedSubcategoriesByCategory[normalizedCategoryId] = subcategories;
    subcategoriesFetchAtByCategory[normalizedCategoryId] = Date.now();
    return subcategories;
  } catch (err) {
    console.error("plugin product/subcategories/list exception", err);
    return [];
  }
}

export async function fetchAllProductCategories(): Promise<ProductCategory[]> {
  const now = Date.now();
  const cacheTtl =
    cachedCategoriesSource === "fallback"
      ? FALLBACK_CATEGORIES_TTL_MS
      : CATEGORIES_TTL_MS;

  if (cachedCategories && now - lastFetchAt <= cacheTtl) {
    return cachedCategories;
  }

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/categories/list",
      { include_empty: false, parent_only: true, limit: MAX_FLOW_CATEGORIES },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 8_000), retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/categories/list failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });

      // Keep serving last known good plugin categories on transient failures.
      if (cachedCategories && cachedCategoriesSource === "plugin") {
        return cachedCategories;
      }

      cachedCategories = DEFAULT_CATEGORIES;
      cachedCategoriesSource = "fallback";
      lastFetchAt = now;
      return cachedCategories;
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/categories/list");
    const categories = extractCategories(payload);

    if (categories.length) {
      cachedCategories = categories;
      cachedCategoriesSource = "plugin";
      lastFetchAt = now;
      return cachedCategories;
    }

    // If plugin responds with an empty list, keep existing plugin cache if available.
    if (cachedCategories && cachedCategoriesSource === "plugin") {
      return cachedCategories;
    }

    cachedCategories = DEFAULT_CATEGORIES;
    cachedCategoriesSource = "fallback";
    lastFetchAt = now;
    return cachedCategories;
  } catch (err) {
    console.error("plugin product/categories/list exception", err);

    // Keep serving last known good plugin categories on transient failures.
    if (cachedCategories && cachedCategoriesSource === "plugin") {
      return cachedCategories;
    }

    cachedCategories = DEFAULT_CATEGORIES;
    cachedCategoriesSource = "fallback";
    lastFetchAt = now;
    return cachedCategories;
  }
}

export type { SubCategory, ProductCategory };

