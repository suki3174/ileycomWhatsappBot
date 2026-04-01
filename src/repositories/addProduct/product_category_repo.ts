
import { ProductCategory, SubCategory } from "@/models/category_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/data_parser";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
const MAX_FLOW_CATEGORIES = 60;
const CATEGORY_CACHE_TTL_SEC = 30 * 60;
const SUBCATEGORY_CACHE_TTL_SEC = 20 * 60;

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

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function isAddProductCacheDebugEnabled(): boolean {
  const raw = String(process.env.ADD_PRODUCT_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isAddProductCacheDebugEnabled()) return;
  console.log("[add-product-cache]", event, details);
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

function keyCategories(): string {
  return `${getRedisPrefix()}:add-product:categories`;
}

function keySubcategories(categoryId: string): string {
  return `${getRedisPrefix()}:add-product:subcategories:${categoryId}`;
}

async function readCachedJson<T>(key: string): Promise<T | undefined> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-read-redis-unavailable", { key });
    return undefined;
  }

  const raw = await redis.get(key);
  if (!raw) {
    cacheLog("miss", { key });
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    cacheLog("hit", { key });
    return parsed;
  } catch {
    cacheLog("invalid-json", { key });
    return undefined;
  }
}

async function writeCachedJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-write-redis-unavailable", { key, ttlSec });
    return;
  }

  await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  cacheLog("write", { key, ttlSec });
}


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

  const cached = await readCachedJson<SubCategory[]>(keySubcategories(normalizedCategoryId));
  if (Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

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
    const subcategories = extractSubcategories(payload, normalizedCategoryId);
    if (subcategories.length > 0) {
      await writeCachedJson(
        keySubcategories(normalizedCategoryId),
        subcategories,
        SUBCATEGORY_CACHE_TTL_SEC,
      );
    }
    return subcategories;
  } catch (err) {
    console.error("plugin product/subcategories/list exception", err);
    return [];
  }
}

export async function fetchAllProductCategories(): Promise<ProductCategory[]> {
  const cached = await readCachedJson<ProductCategory[]>(keyCategories());
  if (Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

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
      await writeCachedJson(keyCategories(), categories, CATEGORY_CACHE_TTL_SEC);
      return categories;
    }

    return DEFAULT_CATEGORIES;
  } catch (err) {
    console.error("plugin product/categories/list exception", err);
    return DEFAULT_CATEGORIES;
  }
}

export type { SubCategory, ProductCategory };

