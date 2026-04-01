import type { FlowResponse } from "@/models/flowResponse";
import type { Product, ProductVariation } from "@/models/product_model";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

const PRODUCTS_LIST_TTL_SEC = 120;
const PRODUCTS_SCREEN_TTL_SEC = 120;
const PRODUCT_DETAIL_TTL_SEC = 180;
const VARIATION_DETAIL_TTL_SEC = 180;

function isProductsCacheDebugEnabled(): boolean {
  const raw = String(process.env.PRODUCTS_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isProductsCacheDebugEnabled()) return;
  console.log("[products-cache]", event, details);
}

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

function keyProductsListByToken(token: string): string {
  return `${getRedisPrefix()}:products:list:token:${token}`;
}

function keyProductsPageScreenByToken(token: string, page: number, perPage: number): string {
  return `${getRedisPrefix()}:products:screen:list:token:${token}:page:${page}:per:${perPage}`;
}

function keyProductSimpleScreenByToken(token: string, productId: string): string {
  return `${getRedisPrefix()}:products:screen:simple:token:${token}:product:${productId}`;
}

function keyProductVariableScreenByToken(token: string, productId: string): string {
  return `${getRedisPrefix()}:products:screen:variable:token:${token}:product:${productId}`;
}

function keyVariationScreenByToken(token: string, productId: string, variationId: string): string {
  return `${getRedisPrefix()}:products:screen:variation:token:${token}:product:${productId}:variation:${variationId}`;
}

function keyProductById(productId: string): string {
  return `${getRedisPrefix()}:products:data:product:${productId}`;
}

function keyVariationByIds(productId: string, variationId: string): string {
  return `${getRedisPrefix()}:products:data:variation:product:${productId}:variation:${variationId}`;
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

export async function getProductsListByTokenCache(
  token: string,
): Promise<Product[] | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const parsed = await readJson<Product[]>(keyProductsListByToken(normalized));
  return Array.isArray(parsed) ? parsed : undefined;
}

export async function writeProductsListByTokenCache(
  token: string,
  products: Product[],
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  await writeJson(
    keyProductsListByToken(normalized),
    Array.isArray(products) ? products : [],
    PRODUCTS_LIST_TTL_SEC,
  );
}

export async function invalidateProductsListByTokenCache(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  await deleteByPrefix(`${getRedisPrefix()}:products:list:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:products:screen:list:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:products:screen:simple:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:products:screen:variable:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:products:screen:variation:token:${normalized}`);
}

export async function getProductsPageScreenCache(
  token: string,
  page: number,
  perPage: number,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  const safePage = normalizePositiveInt(page, 1);
  const safePerPage = normalizePositiveInt(perPage, 5);
  return await readJson<FlowResponse>(
    keyProductsPageScreenByToken(normalized, safePage, safePerPage),
  );
}

export async function writeProductsPageScreenCache(
  token: string,
  page: number,
  perPage: number,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  const safePage = normalizePositiveInt(page, 1);
  const safePerPage = normalizePositiveInt(perPage, 5);
  await writeJson(
    keyProductsPageScreenByToken(normalized, safePage, safePerPage),
    response,
    PRODUCTS_SCREEN_TTL_SEC,
  );
}

export async function getProductSimpleScreenCache(
  token: string,
  productId: string,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return undefined;
  return await readJson<FlowResponse>(keyProductSimpleScreenByToken(normalized, pid));
}

export async function writeProductSimpleScreenCache(
  token: string,
  productId: string,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return;
  await writeJson(
    keyProductSimpleScreenByToken(normalized, pid),
    response,
    PRODUCT_DETAIL_TTL_SEC,
  );
}

export async function getProductVariableScreenCache(
  token: string,
  productId: string,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return undefined;
  return await readJson<FlowResponse>(keyProductVariableScreenByToken(normalized, pid));
}

export async function writeProductVariableScreenCache(
  token: string,
  productId: string,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  if (!normalized || !pid) return;
  await writeJson(
    keyProductVariableScreenByToken(normalized, pid),
    response,
    PRODUCT_DETAIL_TTL_SEC,
  );
}

export async function getVariationScreenCache(
  token: string,
  productId: string,
  variationId: string,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!normalized || !pid || !vid) return undefined;
  return await readJson<FlowResponse>(keyVariationScreenByToken(normalized, pid, vid));
}

export async function writeVariationScreenCache(
  token: string,
  productId: string,
  variationId: string,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!normalized || !pid || !vid) return;
  await writeJson(
    keyVariationScreenByToken(normalized, pid, vid),
    response,
    VARIATION_DETAIL_TTL_SEC,
  );
}

export async function getProductByIdCache(
  productId: string,
): Promise<Product | undefined> {
  const pid = String(productId || "").trim();
  if (!pid) return undefined;
  return await readJson<Product>(keyProductById(pid));
}

export async function writeProductByIdCache(
  productId: string,
  product: Product,
): Promise<void> {
  const pid = String(productId || "").trim();
  if (!pid) return;
  await writeJson(keyProductById(pid), product, PRODUCT_DETAIL_TTL_SEC);
}

export async function getVariationByIdsCache(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return undefined;
  return await readJson<ProductVariation>(keyVariationByIds(pid, vid));
}

export async function writeVariationByIdsCache(
  productId: string,
  variationId: string,
  variation: ProductVariation,
): Promise<void> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return;
  await writeJson(keyVariationByIds(pid, vid), variation, VARIATION_DETAIL_TTL_SEC);
}

export async function invalidateProductByIdCache(productId: string): Promise<void> {
  const pid = String(productId || "").trim();
  if (!pid) return;

  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-invalidate-redis-unavailable", { productId: pid });
    return;
  }

  await redis.del(keyProductById(pid));
  cacheLog("invalidate-product", { productId: pid });
}

export async function invalidateVariationByIdsCache(
  productId: string,
  variationId: string,
): Promise<void> {
  const pid = String(productId || "").trim();
  const vid = String(variationId || "").trim();
  if (!pid || !vid) return;

  const redis = await getRedisOrNull();
  if (!redis) {
    cacheLog("skip-invalidate-redis-unavailable", {
      productId: pid,
      variationId: vid,
    });
    return;
  }

  await redis.del(keyVariationByIds(pid, vid));
  cacheLog("invalidate-variation", { productId: pid, variationId: vid });
}
