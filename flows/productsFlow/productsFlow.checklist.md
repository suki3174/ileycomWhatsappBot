# productsFlow Validation Checklist

## Contract Alignment (JSON vs Runtime)

- [x] Screen IDs match runtime outputs:
  - WELCOME_SCREEN
  - PRODUCT_LIST
  - PRODUCT_DETAIL_SIMPLE
  - PRODUCT_DETAIL_VARIABLE
  - VARIATION_DETAIL
  - SUCCESS
- [x] routing_model matches handler behavior in handleProductsFlow.
- [x] PRODUCT_LIST interaction payload keys align with handler expectations:
  - cmd
  - page
  - product_id
- [x] PRODUCT_DETAIL_VARIABLE -> VARIATION_DETAIL payload keys align:
  - product_id
  - variation_id
- [x] Error key consistency: error_msg.
- [x] Auth/session failure behavior documented and validated.

## Gate A: Build

- [x] pnpm build passes.

## Gate B: Endpoint Smoke

- [x] GET /api/seller/productsFlow/meta_endpoint returns 200 and active message.
- [x] POST /api/seller/productsFlow/meta_endpoint malformed payload returns handled error (421 or mapped failure path).
- [x] POST /api/seller/productsFlow/send with missing body returns validation error.
- [x] POST /api/seller/productsFlow/send unauthenticated path returns 401 and triggers auth guard.

## Gate C: Manual Flow Run

- [x] WELCOME_SCREEN opens correctly from WhatsApp template.
- [x] PRODUCT_LIST renders first page.
- [x] Pagination action keeps screen stable and updates page data.
- [x] Simple product detail path reaches PRODUCT_DETAIL_SIMPLE.
- [x] Variable product detail path reaches PRODUCT_DETAIL_VARIABLE.
- [x] Variation selection reaches VARIATION_DETAIL.
- [x] Completion transitions from detail screens reach SUCCESS.
- [x] Auth/session-expired scenario redirects with proper message.

## Final Verdict

- [x] PASS (flow validation passed)
