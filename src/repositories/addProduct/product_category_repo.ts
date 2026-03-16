
import { ProductCategory, SubCategory } from "@/models/category_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/repository_utils";

let cachedCategories: ProductCategory[] | null = null;
const  cachedSubcategories:SubCategory[]| null = null;//placeholder for potential future subcategory caching logic, currently not used in plugin
let lastFetchAt = 0;
let cachedCategoriesSource: "plugin" | "fallback" | null = null;
const  cachedSubCategoriesSource: "plugin" | "fallback" | null = null;//placeholder for potential future subcategory caching logic, currently not used in plugin
const CATEGORIES_TTL_MS = 60 * 60 * 1000;
const FALLBACK_CATEGORIES_TTL_MS = 30 * 1000;
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

// placeholder for potential future subcategory fetching logic, currently not used in plugin
export async function fetchAllSubCategories(): Promise<SubCategory[] | null>  {
return cachedSubcategories}

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
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 10_000), retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/categories/list failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      cachedCategories = DEFAULT_CATEGORIES;
      cachedCategoriesSource = "fallback";
      lastFetchAt = now;
      return cachedCategories;
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/categories/list");
    const categories = extractCategories(payload);
    cachedCategories = categories.length ? categories : DEFAULT_CATEGORIES;
    cachedCategoriesSource = categories.length ? "plugin" : "fallback";
    lastFetchAt = now;
    return cachedCategories;
  } catch (err) {
    console.error("plugin product/categories/list exception", err);
    cachedCategories = DEFAULT_CATEGORIES;
    cachedCategoriesSource = "fallback";
    lastFetchAt = now;
    return cachedCategories;
  }
}

export { SubCategory, ProductCategory };

