import type { FlowResponse } from "@/models/flowResponse";
import type { Order } from "@/models/oder_model";
import type {
  OrderArticlesPage,
  OrderStatusCounters,
  OrderSummariesPage,
} from "@/repositories/orders/order_repo";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

const ORDERS_COUNTERS_TTL_SEC = 90;
const ORDERS_SUMMARIES_TTL_SEC = 120;
const ORDER_DETAIL_TTL_SEC = 180;
const ORDER_ARTICLES_TTL_SEC = 120;
const ORDERS_SCREEN_TTL_SEC = 120;

function isOrdersCacheDebugEnabled(): boolean {
  const raw = String(process.env.ORDERS_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isOrdersCacheDebugEnabled()) return;
  console.log("[orders-cache]", event, details);
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

function sanitizeFilter(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "all";
}

function safePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function keyOrderCountersByToken(token: string): string {
  return `${getRedisPrefix()}:orders:data:counters:token:${token}`;
}

function keyOrderSummariesByToken(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
): string {
  return `${getRedisPrefix()}:orders:data:summaries:token:${token}:filter:${statusFilter}:page:${page}:limit:${limit}`;
}

function keyOrderDetail(orderId: string, token?: string): string {
  if (token) {
    return `${getRedisPrefix()}:orders:data:detail:token:${token}:order:${orderId}`;
  }
  return `${getRedisPrefix()}:orders:data:detail:order:${orderId}`;
}

function keyOrderArticlesPage(
  orderId: string,
  page: number,
  limit: number,
  token?: string,
): string {
  if (token) {
    return `${getRedisPrefix()}:orders:data:articles:token:${token}:order:${orderId}:page:${page}:limit:${limit}`;
  }
  return `${getRedisPrefix()}:orders:data:articles:order:${orderId}:page:${page}:limit:${limit}`;
}

function keyOrderStatusScreen(token: string): string {
  return `${getRedisPrefix()}:orders:screen:status:token:${token}`;
}

function keyOrderListScreen(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
): string {
  return `${getRedisPrefix()}:orders:screen:list:token:${token}:filter:${statusFilter}:page:${page}:limit:${limit}`;
}

function keyOrderDetailScreen(token: string, orderId: string): string {
  return `${getRedisPrefix()}:orders:screen:detail:token:${token}:order:${orderId}`;
}

function keyOrderArticlesScreen(
  token: string,
  orderId: string,
  page: number,
  limit: number,
): string {
  return `${getRedisPrefix()}:orders:screen:articles:token:${token}:order:${orderId}:page:${page}:limit:${limit}`;
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

export async function getOrderStatusCountersCache(
  token: string,
): Promise<OrderStatusCounters | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  return await readJson<OrderStatusCounters>(keyOrderCountersByToken(normalized));
}

export async function writeOrderStatusCountersCache(
  token: string,
  counters: OrderStatusCounters,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  await writeJson(keyOrderCountersByToken(normalized), counters, ORDERS_COUNTERS_TTL_SEC);
}

export async function getOrderSummariesPageCache(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
): Promise<OrderSummariesPage | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const safeFilter = sanitizeFilter(statusFilter);
  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 10);

  return await readJson<OrderSummariesPage>(
    keyOrderSummariesByToken(normalized, safeFilter, safePage, safeLimit),
  );
}

export async function writeOrderSummariesPageCache(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
  payload: OrderSummariesPage,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  const safeFilter = sanitizeFilter(statusFilter);
  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 10);

  await writeJson(
    keyOrderSummariesByToken(normalized, safeFilter, safePage, safeLimit),
    payload,
    ORDERS_SUMMARIES_TTL_SEC,
  );
}

export async function getOrderDetailCache(
  orderId: string,
  token?: string,
): Promise<Order | undefined> {
  const oid = String(orderId || "").trim();
  if (!oid) return undefined;

  const normalizedToken = normToken(token || "");
  return await readJson<Order>(keyOrderDetail(oid, normalizedToken || undefined));
}

