# ordersFlow Technical Walkthrough

## Purpose
This document explains how ordersFlow runs end-to-end in production and how its runtime call chain maps to the WhatsApp screens.
It is written as the orders equivalent of the authFlow and productsFlow walkthroughs.

## Architecture Overview

ordersFlow spans these boundaries:
- WhatsApp Cloud API template dispatch
- Next.js send route and encrypted Meta callback route
- ordersFlow handler state machine
- order service layer
- order repository and cache boundaries
- renderer helpers that shape response payloads for list/detail/article screens

## Main Entry Points
- Send endpoint: [src/app/api/seller/ordersFlow/send/route.ts](src/app/api/seller/ordersFlow/send/route.ts)
- Encrypted callback endpoint: [src/app/api/seller/ordersFlow/meta_endpoint/route.ts](src/app/api/seller/ordersFlow/meta_endpoint/route.ts)
- Flow handler: [src/handlers/seller/ordersFlow_handler.ts](src/handlers/seller/ordersFlow_handler.ts)

## Runtime Call Chain

### Phase 1: Send Route
1. The send route validates seller/phone input.
2. It dispatches through `validateSellerFlowDispatch` and triggers `sendAuthFlowOnce` if the seller is not authenticated.
3. On success it sends the WhatsApp template `ordersflow` in French with the current flow token.

### Phase 2: Meta Ping
1. The callback route decrypts the incoming encrypted payload with `decryptFlowPayload`.
2. If the action is `ping`, it returns an active status without entering the state machine.
3. The response is encrypted with `encryptFlowResponse` before being returned.

### Phase 3: WELCOME_SCREEN / ORDER_STATUS
1. `handleOrdersFlow` validates seller access using the flow token.
2. INIT/NAVIGATE returns `WELCOME_SCREEN`.
3. WELCOME_SCREEN and ORDER_STATUS branch into `handleOrderStatus`.
4. `handleOrderStatus` resolves counters and status options using `getOrderStatusCounters` and cache helpers.
5. If a status filter is submitted, the handler fetches paged order summaries through `getSellerOrderSummariesPage` and returns `ORDER_LIST`.

### Phase 4: ORDER_LIST
1. `handleOrderList` processes list commands such as `noop`, `paginate`, and `order_details`.
2. It uses `getOrderListScreenCache`, `getSellerOrderSummariesPage`, `getOrderById`, and renderer helpers to build the screen payload.
3. Pagination state and navigation items are created in `buildOrderListResponse`.

### Phase 5: ORDER_DETAIL
1. A selected order is resolved through `getOrderById`.
2. The detail payload is formatted by `formatOrderDetail`.
3. The footer action `load_articles` transitions the flow into article paging.

### Phase 6: ORDER_ARTICLES
1. `handleOrderDetail` with `cmd=load_articles` and `handleOrderArticles` both rely on `getOrderArticlesPage`.
2. The repository fetches article pages from the plugin boundary and the renderer formats them through `formatOrderArticlesServerPage`.
3. The articles screen can return to `SUCCESS` when the close action is submitted.

### Phase 7: SUCCESS
1. The close action triggers `sendMenu` as a side effect.
2. The state machine returns `SUCCESS` to close the flow.

## Plugin Endpoints Touched
- `/seller/orders/list/by-flow-token`
- `/seller/orders/counters/by-flow-token`
- `/seller/order/by-id`
- `/seller/order/articles/by-id`

## Error and Resilience Behavior
- Missing seller input on send route returns 400.
- Auth/session failure on send route returns 401 and dispatches auth fallback.
- Encrypted payload failures return 421 from the callback route.
- Unknown or missing order/article data falls back to the relevant screen rather than crashing.
- Cache misses degrade safely to repository/plugin fetches.

## Validation State
- The runtime code exists and is ready for the same build, smoke, and manual gate process used for authFlow and productsFlow.
- This documentation package is the missing source-of-truth layer for ordersFlow.
