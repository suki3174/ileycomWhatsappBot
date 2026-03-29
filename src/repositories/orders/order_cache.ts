import type { Order } from "@/models/oder_model";
import type { OrderArticle } from "@/models/oder_model";
import {
  findOrderArticlesByOrderId,
  findOrderById,
  findOrdersBySellerFlowToken,
  findOrderStatusCountersByFlowToken,
  type OrderStatusCounters,
} from "@/repositories/orders/order_repo";
import { normToken } from "@/utils/core_utils";

interface OrderListCacheEntry {
  orders: Order[];
  preparedAt: number;
}

interface OrderCountersCacheEntry {
  counters: OrderStatusCounters;
  preparedAt: number;
}

interface OrderDetailCacheEntry {
  order: Order;
  preparedAt: number;
}

interface OrderArticlesCacheEntry {
  articles: OrderArticle[];
  preparedAt: number;
}

const ORDER_CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_ORDER_CACHE_REFRESH_MS = 15 * 1000;
const ORDER_COUNTERS_TTL_MS = 60 * 1000;
const ORDER_DETAIL_TTL_MS = 5 * 60 * 1000;
const ORDER_ARTICLES_TTL_MS = 5 * 60 * 1000;

const EMPTY_COUNTERS: OrderStatusCounters = {
  total: 0,
  completed: 0,
  in_delivery: 0,
  to_deliver: 0,
};

declare global {
  var orderListCache: Map<string, OrderListCacheEntry> | undefined;
  var orderListInflight: Map<string, Promise<Order[]>> | undefined;
  var orderCountersCache: Map<string, OrderCountersCacheEntry> | undefined;
  var orderCountersInflight:
    | Map<string, Promise<OrderStatusCounters>>
    | undefined;
  var orderDetailCache: Map<string, OrderDetailCacheEntry> | undefined;
  var orderDetailInflight: Map<string, Promise<Order | undefined>> | undefined;
  var orderArticlesCache: Map<string, OrderArticlesCacheEntry> | undefined;
  var orderArticlesInflight:
    | Map<string, Promise<OrderArticle[]>>
    | undefined;
}

globalThis.orderListCache =
  globalThis.orderListCache || new Map<string, OrderListCacheEntry>();
globalThis.orderListInflight =
  globalThis.orderListInflight || new Map<string, Promise<Order[]>>();
globalThis.orderCountersCache =
  globalThis.orderCountersCache || new Map<string, OrderCountersCacheEntry>();
globalThis.orderCountersInflight =
  globalThis.orderCountersInflight ||
  new Map<string, Promise<OrderStatusCounters>>();
globalThis.orderDetailCache =
  globalThis.orderDetailCache || new Map<string, OrderDetailCacheEntry>();
globalThis.orderDetailInflight =
  globalThis.orderDetailInflight || new Map<string, Promise<Order | undefined>>();
globalThis.orderArticlesCache =
  globalThis.orderArticlesCache || new Map<string, OrderArticlesCacheEntry>();
globalThis.orderArticlesInflight =
  globalThis.orderArticlesInflight || new Map<string, Promise<OrderArticle[]>>();

const orderListCache = globalThis.orderListCache;
const orderListInflight = globalThis.orderListInflight;
const orderCountersCache = globalThis.orderCountersCache;
const orderCountersInflight = globalThis.orderCountersInflight;
const orderDetailCache = globalThis.orderDetailCache;
const orderDetailInflight = globalThis.orderDetailInflight;
const orderArticlesCache = globalThis.orderArticlesCache;
const orderArticlesInflight = globalThis.orderArticlesInflight;

function deriveCountersFromOrders(orders: Order[]): OrderStatusCounters {
  const counters: OrderStatusCounters = {
    total: orders.length,
    completed: 0,
    in_delivery: 0,
    to_deliver: 0,
  };

  for (const order of orders) {
    if (order.status === "completed") {
      counters.completed += 1;
    } else if (order.status === "in_delivery") {
      counters.in_delivery += 1;
    } else {
      counters.to_deliver += 1;
    }
  }

  return counters;
}

export async function loadAndCacheOrders(token: string): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const existing = orderListInflight.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    try {
      // Direct repository call avoids service/cache circular dependency.
      const fetched = await findOrdersBySellerFlowToken(normalized);
      const existing = orderListCache.get(normalized);

      // Do not poison a warm cache with an empty fetch result caused by
      // transient plugin timeout/errors.
      if (fetched.length === 0 && existing && existing.orders.length > 0) {
        console.log("orderCache preserve-non-empty", {
          tokenSuffix: normalized.slice(-6),
          cachedCount: existing.orders.length,
        });
        return existing.orders;
      }

      // On a cold cache, do not persist empty results. This keeps retries alive
      // for transient timeouts instead of pinning the token to zero orders.
      if (fetched.length === 0 && !existing) {
        console.log("orderCache skip-empty-cold", {
          tokenSuffix: normalized.slice(-6),
        });
        return [];
      }

      console.log("orderCache refresh", {
        tokenSuffix: normalized.slice(-6),
        fetchedCount: fetched.length,
      });
      orderListCache.set(normalized, {
        orders: fetched,
        preparedAt: Date.now(),
      });
      return fetched;
    } catch (err) {
      console.error("loadAndCacheOrders failed", err);
      return [];
    } finally {
      orderListInflight.delete(normalized);
    }
  })();

  orderListInflight.set(normalized, task);

  return task;
}

