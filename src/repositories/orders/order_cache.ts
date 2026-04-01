import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderArticlesByOrderId,
  findOrderById,
  findOrdersBySellerFlowToken,
  findOrderStatusCountersByFlowToken,
  type OrderStatusCounters,
} from "@/repositories/orders/order_repo";
import { normToken } from "@/utils/core_utils";

const EMPTY_COUNTERS: OrderStatusCounters = {
  total: 0,
  completed: 0,
  in_delivery: 0,
  to_deliver: 0,
};

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
  return await findOrdersBySellerFlowToken(normalized);
}

export async function getOrdersForToken(token: string): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return await findOrdersBySellerFlowToken(normalized);
}

export function getCachedOrdersForToken(token: string): Order[] {
  void token;
  return [];
}

export async function loadAndCacheOrderCounters(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) return EMPTY_COUNTERS;

  try {
    const counters = await findOrderStatusCountersByFlowToken(normalized);
    if (counters.total > 0) return counters;

    const orders = await findOrdersBySellerFlowToken(normalized);
    return deriveCountersFromOrders(orders);
  } catch {
    return EMPTY_COUNTERS;
  }
}

export async function getOrderCountersForToken(
  token: string,
): Promise<OrderStatusCounters> {
  return await loadAndCacheOrderCounters(token);
}

export function getCachedOrderCountersForToken(
  token: string,
): OrderStatusCounters | undefined {
  void token;
  return undefined;
}

export async function loadAndCacheOrderDetail(
  orderId: string,
): Promise<Order | undefined> {
  const oid = String(orderId || "").trim();
  if (!oid) return undefined;
  return await findOrderById(oid);
}

export async function getOrderDetailById(
  orderId: string,
): Promise<Order | undefined> {
  return await loadAndCacheOrderDetail(orderId);
}

export async function loadAndCacheOrderArticles(
  orderId: string,
): Promise<OrderArticle[]> {
  const oid = String(orderId || "").trim();
  if (!oid) return [];
  return await findOrderArticlesByOrderId(oid);
}

export async function getOrderArticlesById(orderId: string): Promise<OrderArticle[]> {
  return await loadAndCacheOrderArticles(orderId);
}
