import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderSummariesPageByFlowToken,
  findOrdersBySellerFlowToken,
  filterOrdersByStatus,
  type OrderSummariesPage,
  type OrderStatusCounters,
} from "@/repositories/order_repo";
import {
  getCachedOrderCountersForToken,
  getOrderArticlesById,
  getCachedOrdersForToken,
  getOrderCountersForToken,
  getOrderDetailById,
  getOrdersForToken,
  loadAndCacheOrders,
  loadAndCacheOrderCounters,
} from "@/repositories/order_cache";
import { normToken } from "@/utils/utilities";

export async function getSellerOrdersByFlowToken(
  token: string,
): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return findOrdersBySellerFlowToken(normalized);
}

export async function getSellerOrderSummariesPage(
  token: string,
  statusFilter: string,
  page = 1,
  limit = 10,
): Promise<OrderSummariesPage> {
  const normalized = normToken(token);
  if (!normalized) {
    return {
      orders: [],
      page: 1,
      limit,
      hasMore: false,
      statusFilter: "all",
    };
  }

  return findOrderSummariesPageByFlowToken(normalized, statusFilter, page, limit);
}

export async function getOrderById(
  orderId: string,
): Promise<Order | undefined> {
  return getOrderDetailById(orderId);
}

export async function getOrderArticles(
  orderId: string,
): Promise<OrderArticle[]> {
  return getOrderArticlesById(orderId);
}

export async function getOrderStatusCounters(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  try {
    const counters = await getOrderCountersForToken(normalized);
    if (counters.total > 0) {
      return counters;
    }

    let orders = getCachedOrdersForToken(normalized);
    if (orders.length === 0) {
      // Fetch once when cache is cold to avoid returning transient 0 counters.
      orders = await getOrdersForToken(normalized);
      if (orders.length === 0) {
        return counters;
      }
    }

    let completed = 0;
    let inDelivery = 0;
    let toDeliver = 0;

    for (const order of orders) {
      if (order.status === "completed") {
        completed += 1;
      } else if (order.status === "in_delivery") {
        inDelivery += 1;
      } else {
        toDeliver += 1;
      }
    }

    return {
      total: orders.length,
      completed,
      in_delivery: inDelivery,
      to_deliver: toDeliver,
    };
  } catch {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }
}

export function getOrderStatusCountersCached(
  token: string,
): OrderStatusCounters {
  const normalized = normToken(token);
  if (!normalized) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  const cachedCounters = getCachedOrderCountersForToken(normalized);
  if (cachedCounters) return cachedCounters;

  const cachedOrders = getCachedOrdersForToken(normalized);
  if (cachedOrders.length === 0) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  let completed = 0;
  let inDelivery = 0;
  let toDeliver = 0;

  for (const order of cachedOrders) {
    if (order.status === "completed") {
      completed += 1;
    } else if (order.status === "in_delivery") {
      inDelivery += 1;
    } else {
      toDeliver += 1;
    }
  }

  return {
    total: cachedOrders.length,
    completed,
    in_delivery: inDelivery,
    to_deliver: toDeliver,
  };
}

export function filterOrdersForStatus(
  orders: Order[],
  statusFilter: string,
): Order[] {
  return filterOrdersByStatus(orders, statusFilter);
}

export function primeOrdersAsync(token: string): void {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return;
  void loadAndCacheOrders(normalized);
}

export function primeOrderCountersAsync(token: string): void {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return;
  void loadAndCacheOrderCounters(normalized);
}

