/* eslint-disable @typescript-eslint/no-explicit-any */
import { Order, OrderArticle } from "@/models/oder_model";
import { paginateArray } from "./utilities";
import { toSizedBase64 } from "./navlist_image_utils";
import { FlowResponse } from "@/models/flowResponse";





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

  // Enforce WhatsApp NavigationList character limits
  const title = String(order.reference ?? "").slice(0, 30);
  const description = String(order.customer_name ?? "").slice(0, 20);
  const safeMetadata = metadata.slice(0, 80);
  const endTitle = String(order.total ?? "").slice(0, 10);
  const endMetadata = String(order.currency ?? "").slice(0, 10);
  const safeTags = (order.tags ?? [])
    .filter((t: string) => typeof t === "string" && t.length > 0)
    .map((t: string) => t.slice(0, 15))
    .slice(0, 3);

  return {
    id: String(order.id),
    "main-content": { title, description, metadata: safeMetadata },
    end: { title: endTitle, metadata: endMetadata },
    tags: safeTags,
    "on-click-action": {
      name: "data_exchange",
      payload: { order_id: String(order.id), cmd: "order_details" },
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
  const articlesCount =
    typeof order.articles_count === "number"
      ? order.articles_count
      : order.articles.length;
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

export async function formatOrderArticlesPage(
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
    p1_img: await toSizedBase64(a1?.image ?? "", 120),
    p1_name: a1?.name ?? "",
    p1_sku: a1?.sku ?? "",
    p1_qty_price: a1 ? `${a1.quantity} × ${a1.price} ${a1.currency}` : "",
    p2_img: a2 ? await toSizedBase64(a2.image ?? "", 120) : "",
    p2_name: a2?.name ?? "",
    p2_sku: a2?.sku ?? "",
    p2_qty_price: a2 ? `${a2.quantity} × ${a2.price} ${a2.currency}` : "",
    p2_visible: !!a2,
    p3_img: a3 ? await toSizedBase64(a3.image ?? "", 120) : "",
    p3_name: a3?.name ?? "",
    p3_sku: a3?.sku ?? "",
    p3_qty_price: a3 ? `${a3.quantity} × ${a3.price} ${a3.currency}` : "",
    p3_visible: !!a3,
  };
}
export function buildPaginationItems(
  currentPage: number,
  hasMore: boolean,
  nextPage: number | undefined,
  statusFilter: string,
): any[] {
  const items: any[] = [];

  if (currentPage > 1) {
    items.push({
      id: `fetch_prev_${currentPage - 1}`,
      "main-content": {
        title: "Page precedente",
        metadata: "Charger les 5 precedentes",
      },
      "on-click-action": {
        name: "data_exchange",
        payload: {
          page: currentPage - 1,
          status_filter: statusFilter,
          cmd: "paginate",
        },
      },
      end: { title: "", metadata: "" },
    });
  }

  if (hasMore) {
    const targetNext = nextPage && nextPage > 0 ? nextPage : currentPage + 1;
    items.push({
      id: `fetch_more_${targetNext}`,
      "main-content": {
        title: "Voir plus",
        metadata: "Charger les 5 suivantes",
      },
      "on-click-action": {
        name: "data_exchange",
        payload: {
          page: targetNext,
          status_filter: statusFilter,
          cmd: "paginate",
        },
      },
      end: { title: "", metadata: "" },
    });
  }

  return items;
}

export function buildOrderListResponse(
  orders: any[],
  page: number,
  statusFilter: string,
  hasMore: boolean,
  nextPage?: number,
): FlowResponse {
  const listItems = orders.map(formatOrderListItem);
  const navItems = buildPaginationItems(page, hasMore, nextPage, statusFilter);

  return {
    screen: "ORDER_LIST",
    data: {
      current_page: page,
      status_filter: statusFilter,
      orders: [...listItems, ...navItems],
    },
  };
}