export async function getOrdersForToken(token: string): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const entry = orderListCache.get(normalized);
  if (entry) {
    const ageMs = Date.now() - entry.preparedAt;
    const isFresh = ageMs <= ORDER_CACHE_TTL_MS;

    if (isFresh) {
      // Empty caches are refreshed faster to avoid keeping a stale "0 orders" state.
      if (entry.orders.length === 0 && ageMs > EMPTY_ORDER_CACHE_REFRESH_MS) {
        console.log("orderCache stale-empty-refresh", {
          tokenSuffix: normalized.slice(-6),
          ageMs,
        });
        return loadAndCacheOrders(normalized);
      }

      console.log("orderCache hit", {
        tokenSuffix: normalized.slice(-6),
        ageMs,
        cachedCount: entry.orders.length,
      });
      return entry.orders;
    }
  }

  console.log("orderCache miss", {
    tokenSuffix: normalized.slice(-6),
  });

  return loadAndCacheOrders(normalized);
}

export function getCachedOrdersForToken(token: string): Order[] {
  const normalized = normToken(token);
  if (!normalized) return [];

  const entry = orderListCache.get(normalized);
  if (!entry) return [];

  const ageMs = Date.now() - entry.preparedAt;
  if (ageMs > ORDER_CACHE_TTL_MS) return [];

  return entry.orders;
}

export async function loadAndCacheOrderCounters(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) return EMPTY_COUNTERS;

  const existing = orderCountersInflight.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    try {
      const counters = await findOrderStatusCountersByFlowToken(normalized);
      const existing = orderCountersCache.get(normalized);

      // Keep existing non-zero counters when fresh fetch yields zeros.
      if (
        counters.total === 0 &&
        existing &&
        existing.counters.total > 0
      ) {
        return existing.counters;
      }

      if (counters.total === 0) {
        const listEntry = orderListCache.get(normalized);
        if (listEntry && listEntry.orders.length > 0) {
          const derived = deriveCountersFromOrders(listEntry.orders);
          orderCountersCache.set(normalized, {
            counters: derived,
            preparedAt: Date.now(),
          });
          return derived;
        }
      }

      orderCountersCache.set(normalized, {
        counters,
        preparedAt: Date.now(),
      });
      return counters;
    } catch (err) {
      console.error("loadAndCacheOrderCounters failed", err);

      // Fallback to cached order list to keep ORDER_STATUS responsive on
      // transient plugin counter endpoint timeouts.
      const listEntry = orderListCache.get(normalized);
      if (listEntry && listEntry.orders.length > 0) {
        const derived = deriveCountersFromOrders(listEntry.orders);
        orderCountersCache.set(normalized, {
          counters: derived,
          preparedAt: Date.now(),
        });
        return derived;
      }

      return EMPTY_COUNTERS;
    } finally {
      orderCountersInflight.delete(normalized);
    }
  })();

  orderCountersInflight.set(normalized, task);
  return task;
}

export async function getOrderCountersForToken(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) return EMPTY_COUNTERS;

  const entry = orderCountersCache.get(normalized);
  if (entry && Date.now() - entry.preparedAt <= ORDER_COUNTERS_TTL_MS) {
    return entry.counters;
  }

  return loadAndCacheOrderCounters(normalized);
}

export function getCachedOrderCountersForToken(
  token: string,
): OrderStatusCounters | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const entry = orderCountersCache.get(normalized);
  if (!entry) return undefined;
  if (Date.now() - entry.preparedAt > ORDER_COUNTERS_TTL_MS) {
    return undefined;
  }

  return entry.counters;
}

export async function loadAndCacheOrderDetail(
  orderId: string,
): Promise<Order | undefined> {
  const oid = String(orderId || "").trim();
  if (!oid) return undefined;

  const existing = orderDetailInflight.get(oid);
  if (existing) return existing;

  const task = (async () => {
    try {
      const order = await findOrderById(oid);
      if (order) {
        orderDetailCache.set(oid, {
          order,
          preparedAt: Date.now(),
        });
      }
      return order;
    } catch (err) {
      console.error("loadAndCacheOrderDetail failed", err);
      return undefined;
    } finally {
      orderDetailInflight.delete(oid);
    }
  })();

  orderDetailInflight.set(oid, task);
  return task;
}

export async function getOrderDetailById(
  orderId: string,
): Promise<Order | undefined> {
  const oid = String(orderId || "").trim();
  if (!oid) return undefined;

  const entry = orderDetailCache.get(oid);
  if (entry && Date.now() - entry.preparedAt <= ORDER_DETAIL_TTL_MS) {
    return entry.order;
  }

  return loadAndCacheOrderDetail(oid);
}

export async function loadAndCacheOrderArticles(
  orderId: string,
): Promise<OrderArticle[]> {
  const oid = String(orderId || "").trim();
  if (!oid) return [];

  const existing = orderArticlesInflight.get(oid);
  if (existing) return existing;

  const task = (async () => {
    try {
      const articles = await findOrderArticlesByOrderId(oid);
      orderArticlesCache.set(oid, {
        articles,
        preparedAt: Date.now(),
      });
      return articles;
    } catch (err) {
      console.error("loadAndCacheOrderArticles failed", err);
      return [];
    } finally {
      orderArticlesInflight.delete(oid);
    }
  })();

  orderArticlesInflight.set(oid, task);
  return task;
}

export async function getOrderArticlesById(orderId: string): Promise<OrderArticle[]> {
  const oid = String(orderId || "").trim();
  if (!oid) return [];

  const entry = orderArticlesCache.get(oid);
  if (entry && Date.now() - entry.preparedAt <= ORDER_ARTICLES_TTL_MS) {
    return entry.articles;
  }

  return loadAndCacheOrderArticles(oid);
}

