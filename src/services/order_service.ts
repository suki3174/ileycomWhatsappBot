/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Order, OrderArticle } from "@/models/oder_model";
import {
  findOrderById,
  findOrderArticlesByOrderId,
  findOrderArticlesPageByOrderId,
  findOrderStatusCountersByFlowToken,
  findOrderSummariesPageByFlowToken,
  findOrdersBySellerFlowToken,
  filterOrdersByStatus,
  type OrderArticlesPage,
  type OrderSummariesPage,
  type OrderStatusCounters,
} from "@/repositories/orders/order_repo";
import { normToken } from "@/utils/core_utils";
import {
  getOrderArticlesPageCache,
  getOrderDetailCache,
  getOrderStatusCountersCache,
  getOrderSummariesPageCache,
  writeOrderArticlesPageCache,
  writeOrderDetailCache,
  writeOrderStatusCountersCache,
  writeOrderSummariesPageCache,
} from "@/services/cache/orders_cache_service";

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
  limit = 5,
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

  const cached = await getOrderSummariesPageCache(
    normalized,
    statusFilter,
    page,
    limit,
  );
  if (cached) return cached;

  const fresh = await findOrderSummariesPageByFlowToken(
    normalized,
    statusFilter,
    page,
    limit,
  );
  await writeOrderSummariesPageCache(
    normalized,
    statusFilter,
    page,
    limit,
    fresh,
  );

  return fresh;
}

export async function getOrderById(
  orderId: string,
  token?: string,
): Promise<Order | undefined> {
  const cached = await getOrderDetailCache(orderId, token);
  if (cached) return cached;

  const fresh = await findOrderById(orderId);
  if (fresh) {
    await writeOrderDetailCache(orderId, fresh, token);
  }

  return fresh;
}

export async function getOrderArticles(
  orderId: string,
): Promise<OrderArticle[]> {
  return findOrderArticlesByOrderId(orderId);
}

export async function getOrderArticlesPage(
  orderId: string,
  page = 1,
  limit = 3,
  token?: string,
): Promise<OrderArticlesPage> {
  const cached = await getOrderArticlesPageCache(orderId, page, limit, token);
  if (cached) return cached;

  const fresh = await findOrderArticlesPageByOrderId(orderId, page, limit);
  await writeOrderArticlesPageCache(orderId, page, limit, fresh, token);
  return fresh;
}

export async function getOrderStatusCounters(
  token: string,
): Promise<OrderStatusCounters> {
  const normalized = normToken(token);
  if (!normalized) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  const cached = await getOrderStatusCountersCache(normalized);
  if (cached) return cached;

  try {
    const fresh = await findOrderStatusCountersByFlowToken(normalized);
    await writeOrderStatusCountersCache(normalized, fresh);
    return fresh;
  } catch {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }
}









