# ordersFlow Validation Checklist

## Contract Alignment (JSON vs Runtime)

- [ ] Screen IDs match runtime outputs:
  - WELCOME_SCREEN
  - ORDER_STATUS
  - ORDER_LIST
  - ORDER_DETAIL
  - ORDER_ARTICLES
  - SUCCESS
- [ ] routing_model matches handler behavior in handleOrdersFlow.
- [ ] ORDER_STATUS payload keys align:
  - error_msg
  - statuses
  - status_filter
- [ ] ORDER_LIST payload keys align:
  - cmd
  - page
  - status_filter
  - order_id
- [ ] ORDER_DETAIL payload keys align:
  - cmd
  - order_id
  - order_ref
  - page
  - confirm_action
- [ ] ORDER_ARTICLES payload keys align:
  - cmd
  - order_id
  - order_ref
  - page
  - current_page
  - confirm_action
- [ ] Error key consistency: error_msg.
- [ ] Auth/session failure behavior documented and validated.

## Gate A: Build

- [x] pnpm build passes.

## Gate B: Endpoint Smoke

- [ ] GET /api/seller/ordersFlow/meta_endpoint returns 200 and active message.
- [ ] POST /api/seller/ordersFlow/meta_endpoint malformed payload returns handled error (421 or mapped failure path).
- [ ] POST /api/seller/ordersFlow/send with missing body returns validation error.
- [ ] POST /api/seller/ordersFlow/send unauthenticated path returns 401 and triggers auth guard.

## Gate C: Manual Flow Run

- [ ] WELCOME_SCREEN opens correctly from WhatsApp template.
- [ ] ORDER_STATUS loads counters and allows status selection.
- [ ] ORDER_LIST renders first page and supports pagination actions.
- [ ] ORDER_DETAIL opens from selected order.
- [ ] ORDER_DETAIL load_articles action reaches ORDER_ARTICLES.
- [ ] ORDER_ARTICLES close action reaches SUCCESS.
- [ ] Auth/session-expired scenario redirects with proper message.

## Final Verdict

- [ ] PASS
