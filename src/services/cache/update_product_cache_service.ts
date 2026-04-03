import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

const UPDATE_PRODUCT_LIST_TTL_SEC = 120;
const UPDATE_PRODUCT_DETAIL_TTL_SEC = 180;

type UpdateProductsPageCache = {
  products: unknown[];
  page: number;
  hasMore: boolean;
  nextPage: number;
};

type UpdateProductForEditCache = Record<string, unknown>;
type UpdateProductScreenCache = Record<string, unknown>;

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function isUpdateProductCacheDebugEnabled(): boolean {
  const raw = String(process.env.UPDATE_PRODUCT_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isUpdateProductCacheDebugEnabled()) return;
  console.log("[modify-product-cache]", event, details);
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

function keyUpdateProductsPage(token: string, page: number, pageSize: number): string {
  return `${getRedisPrefix()}:update-product:list:token:${token}:page:${page}:size:${pageSize}`;
}

function keyUpdateProductForEdit(token: string, productId: string): string {
  return `${getRedisPrefix()}:update-product:edit:token:${token}:product:${productId}`;
}

function keyUpdateProductPhotos(token: string, productId: string): string {
  return `${getRedisPrefix()}:update-product:photos:token:${token}:product:${productId}`;
}

function keyUpdateProductEditInfo(token: string, productId: string): string {
  return `${getRedisPrefix()}:update-product:edit-info:token:${token}:product:${productId}`;
}

function keyUpdateProductCategoryInfo(token: string, productId: string): string {
  return `${getRedisPrefix()}:update-product:category-info:token:${token}:product:${productId}`;
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

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

async function writeJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-write-redis-unavailable", { key, ttlSec });
    return;
  }

  await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  cacheLog("write", { key, ttlSec });
}

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

export async function getCachedUpdateProductsPage(
  token: string,
  page: number,
  pageSize: number,
): Promise<UpdateProductsPageCache | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const safePage = normalizePositiveInt(page, 1);
  const safePageSize = normalizePositiveInt(pageSize, 5);
  return readJson<UpdateProductsPageCache>(
    keyUpdateProductsPage(normalized, safePage, safePageSize),
  );
}

export async function setCachedUpdateProductsPage(
  token: string,
  page: number,
  pageSize: number,
  data: UpdateProductsPageCache,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  const safePage = normalizePositiveInt(page, 1);
  const safePageSize = normalizePositiveInt(pageSize, 5);
  await writeJson(
    keyUpdateProductsPage(normalized, safePage, safePageSize),
    data,
    UPDATE_PRODUCT_LIST_TTL_SEC,
  );
}

export async function getCachedUpdateProductForEdit(
  token: string,
  productId: string,
): Promise<UpdateProductForEditCache | undefined> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return undefined;
  return readJson<UpdateProductForEditCache>(keyUpdateProductForEdit(normalized, pid));
}

export async function setCachedUpdateProductForEdit(
  token: string,
  productId: string,
  data: UpdateProductForEditCache,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return;
  await writeJson(
    keyUpdateProductForEdit(normalized, pid),
    data,
    UPDATE_PRODUCT_DETAIL_TTL_SEC,
  );
}

async function getCachedScreenData(
  keyFactory: (token: string, productId: string) => string,
  token: string,
  productId: string,
): Promise<UpdateProductScreenCache | undefined> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return undefined;
  return readJson<UpdateProductScreenCache>(keyFactory(normalized, pid));
}

async function setCachedScreenData(
  keyFactory: (token: string, productId: string) => string,
  token: string,
  productId: string,
  data: UpdateProductScreenCache,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return;
  await writeJson(keyFactory(normalized, pid), data, UPDATE_PRODUCT_DETAIL_TTL_SEC);
}

export async function getCachedUpdateProductPhotos(
  token: string,
  productId: string,
): Promise<UpdateProductScreenCache | undefined> {
  return getCachedScreenData(keyUpdateProductPhotos, token, productId);
}

export async function setCachedUpdateProductPhotos(
  token: string,
  productId: string,
  data: UpdateProductScreenCache,
): Promise<void> {
  await setCachedScreenData(keyUpdateProductPhotos, token, productId, data);
}

export async function getCachedUpdateProductEditInfo(
  token: string,
  productId: string,
): Promise<UpdateProductScreenCache | undefined> {
  return getCachedScreenData(keyUpdateProductEditInfo, token, productId);
}

export async function setCachedUpdateProductEditInfo(
  token: string,
  productId: string,
  data: UpdateProductScreenCache,
): Promise<void> {
  await setCachedScreenData(keyUpdateProductEditInfo, token, productId, data);
}

export async function getCachedUpdateProductCategoryInfo(
  token: string,
  productId: string,
): Promise<UpdateProductScreenCache | undefined> {
  return getCachedScreenData(keyUpdateProductCategoryInfo, token, productId);
}

export async function setCachedUpdateProductCategoryInfo(
  token: string,
  productId: string,
  data: UpdateProductScreenCache,
): Promise<void> {
  await setCachedScreenData(keyUpdateProductCategoryInfo, token, productId, data);
}

export async function invalidateUpdateProductsByToken(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  await deleteByPrefix(`${getRedisPrefix()}:update-product:list:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:update-product:edit:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:update-product:photos:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:update-product:edit-info:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:update-product:category-info:token:${normalized}`);
}

export async function invalidateUpdateProductForEdit(
  token: string,
  productId: string,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return;

  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-invalidate-redis-unavailable", { token: normalized, productId: pid });
    return;
  }

  await redis.del(
    keyUpdateProductForEdit(normalized, pid),
    keyUpdateProductPhotos(normalized, pid),
    keyUpdateProductEditInfo(normalized, pid),
    keyUpdateProductCategoryInfo(normalized, pid),
  );
  cacheLog("invalidate-product", { token: normalized, productId: pid });
}
