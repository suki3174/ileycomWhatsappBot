import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderStatusCountersByFlowToken,
  findOrderArticlesByOrderId,
  findOrderById,
  findOrdersBySellerFlowToken,
  filterOrdersByStatus,
  type OrderStatusCounters,
} from "@/repositories/order_repo";
import { loadAndCacheOrders } from "@/repositories/order_cache";
import { normToken } from "@/utils/utilities";

export async function getSellerOrdersByFlowToken(
  token: string,
): Promise<Order[]> {
  const normalized = normToken(token);
  if (!normalized) return [];
  return findOrdersBySellerFlowToken(normalized);
}

export async function getOrderById(
  orderId: string,
): Promise<Order | undefined> {
  return findOrderById(orderId);
}

export async function getOrderArticles(
  orderId: string,
): Promise<OrderArticle[]> {
  return findOrderArticlesByOrderId(orderId);
}

export async function getOrderStatusCounters(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  return findOrderStatusCountersByFlowToken(normalized);
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

