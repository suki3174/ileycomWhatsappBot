/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderById,
  findOrderArticlesByOrderId,
  findOrderStatusCountersByFlowToken,
  findOrderSummariesPageByFlowToken,
  findOrdersBySellerFlowToken,
  filterOrdersByStatus,
  type OrderSummariesPage,
  type OrderStatusCounters,
} from "@/repositories/order_repo";
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

  try {
    return await findOrderStatusCountersByFlowToken(normalized);
  } catch {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }
}

export function getOrderStatusCountersCached(
  _token: string,
): OrderStatusCounters {
  return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
}

export function filterOrdersForStatus(
  orders: Order[],
  statusFilter: string,
): Order[] {
  return filterOrdersByStatus(orders, statusFilter);
}

export function primeOrdersAsync(token: string): void {
  void token;
}

export function primeOrderCountersAsync(token: string): void {
  void token;
}

