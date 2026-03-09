/* eslint-disable @typescript-eslint/no-explicit-any */


import { FlowRequest } from "@/models/flowRequest";
import type { Order, OrderArticle } from "@/models/oder_model";
import crypto from "crypto";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const normToken = (t: string): string => (t ? String(t).trim() : "");

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function formatSimplePrices(product: any): string {
  const euro = String(
    product?.promo_price_euro ?? product?.general_price_euro ?? "",
  ).trim();
  const tnd = String(
    product?.promo_price_tnd ?? product?.general_price_tnd ?? "",
  ).trim();

  if (!euro && !tnd) return "Prix non renseigne";
  if (!euro) return `${tnd} TND`;
  if (!tnd) return `${euro} EUR`;
  return `${euro} EUR | ${tnd} TND`;
}

export function formatStock(product: any): string {
  if (!product.manage_stock) return "Stock non géré";
  return `${product.stock_quantity ?? 0} en stock`;
}

export function getFlowToken(parsed: FlowRequest): string {
  const t = parsed?.data?.flow_token ?? parsed?.flow_token ?? "";
  return typeof t === "string" ? t.trim() : String(t).trim();
}

export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  currentPage: number;
} {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(safePage, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    pageItems,
    totalItems,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    currentPage,
  };
}

export function formatOrderStatusCounters(orders: Order[]): {
  id: string;
  title: string;
}[] {
  const total = orders.length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const inDelivery = orders.filter((o) => o.status === "in_delivery").length;
  const toDeliver = orders.filter((o) => o.status === "to_deliver").length;

  return [
    {
      id: "all",
      title: `🗂️ Total  —  ${total}`,
    },
    {
      id: "completed",
      title: `✅ Terminées  —  ${completed}`,
    },
    {
      id: "in_delivery",
      title: `🚚 En livraison  —  ${inDelivery}`,
    },
    {
      id: "to_deliver",
      title: `📦 À Livrer  —  ${toDeliver}`,
    },
  ];
}

export function formatOrderListItem(order: Order) {
  const articlesCount =
    typeof order.articles_count === "number"
      ? order.articles_count
      : order.articles.length;
  const metadata = `${order.created_at} · ${articlesCount} article${articlesCount > 1 ? "s" : ""}`;

  return {
    id: order.id,
    "main-content": {
      title: order.reference,
      description: order.customer_name,
      metadata,
    },
    end: {
      title: String(order.total),
      metadata: order.currency,
    },
    tags: order.tags ?? [],
    "on-click-action": {
      name: "data_exchange",
      payload: {
        order_id: order.id,
        cmd: "order_details",
      },
    },
  };
}

export function formatEmptyOrderListItem() {
  return {
    id: "empty",
    "main-content": {
      title: "Aucune commande",
      description: "Aucun résultat trouvé",
      metadata: "Essayez un autre filtre",
    },
    end: { title: "", metadata: "" },
    tags: [],
    "on-click-action": {
      name: "navigate",
       next: {
        type: "screen",
        name: "ORDER_STATUS",
      },
      payload: {
      },
    },
  };
}

export function formatOrderDetail(order: Order) {
  const articlesCount = order.articles.length;
  const articlesTotal = order.subtotal;

  return {
    order_id: order.id,
    order_ref: order.reference,
    order_date: order.created_at,
    status: order.tags[0] ? `✅ Commande ${order.tags[0].toLowerCase()}` : "",
    total: `${order.total} ${order.currency}`,
    payment_method: order.payment_method,
    transaction_id: order.transaction_id || "N/A",
    customer_note: order.customer_note,
    articles_summary: `${articlesCount} article${articlesCount > 1 ? "s" : ""} — ${articlesTotal} ${order.currency}`,
    billing_info: order.billing_info,
    shipping_info: order.shipping_info,
    subtotal: `${order.subtotal} ${order.currency}`,
    shipping_cost: `${order.shipping_cost} ${order.currency}`,
    total_summary: `${order.total} ${order.currency}`,
  };
}

export function formatOrderArticlesPage(
  orderId: string,
  orderRef: string,
  articles: OrderArticle[],
  currentPage: number,
  pageSize: number,
) {
  const {
    pageItems,
    totalPages,
    hasNext,
    hasPrev,
    currentPage: safePage,
  } = paginateArray(articles, currentPage, pageSize);

  const [a1, a2, a3] = pageItems;

  return {
    order_id: orderId,
    order_ref: orderRef,
    current_page: safePage,
    next_page: safePage + 1,      // ← add this
    prev_page: safePage - 1,      // ← add this
    has_next: hasNext,
    has_prev: hasPrev,
    page_label: `Page ${safePage} / ${totalPages}`,
    p1_img: a1?.image ?? "",
    p1_name: a1?.name ?? "",
    p1_sku: a1?.sku ?? "",
    p1_qty_price: a1 ? `${a1.quantity} × ${a1.price} ${a1.currency}` : "",
    p2_img: a2?.image ?? "",
    p2_name: a2?.name ?? "",
    p2_sku: a2?.sku ?? "",
    p2_qty_price: a2 ? `${a2.quantity} × ${a2.price} ${a2.currency}` : "",
    p2_visible: !!a2,
    p3_img: a3?.image ?? "",
    p3_name: a3?.name ?? "",
    p3_sku: a3?.sku ?? "",
    p3_qty_price: a3 ? `${a3.quantity} × ${a3.price} ${a3.currency}` : "",
    p3_visible: !!a3,
  };
}
