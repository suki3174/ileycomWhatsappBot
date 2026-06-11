import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import {
  getFlowToken,

} from "@/utils/core_utils";
import {
  getOrderById,
  getOrderArticlesPage,
  getSellerOrderSummariesPage,
  getOrderStatusCounters,
} from "@/services/order_service";
import {
  getOrderArticlesScreenCache,
  getOrderDetailScreenCache,
  getOrderListScreenCache,
  getOrderStatusScreenCache,
  writeOrderArticlesScreenCache,
  writeOrderDetailScreenCache,
  writeOrderListScreenCache,
  writeOrderStatusScreenCache,
} from "@/services/cache/orders_cache_service";
import { buildOrderListResponse, formatOrderDetail, formatOrderArticlesServerPage } from "@/utils/order_flow_renderer";
import { validateSellerFlowAccess } from "@/services/auth_service";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";
import { sendMenu } from "@/services/menu_service";

const ORDER_LIST_PAGE_SIZE = 5;
const ORDER_ARTICLES_PAGE_SIZE = 3;




// ---------------------------------------------------------------------------
// Screen handlers
// ---------------------------------------------------------------------------

/**
 * Builds ORDER_STATUS and handles transition into ORDER_LIST by selected filter.
 */
async function handleOrderStatus(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const requestedFilter = String(data.status_filter || "all");

  if (!data.status_filter) {
    const cachedStatus = await getOrderStatusScreenCache(token);
    if (cachedStatus) {
      return cachedStatus;
    }
  }

  // User submitted the status filter form — transition to ORDER_LIST
  if (data.status_filter) {
    const statusFilter = String(data.status_filter);

    const cachedList = await getOrderListScreenCache(
      token,
      statusFilter,
      1,
      ORDER_LIST_PAGE_SIZE,
    );
    if (cachedList) {
      return cachedList;
    }

    const pageResult = await getSellerOrderSummariesPage(
      token,
      statusFilter,
      1,
      ORDER_LIST_PAGE_SIZE,
    );

    if (pageResult.orders.length === 0) {
      const counters = await getOrderStatusCounters(token);
      const statuses = [
        { id: "all", title: `🗂️ Toutes  —  ${counters.total}` },
        { id: "completed", title: `✅ Livrée  —  ${counters.completed}` },
        { id: "in_delivery", title: `🚚 En livraison  —  ${counters.in_delivery}` },
        { id: "pending", title: `⏳ En traitement  —  ${counters.pending}` },
        { id: "cancelled", title: `❌ Annulée  —  ${counters.cancelled}` },
        { id: "refunded", title: `↩️ Remboursée  —  ${counters.refunded}` },
        { id: "anomaly", title: `⚠️ Anomalie  —  ${counters.anomaly}` },
      ];
      return {
        screen: "ORDER_STATUS",
        data: { error_msg: "Aucune commande avec le statut sélectionné.", statuses },
      };
    }
    const built = buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
    await writeOrderListScreenCache(
      token,
      pageResult.statusFilter,
      pageResult.page,
      ORDER_LIST_PAGE_SIZE,
      built,
    );
    return built;
  }

  const counters = await getOrderStatusCounters(token);

  const statuses = [
    { id: "all", title: `🗂️ Toutes  —  ${counters.total}` },
    { id: "completed", title: `✅ Livrée  —  ${counters.completed}` },
    { id: "in_delivery", title: `🚚 En livraison  —  ${counters.in_delivery}` },
    { id: "pending", title: `⏳ En traitement  —  ${counters.pending}` },
    { id: "cancelled", title: `❌ Annulée  —  ${counters.cancelled}` },
    { id: "refunded", title: `↩️ Remboursée  —  ${counters.refunded}` },
    { id: "anomaly", title: `⚠️ Anomalie  —  ${counters.anomaly}` },
  ];

  const response: FlowResponse = {
    screen: "ORDER_STATUS",
    data: { error_msg: "", statuses },
  };
  await writeOrderStatusScreenCache(token, response);
  return response;
}

/**
 * Handles ORDER_LIST pagination and order-to-detail navigation.
 */
