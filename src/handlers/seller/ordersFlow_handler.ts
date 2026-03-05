/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import {
  getFlowToken,
  formatOrderStatusCounters,
  paginateArray,
  formatOrderListItem,
  formatEmptyOrderListItem,
  formatOrderDetail,
  formatOrderArticlesPage,
} from "@/utils/utilities";
import { getOrdersForToken } from "@/repositories/order_cache";
import {
  filterOrdersForStatus,
  getOrderById,
  getOrderArticles,
  primeOrdersAsync,
} from "@/services/order_service";

const ORDER_LIST_PAGE_SIZE = 5;
const ORDER_ARTICLES_PAGE_SIZE = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNavItems(
  hasPrev: boolean,
  hasNext: boolean,
  currentPage: number,
  totalPages: number,
  statusFilter: string,
): any[] {
  const items: any[] = [];

  if (hasPrev) {
    items.push({
      id: "nav_prev",
      "main-content": {
        title: "⬅️ Page Précédente",
        metadata: `Page ${currentPage - 1} / ${totalPages}`,
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

  if (hasNext) {
    items.push({
      id: "nav_next",
      "main-content": {
        title: "Page Suivante ➡️",
        metadata: `Page ${currentPage} / ${totalPages}`,
      },
      "on-click-action": {
        name: "data_exchange",
        payload: {
          page: currentPage + 1,
          status_filter: statusFilter,
          cmd: "paginate",
        },
      },
      end: { title: "", metadata: "" },
    });
  }

  return items;
}

function buildOrderListResponse(
  filtered: any[],
  page: number,
  statusFilter: string,
): FlowResponse {
  const listItems = filtered.map(formatOrderListItem);
  const { pageItems, totalPages, hasNext, hasPrev, currentPage } =
    paginateArray(listItems, page, ORDER_LIST_PAGE_SIZE);

  const navItems = buildNavItems(
    hasPrev,
    hasNext,
    currentPage,
    totalPages,
    statusFilter,
  );

  return {
    screen: "ORDER_LIST",
    data: {
      current_page: currentPage,
      status_filter: statusFilter,
      orders: [...pageItems, ...navItems],
    },
  };
}

// ---------------------------------------------------------------------------
// Screen handlers
// ---------------------------------------------------------------------------

async function handleOrderStatus(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const orders = await getOrdersForToken(token);

  // User submitted the status filter form — transition to ORDER_LIST
  if (data.status_filter) {
    const statusFilter = String(data.status_filter);
    const filtered = filterOrdersForStatus(orders, statusFilter);
    if (filtered.length === 0) {
      const statuses = formatOrderStatusCounters(orders);
      return {
        screen: "ORDER_STATUS",
        data: { error_msg: "Aucune commande avec le statut sélectionné.", statuses },
      };
    }
    return buildOrderListResponse(filtered, 1, statusFilter);
  }

  // Initial render — show status counters
  const statuses = formatOrderStatusCounters(orders);
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

  const allOrders = await getOrdersForToken(token);
  const filtered = filterOrdersForStatus(allOrders, statusFilter);

  // Explicit noop — empty state item tapped
  if (mode === "noop") {
    return buildOrderListResponse(filtered, page, statusFilter);
  }

  // Paginate — re-render at new page
  if (mode === "paginate") {
    return buildOrderListResponse(filtered, page, statusFilter);
  }

  // Order tapped — navigate to detail
  if (mode === "order_details") {
    const orderId = String(rawData.order_id ?? "").trim();

    console.log("order_details — orderId:", orderId);

    // Guard against empty, missing, or pagination pseudo-IDs
    if (!orderId || orderId.startsWith("nav_")) {
      return buildOrderListResponse(filtered, page, statusFilter);
    }

    const order =
      filtered.find((o: any) => String(o.id) === orderId) ||
      (await getOrderById(orderId));

    if (!order) {
      console.log("order not found for id:", orderId);
      return buildOrderListResponse(filtered, page, statusFilter);
    }

    const detail = formatOrderDetail(order);
    return {
      screen: "ORDER_DETAIL",
      data: detail,
    };
  }

  // Empty action — re-render current page
  if (mode === "") {
    return buildOrderListResponse(filtered, page, statusFilter);
  }

  // Fallback — unknown action, re-render list
  return buildOrderListResponse(filtered, page, statusFilter);
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
  const requestedPage = Number(data.page ?? 1);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  if (!orderId) {
    return { screen: "ORDER_DETAIL", data };
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return { screen: "ORDER_DETAIL", data };
  }

  const articles = await getOrderArticles(orderId);
  const articlesPage = formatOrderArticlesPage(
    order.id,
    order.reference,
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
  if (!orderId) {
    return { screen: "ORDER_ARTICLES", data };
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return { screen: "ORDER_ARTICLES", data };
  }

  const articles = await getOrderArticles(orderId);
  const requestedPage = Number(data.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  console.log("handleOrderArticles — page:", page);

  const articlesPage = formatOrderArticlesPage(
    order.id,
    order.reference,
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
      primeOrdersAsync(token);
    }
    return { screen: "WELCOME_SCREEN", data: {} };
  }

  if (action === "DATA_EXCHANGE") {
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