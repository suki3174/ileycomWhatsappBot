import { type Order, type OrderArticle, OrderStatus } from "@/models/oder_model";
import { pluginPostWithRetry, PLUGIN_TIMEOUT_MS } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
  toNum,
} from "@/utils/data_parser";
import { normToken } from "@/utils/core_utils";

const ORDER_LIST_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 15000);
const ORDER_COUNTERS_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 15000);
const ORDER_DETAIL_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 15000);

export interface OrderStatusCounters {
  total: number;
  completed: number;
  in_delivery: number;
  to_deliver: number;
}

export interface OrderSummariesPage {
  orders: Order[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
  statusFilter: string;
}

export interface OrderArticlesPage {
  articles: OrderArticle[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
  total: number;
}

function mapStatus(value: unknown): OrderStatus {
  const normalized = normText(value).toLowerCase();
  if (normalized === OrderStatus.COMPLETED) return OrderStatus.COMPLETED;
  if (normalized === OrderStatus.IN_DELIVERY) return OrderStatus.IN_DELIVERY;
  return OrderStatus.TO_DELIVER;
}

function cleanOrderText(value: unknown): string {
  const normalized = normText(value);
  if (!normalized) return "";

  return normalized
    .replace(/�/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function mapOrderArticle(raw: unknown): OrderArticle | undefined {
  const row = asRecord(raw);
  if (!row) return undefined;

  return {
    id: normText(row.id),
    name: normText(row.name),
    sku: normText(row.sku),
    quantity: toNum(row.quantity, 0),
    price: toNum(row.price, 0),
    currency: normText(row.currency),
    image: normText(row.image),
  };
}

function mapOrder(raw: unknown): Order | undefined {
  const row = asRecord(raw);
  if (!row) return undefined;

  const id = normText(row.id);
  if (!id) return undefined;

  const articles = Array.isArray(row.articles)
    ? row.articles
        .map((item) => mapOrderArticle(item))
        .filter((item): item is OrderArticle => !!item)
    : [];

  const tags = Array.isArray(row.tags)
    ? row.tags.map((item) => normText(item)).filter((item) => item !== "")
    : [];

  return {
    id,
    reference: cleanOrderText(row.reference),
    customer_name: cleanOrderText(row.customer_name),
    created_at: cleanOrderText(row.created_at),
    total: toNum(row.total, 0),
    currency: cleanOrderText(row.currency),
    status: mapStatus(row.status),
    tags,
    articles_count: toNum(row.articles_count, articles.length),
    payment_method: cleanOrderText(row.payment_method),
    transaction_id: cleanOrderText(row.transaction_id),
    customer_note: cleanOrderText(row.customer_note),
    articles,
    billing_info: cleanOrderText(row.billing_info),
    shipping_info: cleanOrderText(row.shipping_info),
    subtotal: toNum(row.subtotal, 0),
    shipping_cost: toNum(row.shipping_cost, 0),
  };
}

function extractDataObject(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  return asRecord(payload.data);
}

export async function findOrdersBySellerFlowToken(
  flowToken: string,
): Promise<Order[]> {
  const token = normToken(flowToken);
  if (!token) return [];

  try {
    const res = await pluginPostWithRetry(
      "/seller/orders/list/by-flow-token",
      { flow_token: token },
      { timeoutMs: ORDER_LIST_TIMEOUT_MS, retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin orders/list/by-flow-token failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return [];
    }

    const payload = await parsePluginJsonSafe(res, "plugin orders/list/by-flow-token");
    const data = extractDataObject(payload);
    if (!data || !Array.isArray(data.orders)) return [];

    const mapped = data.orders
      .map((item) => mapOrder(item))
      .filter((item): item is Order => !!item);

    console.log("orders/list/by-flow-token result", {
      tokenSuffix: token.slice(-6),
      rawCount: data.orders.length,
      mappedCount: mapped.length,
    });

    return mapped;
  } catch (err) {
    console.error("plugin orders/list/by-flow-token exception", err);
    return [];
  }
}

export async function findOrderStatusCountersByFlowToken(
  flowToken: string,
): Promise<OrderStatusCounters> {
  const token = normToken(flowToken);
  if (!token) {
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }

  try {
    const res = await pluginPostWithRetry(
      "/seller/orders/counters/by-flow-token",
      { flow_token: token },
      { timeoutMs: ORDER_COUNTERS_TIMEOUT_MS, retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin orders/counters/by-flow-token failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
    }

    const payload = await parsePluginJsonSafe(res, "plugin orders/counters/by-flow-token");
    const data = extractDataObject(payload);
    const counters = asRecord(data?.counters);

    return {
      total: toNum(counters?.total, 0),
      completed: toNum(counters?.completed, 0),
      in_delivery: toNum(counters?.in_delivery, 0),
      to_deliver: toNum(counters?.to_deliver, 0),
    };
  } catch (err) {
    console.error("plugin orders/counters/by-flow-token exception", err);
    return { total: 0, completed: 0, in_delivery: 0, to_deliver: 0 };
  }
}

export async function findOrderById(
  orderId: string,
): Promise<Order | undefined> {
  const oid = normText(orderId);
  if (!oid) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/order/by-id",
      { order_id: oid },
      { timeoutMs: ORDER_DETAIL_TIMEOUT_MS, retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin order/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return undefined;
    }

    const payload = await parsePluginJsonSafe(res, "plugin order/by-id");
    const data = extractDataObject(payload);
    if (!data) return undefined;

    return mapOrder(data.order);
  } catch (err) {
    console.error("plugin order/by-id exception", err);
    return undefined;
  }
}

export async function findOrderSummariesPageByFlowToken(
  flowToken: string,
  statusFilter: string,
  page = 1,
  limit = 5,
): Promise<OrderSummariesPage> {
  const token = normToken(flowToken);
  if (!token) {
    return {
      orders: [],
      page: 1,
      limit: Math.max(1, limit),
      hasMore: false,
      statusFilter: "all",
    };
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(5, Math.max(1, Math.floor(limit)))
    : 5;
  const safeFilter = normText(statusFilter).toLowerCase() || "all";

  try {
    const res = await pluginPostWithRetry(
      "/seller/orders/list/by-flow-token",
      {
        flow_token: token,
        status_filter: safeFilter,
        page: safePage,
        limit: safeLimit,
      },
      { timeoutMs: ORDER_LIST_TIMEOUT_MS, retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin orders/list/by-flow-token paged failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return {
        orders: [],
        page: safePage,
        limit: safeLimit,
        hasMore: false,
        statusFilter: safeFilter,
      };
    }

    const payload = await parsePluginJsonSafe(
      res,
      "plugin orders/list/by-flow-token paged",
    );
    const data = extractDataObject(payload);

    const rawOrders = Array.isArray(data?.orders) ? data.orders : [];
    const mapped = rawOrders
      .map((item) => mapOrder(item))
      .filter((item): item is Order => !!item);

    const parsedPage = toNum(data?.page, safePage) || safePage;
    const parsedLimit = toNum(data?.limit, safeLimit) || safeLimit;
    const parsedFilter = normText(data?.status_filter).toLowerCase() || safeFilter;
    const hasMore = Boolean(data?.has_more);
    const nextPageNum = toNum(data?.next_page, 0);

    return {
      orders: mapped,
      page: parsedPage,
      limit: parsedLimit,
      hasMore,
      nextPage: nextPageNum > 0 ? nextPageNum : undefined,
      statusFilter: parsedFilter,
    };
  } catch (err) {
    console.error("plugin orders/list/by-flow-token paged exception", err);
    return {
      orders: [],
      page: safePage,
      limit: safeLimit,
      hasMore: false,
      statusFilter: safeFilter,
    };
  }
}

export async function findOrderArticlesByOrderId(
  orderId: string,
): Promise<OrderArticle[]> {
  const oid = normText(orderId);
  if (!oid) return [];

  try {
    const res = await pluginPostWithRetry(
      "/seller/order/articles/by-id",
      { order_id: oid },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 10000), retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin order/articles/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return [];
    }

    const payload = await parsePluginJsonSafe(res, "plugin order/articles/by-id");
    const data = extractDataObject(payload);
    if (!data || !Array.isArray(data.articles)) return [];

    return data.articles
      .map((item) => mapOrderArticle(item))
      .filter((item): item is OrderArticle => !!item);
  } catch (err) {
    console.error("plugin order/articles/by-id exception", err);
    return [];
  }
}

export async function findOrderArticlesPageByOrderId(
  orderId: string,
  page = 1,
  limit = 3,
): Promise<OrderArticlesPage> {
  const oid = normText(orderId);
  if (!oid) {
    return { articles: [], page: 1, limit: Math.max(1, limit), hasMore: false, total: 0 };
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(3, Math.max(1, Math.floor(limit)))
    : 3;

  try {
    const res = await pluginPostWithRetry(
      "/seller/order/articles/by-id",
      { order_id: oid, page: safePage, limit: safeLimit },
      { timeoutMs: Math.max(PLUGIN_TIMEOUT_MS, 10000), retries: 0, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin order/articles/by-id paged failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return { articles: [], page: safePage, limit: safeLimit, hasMore: false, total: 0 };
    }

    const payload = await parsePluginJsonSafe(res, "plugin order/articles/by-id paged");
    const data = extractDataObject(payload);
    const rawArticles = Array.isArray(data?.articles) ? data.articles : [];
    const mapped = rawArticles
      .map((item) => mapOrderArticle(item))
      .filter((item): item is OrderArticle => !!item);

    const parsedPage = toNum(data?.page, safePage) || safePage;
    const parsedLimit = toNum(data?.limit, safeLimit) || safeLimit;
    const hasMore = Boolean(data?.has_more);
    const nextPageNum = toNum(data?.next_page, 0);
    const total = toNum(data?.total, mapped.length);

    return {
      articles: mapped,
      page: parsedPage,
      limit: parsedLimit,
      hasMore,
      nextPage: nextPageNum > 0 ? nextPageNum : undefined,
      total,
    };
  } catch (err) {
    console.error("plugin order/articles/by-id paged exception", err);
    return { articles: [], page: safePage, limit: safeLimit, hasMore: false, total: 0 };
  }
}

export function filterOrdersByStatus(
  orders: Order[],
  statusFilter: string,
): Order[] {
  if (!statusFilter || statusFilter === "all") return orders;
  if (statusFilter === OrderStatus.COMPLETED) {
    return orders.filter((o) => o.status === OrderStatus.COMPLETED);
  }
  if (statusFilter === OrderStatus.IN_DELIVERY) {
    return orders.filter((o) => o.status === OrderStatus.IN_DELIVERY);
  }
  if (statusFilter === OrderStatus.TO_DELIVER) {
    return orders.filter((o) => o.status === OrderStatus.TO_DELIVER);
  }
  return orders;
}

