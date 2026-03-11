/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import {
  getFlowToken,

} from "@/utils/utilities";
import {
  getOrderById,
  getOrderArticles,
  getSellerOrderSummariesPage,
  getOrderStatusCounters,
  getOrderStatusCountersCached,
  primeOrderCountersAsync,
} from "@/services/order_service";
import { buildOrderListResponse, formatOrderDetail, formatOrderArticlesPage } from "@/utils/oders_flow_utils";

const ORDER_LIST_PAGE_SIZE = 5;
const ORDER_ARTICLES_PAGE_SIZE = 3;




// ---------------------------------------------------------------------------
// Screen handlers
// ---------------------------------------------------------------------------

async function handleOrderStatus(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const requestedFilter = String(data.status_filter || "all");

  // Prewarm only counters; list is fetched on-demand page-by-page.
  primeOrderCountersAsync(token);

  // User submitted the status filter form — transition to ORDER_LIST
  if (data.status_filter) {
    const statusFilter = String(data.status_filter);
    const pageResult = await getSellerOrderSummariesPage(
      token,
      statusFilter,
      1,
      ORDER_LIST_PAGE_SIZE,
    );

    console.log("ordersFlow ORDER_STATUS filter", {
      tokenSuffix: token.slice(-6),
      statusFilter,
      pageCount: pageResult.orders.length,
      page: pageResult.page,
      hasMore: pageResult.hasMore,
    });

    if (pageResult.orders.length === 0) {
      const counters = await getOrderStatusCounters(token);
      const statuses = [
        { id: "all", title: `🗂️ Total  —  ${counters.total}` },
        { id: "completed", title: `✅ Terminées  —  ${counters.completed}` },
        { id: "in_delivery", title: `🚚 En livraison  —  ${counters.in_delivery}` },
        { id: "to_deliver", title: `📦 À Livrer  —  ${counters.to_deliver}` },
      ];
      return {
        screen: "ORDER_STATUS",
        data: { error_msg: "Aucune commande avec le statut sélectionné.", statuses },
      };
    }
    return buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
  }

  let counters = getOrderStatusCountersCached(token);

  // Avoid returning transient all-zero counters on cold cache. If the cache is
  // empty, perform a direct read once so ORDER_STATUS shows meaningful values.
  if (
    counters.total === 0 &&
    counters.completed === 0 &&
    counters.in_delivery === 0 &&
    counters.to_deliver === 0
  ) {
    counters = await getOrderStatusCounters(token);
  }

  console.log("ordersFlow ORDER_STATUS counters", {
    tokenSuffix: token.slice(-6),
    requestedFilter,
    counters,
  });

  const statuses = [
    { id: "all", title: `🗂️ Total  —  ${counters.total}` },
    { id: "completed", title: `✅ Terminées  —  ${counters.completed}` },
    { id: "in_delivery", title: `🚚 En livraison  —  ${counters.in_delivery}` },
    { id: "to_deliver", title: `📦 À Livrer  —  ${counters.to_deliver}` },
  ];

  return {
    screen: "ORDER_STATUS",
    data: { error_msg: "", statuses },
  };
}

async function handleOrderList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);

  // The on-click-action payload from NavigationList items arrives under parsed.data.
  // parsed.action is always "data_exchange" (the WhatsApp action type).
  // The semantic action ("order_details", "paginate", etc.) is in parsed.data.action.
  const rawData = parsed.data || {};

  console.log("handleOrderList full parsed keys:", Object.keys(parsed as any));
  console.log("handleOrderList rawData:", JSON.stringify(rawData));

  // Read semantic action from payload data, NOT from parsed.action
  const mode = String(rawData.cmd || "").toLowerCase();
  const statusFilter = String(rawData.status_filter || "all");
  const requestedPage = Number(rawData.page ?? 1);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const pageResult = await getSellerOrderSummariesPage(
    token,
    statusFilter,
    page,
    ORDER_LIST_PAGE_SIZE,
  );

  console.log("ordersFlow ORDER_LIST", {
    tokenSuffix: token.slice(-6),
    mode,
    statusFilter,
    page,
    pageCount: pageResult.orders.length,
    hasMore: pageResult.hasMore,
  });

  // Explicit noop — empty state item tapped
  if (mode === "noop") {
    return buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
  }

  if (mode === "paginate") {
    return buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
  }

  // Order tapped — navigate to detail
  if (mode === "order_details") {
    const orderId = String(rawData.order_id ?? "").trim();

    console.log("order_details — orderId:", orderId);

    // Guard against empty, missing, or pagination pseudo-IDs
    if (!orderId || orderId.startsWith("nav_")) {
      return buildOrderListResponse(
        pageResult.orders,
        pageResult.page,
        pageResult.statusFilter,
        pageResult.hasMore,
        pageResult.nextPage,
      );
    }

    const detailOrder = await getOrderById(orderId);
    const order = detailOrder || pageResult.orders.find((o: any) => String(o.id) === orderId);

    if (!order) {
      console.log("order not found for id:", orderId);
      return buildOrderListResponse(
        pageResult.orders,
        pageResult.page,
        pageResult.statusFilter,
        pageResult.hasMore,
        pageResult.nextPage,
      );
    }

    const detail = formatOrderDetail(order);
    return {
      screen: "ORDER_DETAIL",
      data: detail,
    };
  }

  // Empty action — re-render current page
  if (mode === "") {
    return buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
  }

  // Fallback — unknown action, re-render list
  return buildOrderListResponse(
    pageResult.orders,
    pageResult.page,
    pageResult.statusFilter,
    pageResult.hasMore,
    pageResult.nextPage,
  );
}

