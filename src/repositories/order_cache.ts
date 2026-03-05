import type { Order } from "@/models/oder_model";
import { getSellerOrdersByFlowToken } from "@/services/order_service";

interface OrderListCacheEntry {
  orders: Order[];
  preparedAt: number;
}

const ORDER_CACHE_TTL_MS = 5 * 60 * 1000;

declare global {
  var orderListCache: Map<string, OrderListCacheEntry> | undefined;
}

globalThis.orderListCache =
  globalThis.orderListCache || new Map<string, OrderListCacheEntry>();

const orderListCache = globalThis.orderListCache;

export async function loadAndCacheOrders(token: string): Promise<Order[]> {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return [];
  try {
    const orders = await getSellerOrdersByFlowToken(normalized);
    orderListCache.set(normalized, {
      orders,
      preparedAt: Date.now(),
    });
    return orders;
  } catch (err) {
    console.error("loadAndCacheOrders failed", err);
    return [];
  }
}

export async function getOrdersForToken(token: string): Promise<Order[]> {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return [];

  const entry = orderListCache.get(normalized);
  if (entry && Date.now() - entry.preparedAt <= ORDER_CACHE_TTL_MS) {
    return entry.orders;
  }

  return loadAndCacheOrders(normalized);
}

