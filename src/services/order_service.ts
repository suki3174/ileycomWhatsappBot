import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderArticlesByOrderId,
  findOrderById,
  findOrdersBySellerFlowToken,
  filterOrdersByStatus,
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