async function handleOrderDetail(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const mode = String(data.cmd || "").toLowerCase();

  // User tapped "Fermer"
  if (data.confirm_action) {
    return { screen: "SUCCESS", data: { message: "Action terminée avec succès !" } };
  }

  if (mode !== "load_articles") {
    return { screen: "ORDER_DETAIL", data };
  }

  const orderId = String(data.order_id ?? "").trim();
  const orderRef = String(data.order_ref ?? "").trim();
  const requestedPage = Number(data.page ?? 1);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  if (!orderId) {
    return { screen: "ORDER_DETAIL", data };
  }

  const articles = await getOrderArticles(orderId);
  const articlesPage = await formatOrderArticlesPage(
    orderId,
    orderRef || `Commande #${orderId}`,
    articles,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
  );

  return {
    screen: "ORDER_ARTICLES",
    data: articlesPage,
  };
}

async function handleOrderArticles(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const data = parsed.data || {};
  const mode = String(data.cmd || "").toLowerCase();

  // User tapped "Fermer"
  if (data.confirm_action) {
    return { screen: "SUCCESS", data: { message: "Action terminée avec succès !" } };
  }

  if (mode !== "load_articles") {
    return { screen: "ORDER_ARTICLES", data };
  }

  const orderId = String(data.order_id ?? "").trim();
  const orderRef = String(data.order_ref ?? "").trim();
  if (!orderId) {
    return { screen: "ORDER_ARTICLES", data };
  }

  const articles = await getOrderArticles(orderId);
  const requestedPage = Number(data.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  console.log("handleOrderArticles — page:", page);

  const articlesPage = await formatOrderArticlesPage(
    orderId,
    orderRef || `Commande #${orderId}`,
    articles,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
  );

  return {
    screen: "ORDER_ARTICLES",
    data: articlesPage,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleOrdersFlow(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";

  if (action === "INIT" || action === "NAVIGATE") {
    const token = getFlowToken(parsed);
    if (token) {
      primeOrderCountersAsync(token);
    }
    return { screen: "WELCOME_SCREEN", data: {} };
  }

  if (action === "DATA_EXCHANGE") {
    // WhatsApp can occasionally send malformed payloads with empty screen while
    // still carrying ORDER_LIST pagination data. Recover to ORDER_LIST instead
    // of resetting the flow to WELCOME_SCREEN.
    if (!screen) {
      const data = parsed.data || {};
      const hasListIntent =
        Object.prototype.hasOwnProperty.call(data, "status_filter") ||
        Object.prototype.hasOwnProperty.call(data, "page") ||
        String(data.cmd || "").toLowerCase() === "paginate";

      if (hasListIntent) {
        return handleOrderList({
          ...parsed,
          screen: "ORDER_LIST",
        });
      }

      const token = getFlowToken(parsed);
      if (token) {
        // If WhatsApp sends an incomplete packet (empty screen), keep the user
        // inside orders flow instead of resetting to WELCOME_SCREEN.
        return handleOrderStatus({
          ...parsed,
          screen: "ORDER_STATUS",
          data: parsed.data || {},
        });
      }
    }

    switch (screen) {
      case "WELCOME_SCREEN":
      case "ORDER_STATUS":
        return handleOrderStatus(parsed);
      case "ORDER_LIST":
        return handleOrderList(parsed);
      case "ORDER_DETAIL":
        return handleOrderDetail(parsed);
      case "ORDER_ARTICLES":
        return handleOrderArticles(parsed);
      default:
        return { screen: "WELCOME_SCREEN", data: {} };
    }
  }

  return { screen: "WELCOME_SCREEN", data: {} };
}

export default handleOrdersFlow;