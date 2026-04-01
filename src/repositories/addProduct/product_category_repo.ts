
import { ProductCategory, SubCategory } from "@/models/category_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/data_parser";
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

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/subcategories/list",
        { category_id: normalizedCategoryId, include_empty: true, limit: MAX_FLOW_CATEGORIES },
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
    return extractSubcategories(payload, normalizedCategoryId);
  } catch (err) {
    console.error("plugin product/subcategories/list exception", err);
    return [];
  }
}

export async function fetchAllProductCategories(): Promise<ProductCategory[]> {
  try {
    const res = await pluginPostWithRetry(
      "/seller/product/categories/list",
        { include_empty: true, parent_only: true, limit: MAX_FLOW_CATEGORIES },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 8_000), retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/categories/list failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return DEFAULT_CATEGORIES;
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/categories/list");
    const categories = extractCategories(payload);

    if (categories.length) {
      return categories;
    }

    return DEFAULT_CATEGORIES;
  } catch (err) {
    console.error("plugin product/categories/list exception", err);
    return DEFAULT_CATEGORIES;
  }
}

export type { SubCategory, ProductCategory };

