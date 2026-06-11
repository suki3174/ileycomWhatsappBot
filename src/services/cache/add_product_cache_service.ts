import type { ProductCategory, SubCategory } from "@/models/category_model";
import type { AddProductState } from "@/models/product_model";
import type { PricingConversionResult } from "@/repositories/addProduct/pricing_repo";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";
import { normText } from "@/utils/data_parser";

const ADD_PRODUCT_STATE_TTL_SEC = 30 * 60;
const CATEGORY_CACHE_TTL_SEC = 30 * 60;
const SUBCATEGORY_CACHE_TTL_SEC = 20 * 60;
const PRICE_CONVERSION_TTL_SEC = 10 * 60;

/**
 * Reads REDIS_ENABLED and decides whether Redis-backed caching is active.
 */
function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

/**
 * Controls verbose cache logging for add-product flow troubleshooting.
 */
function isAddProductCacheDebugEnabled(): boolean {
  const raw = String(process.env.ADD_PRODUCT_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

/**
 * Standardized logger for cache events (hit/miss/write/invalidate).
 */
function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isAddProductCacheDebugEnabled()) return;
  console.log("[add-product-cache]", event, details);
}

/**
 * Returns a connected Redis client or null when cache is unavailable.
 */
async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

/**
 * Builds Redis key for token-scoped add-product draft state.
 */
function stateKey(token: string): string {
  return `${getRedisPrefix()}:add-product:state:${token}`;
}

/**
 * Builds Redis key for global add-product categories cache.
 */
function categoriesKey(): string {
  return `${getRedisPrefix()}:add-product:categories`;
}

/**
 * Builds Redis key for category-specific subcategories cache.
 */
function subcategoriesKey(categoryId: string): string {
  return `${getRedisPrefix()}:add-product:subcategories:${categoryId}`;
}

/**
 * Builds Redis key for cached pricing conversion pair.
 */
function priceConversionKey(regularTnd: number, promoTnd: number): string {
  return `${getRedisPrefix()}:add-product:price-conversion:regular:${regularTnd}:promo:${promoTnd}`;
}

/**
 * Reads and parses JSON payload from Redis by key.
 */
async function readJson<T>(key: string): Promise<T | undefined> {
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

/**
 * Writes JSON payload to Redis with explicit TTL.
 */
async function writeJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-write-redis-unavailable", { key, ttlSec });
    return;
  }

  await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  cacheLog("write", { key, ttlSec });
}

/**
 * Deletes a single Redis key.
 */
async function deleteKey(key: string): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-delete-redis-unavailable", { key });
    return;
  }

  const deleted = await redis.del(key);
  cacheLog("invalidate", { key, deleted });
}

/**
 * Deletes all Redis keys matching a prefix using scan batching.
 */
async function deleteByPrefix(prefix: string): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-invalidate-redis-unavailable", { prefix });
    return;
  }

  const keys: string[] = [];
  let deleted = 0;
  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
    keys.push(String(key));
    if (keys.length >= 200) {
      await redis.del(keys);
      deleted += keys.length;
      keys.length = 0;
    }
  }

  if (keys.length > 0) {
    await redis.del(keys);
    deleted += keys.length;
  }

  cacheLog("invalidate-prefix", { prefix, deleted });
}

/**
 * Gets token-scoped draft state for add-product flow.
 */
export async function getAddProductDraftStateCache(
  token: string,
): Promise<AddProductState | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  return await readJson<AddProductState>(stateKey(normalized));
}

/**
 * Writes token-scoped draft state for add-product flow.
 */
export async function writeAddProductDraftStateCache(
  token: string,
  state: AddProductState,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  await writeJson(stateKey(normalized), state, ADD_PRODUCT_STATE_TTL_SEC);
}

/**
 * Clears token-scoped draft state for add-product flow.
 */
export async function clearAddProductDraftStateCache(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  await deleteKey(stateKey(normalized));
}

/**
 * Reads global categories cache used by add-product flow.
 */
export async function getAddProductCategoriesCache(): Promise<ProductCategory[] | undefined> {
  const parsed = await readJson<ProductCategory[]>(categoriesKey());
  return Array.isArray(parsed) ? parsed : undefined;
}

/**
 * Writes global categories cache used by add-product flow.
 */
export async function writeAddProductCategoriesCache(
  categories: ProductCategory[],
): Promise<void> {
  await writeJson(categoriesKey(), Array.isArray(categories) ? categories : [], CATEGORY_CACHE_TTL_SEC);
}

/**
 * Reads subcategories cache for a specific parent category.
 */
export async function getAddProductSubcategoriesCache(
  categoryId: string,
): Promise<SubCategory[] | undefined> {
  const normalized = normText(categoryId);
  if (!normalized) return undefined;
  const parsed = await readJson<SubCategory[]>(subcategoriesKey(normalized));
  return Array.isArray(parsed) ? parsed : undefined;
}

/**
 * Writes subcategories cache for a specific parent category.
 */
export async function writeAddProductSubcategoriesCache(
  categoryId: string,
  subcategories: SubCategory[],
): Promise<void> {
  const normalized = normText(categoryId);
  if (!normalized) return;
  await writeJson(
    subcategoriesKey(normalized),
    Array.isArray(subcategories) ? subcategories : [],
    SUBCATEGORY_CACHE_TTL_SEC,
  );
}

/**
 * Reads cached EUR conversion for a TND price pair.
 */
export async function getAddProductPriceConversionCache(
  regularTnd: number,
  promoTnd: number,
): Promise<PricingConversionResult | undefined> {
  return await readJson<PricingConversionResult>(priceConversionKey(regularTnd, promoTnd));
}

/**
 * Writes cached EUR conversion for a TND price pair.
 */
export async function writeAddProductPriceConversionCache(
  regularTnd: number,
  promoTnd: number,
  result: PricingConversionResult,
): Promise<void> {
  await writeJson(
    priceConversionKey(regularTnd, promoTnd),
    result,
    PRICE_CONVERSION_TTL_SEC,
  );
}

/**
 * Invalidates all reference caches (categories/subcategories/pricing).
 * Draft state is intentionally left intact.
 */
export async function invalidateAddProductReferenceCache(): Promise<void> {
  await deleteByPrefix(`${getRedisPrefix()}:add-product:categories`);
  await deleteByPrefix(`${getRedisPrefix()}:add-product:subcategories:`);
  await deleteByPrefix(`${getRedisPrefix()}:add-product:price-conversion:`);
}