import type { Order } from "@/models/oder_model";
import { getSellerOrdersByFlowToken } from "@/services/order_service";
import { normToken } from "@/utils/utilities";

interface OrderListCacheEntry {
  orders: Order[];
  preparedAt: number;
}

const ORDER_CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_ORDER_CACHE_REFRESH_MS = 15 * 1000;

declare global {
  var orderListCache: Map<string, OrderListCacheEntry> | undefined;
  var orderListInflight: Map<string, Promise<Order[]>> | undefined;
}

globalThis.orderListCache =
  globalThis.orderListCache || new Map<string, OrderListCacheEntry>();
globalThis.orderListInflight =
  globalThis.orderListInflight || new Map<string, Promise<Order[]>>();

const orderListCache = globalThis.orderListCache;
const orderListInflight = globalThis.orderListInflight;

export async function loadAndCacheOrders(token: string): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];

  const existing = orderListInflight.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    try {
      const orders = await getSellerOrdersByFlowToken(normalized);
      console.log("orderCache refresh", {
        tokenSuffix: normalized.slice(-6),
        fetchedCount: orders.length,
      });
      orderListCache.set(normalized, {
        orders,
        preparedAt: Date.now(),
      });
      return orders;
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