async function handleOrderList(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);

  // The on-click-action payload from NavigationList items arrives under parsed.data.
  // parsed.action is always "data_exchange" (the WhatsApp action type).
  // The semantic action ("order_details", "paginate", etc.) is in parsed.data.action.
  const rawData = parsed.data || {};

  // Read semantic action from payload data, NOT from parsed.action
  const mode = String(rawData.cmd || "").toLowerCase();
  const statusFilter = String(rawData.status_filter || "all");
  const requestedPage = Number(rawData.page ?? 1);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  if (mode === "noop" || mode === "paginate" || mode === "") {
    const cachedList = await getOrderListScreenCache(
      token,
      statusFilter,
      page,
      ORDER_LIST_PAGE_SIZE,
    );
    if (cachedList) {
      return cachedList;
    }
  }

  // Order tapped — navigate to detail without refetching the list first.
  if (mode === "order_details") {
    const orderId = String(rawData.order_id ?? "").trim();

    // Guard against empty, missing, or pagination pseudo-IDs.
    if (!orderId || orderId.startsWith("nav_")) {
      const pageResult = await getSellerOrderSummariesPage(
        token,
        statusFilter,
        page,
        ORDER_LIST_PAGE_SIZE,
      );
      return buildOrderListResponse(
        pageResult.orders,
        pageResult.page,
        pageResult.statusFilter,
        pageResult.hasMore,
        pageResult.nextPage,
      );
    }

    const cachedDetail = await getOrderDetailScreenCache(token, orderId);
    if (cachedDetail) {
      return cachedDetail;
    }

    const detailOrder = await getOrderById(orderId, token);
    if (detailOrder) {
      const detail = formatOrderDetail(detailOrder);
      const response: FlowResponse = {
        screen: "ORDER_DETAIL",
        data: detail,
      };
      await writeOrderDetailScreenCache(token, orderId, response);
      return response;
    }

    const pageResult = await getSellerOrderSummariesPage(
      token,
      statusFilter,
      page,
      ORDER_LIST_PAGE_SIZE,
    );
    const built = buildOrderListResponse(
      pageResult.orders,
      pageResult.page,
      pageResult.statusFilter,
      pageResult.hasMore,
      pageResult.nextPage,
    );
    await writeOrderListScreenCache(
      token,
      pageResult.statusFilter,
      pageResult.page,
      ORDER_LIST_PAGE_SIZE,
      built,
    );
    return built;
  }

  const pageResult = await getSellerOrderSummariesPage(
    token,
    statusFilter,
    page,
    ORDER_LIST_PAGE_SIZE,
  );

  // Explicit noop — empty state item tapped
  const built = buildOrderListResponse(
    pageResult.orders,
    pageResult.page,
    pageResult.statusFilter,
    pageResult.hasMore,
    pageResult.nextPage,
  );
  await writeOrderListScreenCache(
    token,
    pageResult.statusFilter,
    pageResult.page,
    ORDER_LIST_PAGE_SIZE,
    built,
  );
  return built;
}

/**
 * Handles ORDER_DETAIL actions, including loading the article page.
 */
async function handleOrderDetail(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const mode = String(data.cmd || "").toLowerCase();

  // User tapped "Fermer"
  if (data.confirm_action) {
    void sendMenu(token);
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

  const cachedArticles = await getOrderArticlesScreenCache(
    token,
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
  );
  if (cachedArticles) {
    return cachedArticles;
  }

  const articlesPageResult = await getOrderArticlesPage(
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
    token,
  );
  const articlesPage = await formatOrderArticlesServerPage(
    orderId,
    orderRef || `Commande #${orderId}`,
    articlesPageResult.articles,
    articlesPageResult.page,
    articlesPageResult.limit,
    articlesPageResult.hasMore,
    articlesPageResult.total,
  );

  const response: FlowResponse = {
    screen: "ORDER_ARTICLES",
    data: articlesPage,
  };
  await writeOrderArticlesScreenCache(
    token,
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
    response,
  );
  return response;
}

/**
 * Handles ORDER_ARTICLES pagination and close-to-success behavior.
 */
async function handleOrderArticles(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  const mode = String(data.cmd || "").toLowerCase();

  // User tapped "Fermer"
  if (data.confirm_action) {
    void sendMenu(token);
    return { screen: "SUCCESS", data: { message: "Action terminée avec succès !" } };
  }

  const hasPageIntent =
    Object.prototype.hasOwnProperty.call(data, "page") ||
    Object.prototype.hasOwnProperty.call(data, "current_page") ||
    mode === "load_articles" ||
    mode === "paginate";

  if (!hasPageIntent) {
    return { screen: "ORDER_ARTICLES", data };
  }

  const orderId = String(data.order_id ?? "").trim();
  const orderRef = String(data.order_ref ?? "").trim();
  if (!orderId) {
    return { screen: "ORDER_ARTICLES", data };
  }

  const requestedPage = Number(data.page ?? data.current_page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const cachedArticles = await getOrderArticlesScreenCache(
    token,
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
  );
  if (cachedArticles) {
    return cachedArticles;
  }

  const articlesPageResult = await getOrderArticlesPage(
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
    token,
  );

  const articlesPage = await formatOrderArticlesServerPage(
    orderId,
    orderRef || `Commande #${orderId}`,
    articlesPageResult.articles,
    articlesPageResult.page,
    articlesPageResult.limit,
    articlesPageResult.hasMore,
    articlesPageResult.total,
  );

  const response: FlowResponse = {
    screen: "ORDER_ARTICLES",
    data: articlesPage,
  };
  await writeOrderArticlesScreenCache(
    token,
    orderId,
    page,
    ORDER_ARTICLES_PAGE_SIZE,
    response,
  );
  return response;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Orders flow state-machine entrypoint for all decrypted Meta callback actions.
 */
export async function handleOrdersFlow(
  parsed: FlowRequest,
): Promise<FlowResponse> {
  const action = (parsed.action || "").toUpperCase();
  const screen = parsed.screen || "";
  const token = getFlowToken(parsed);
  const auth = await validateSellerFlowAccess(token);
  if (!auth.ok || !auth.seller) {
    void sendAuthFlowOnce({
      phone: auth.phone || token,
      seller: auth.seller,
      source: auth.reason === "session-expired"
        ? "meta-flow:orders:session-expired"
        : "meta-flow:orders:seller-not-found",
    });
    return {
      screen: "WELCOME_SCREEN",
      data: {
        error_msg: auth.reason === "session-expired"
          ? "Session expiree. Reconnectez-vous."
          : "Authentification requise. Reconnectez-vous.",
      },
    };
  }

  if (action === "INIT" || action === "NAVIGATE") {
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