export async function writeOrderDetailCache(
  orderId: string,
  order: Order,
  token?: string,
): Promise<void> {
  const oid = String(orderId || "").trim();
  if (!oid) return;

  const normalizedToken = normToken(token || "");
  await writeJson(
    keyOrderDetail(oid, normalizedToken || undefined),
    order,
    ORDER_DETAIL_TTL_SEC,
  );
}

export async function getOrderArticlesPageCache(
  orderId: string,
  page: number,
  limit: number,
  token?: string,
): Promise<OrderArticlesPage | undefined> {
  const oid = String(orderId || "").trim();
  if (!oid) return undefined;

  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 3);
  const normalizedToken = normToken(token || "");

  return await readJson<OrderArticlesPage>(
    keyOrderArticlesPage(oid, safePage, safeLimit, normalizedToken || undefined),
  );
}

export async function writeOrderArticlesPageCache(
  orderId: string,
  page: number,
  limit: number,
  payload: OrderArticlesPage,
  token?: string,
): Promise<void> {
  const oid = String(orderId || "").trim();
  if (!oid) return;

  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 3);
  const normalizedToken = normToken(token || "");

  await writeJson(
    keyOrderArticlesPage(oid, safePage, safeLimit, normalizedToken || undefined),
    payload,
    ORDER_ARTICLES_TTL_SEC,
  );
}

export async function getOrderStatusScreenCache(
  token: string,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  return await readJson<FlowResponse>(keyOrderStatusScreen(normalized));
}

export async function writeOrderStatusScreenCache(
  token: string,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  await writeJson(keyOrderStatusScreen(normalized), response, ORDERS_SCREEN_TTL_SEC);
}

export async function getOrderListScreenCache(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const safeFilter = sanitizeFilter(statusFilter);
  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 10);
  return await readJson<FlowResponse>(
    keyOrderListScreen(normalized, safeFilter, safePage, safeLimit),
  );
}

export async function writeOrderListScreenCache(
  token: string,
  statusFilter: string,
  page: number,
  limit: number,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  const safeFilter = sanitizeFilter(statusFilter);
  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 10);
  await writeJson(
    keyOrderListScreen(normalized, safeFilter, safePage, safeLimit),
    response,
    ORDERS_SCREEN_TTL_SEC,
  );
}

export async function getOrderDetailScreenCache(
  token: string,
  orderId: string,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  const oid = String(orderId || "").trim();
  if (!normalized || !oid) return undefined;
  return await readJson<FlowResponse>(keyOrderDetailScreen(normalized, oid));
}

export async function writeOrderDetailScreenCache(
  token: string,
  orderId: string,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  const oid = String(orderId || "").trim();
  if (!normalized || !oid) return;
  await writeJson(
    keyOrderDetailScreen(normalized, oid),
    response,
    ORDERS_SCREEN_TTL_SEC,
  );
}

export async function getOrderArticlesScreenCache(
  token: string,
  orderId: string,
  page: number,
  limit: number,
): Promise<FlowResponse | undefined> {
  const normalized = normToken(token);
  const oid = String(orderId || "").trim();
  if (!normalized || !oid) return undefined;

  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 3);
  return await readJson<FlowResponse>(
    keyOrderArticlesScreen(normalized, oid, safePage, safeLimit),
  );
}

export async function writeOrderArticlesScreenCache(
  token: string,
  orderId: string,
  page: number,
  limit: number,
  response: FlowResponse,
): Promise<void> {
  const normalized = normToken(token);
  const oid = String(orderId || "").trim();
  if (!normalized || !oid) return;

  const safePage = safePositiveInt(page, 1);
  const safeLimit = safePositiveInt(limit, 3);
  await writeJson(
    keyOrderArticlesScreen(normalized, oid, safePage, safeLimit),
    response,
    ORDERS_SCREEN_TTL_SEC,
  );
}

export async function invalidateOrdersByToken(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  await deleteByPrefix(`${getRedisPrefix()}:orders:data:counters:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:data:summaries:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:data:detail:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:data:articles:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:screen:status:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:screen:list:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:screen:detail:token:${normalized}`);
  await deleteByPrefix(`${getRedisPrefix()}:orders:screen:articles:token:${normalized}`);
}
