# productsFlow Metadata

This file stores productsFlow metadata that cannot live directly in Meta Flow JSON.

## Source of Truth

- Handler: src/handlers/seller/productsFlow_handler.ts
- Meta route: src/app/api/seller/productsFlow/meta_endpoint/route.ts
- Send route: src/app/api/seller/productsFlow/send/route.ts
- Service: src/services/products_service.ts
- Repository: src/repositories/products/product_repo.ts

## Runtime Routing Notes

- INIT/NAVIGATE returns WELCOME_SCREEN and primes product cache asynchronously.
- DATA_EXCHANGE with empty screen falls back to product list rendering.
- WELCOME_SCREEN and PRODUCT_LIST both route through handleProductList.
- PRODUCT_DETAIL_VARIABLE routes through handleVariationDetail.
- PRODUCT_DETAIL_SIMPLE and VARIATION_DETAIL currently complete to SUCCESS on DATA_EXCHANGE.

## Authentication Guard Notes

- productsFlow is protected by validateSellerFlowAccess in the handler.
- send route is protected by validateSellerFlowDispatch before template send.
- On auth/session failure, sendAuthFlowOnce is triggered to redirect seller back to auth flow.

## Plugin Endpoints Touched

Products domain:
- /seller/products/by-flow-token
- /seller/product/by-id
- /seller/product/variation/by-id

Auth/session domain used by guards:
- /seller/by-flow-token
- /seller/state/by-phone
- /seller/state/insert (session recovery path)
- /seller/session/activate (post-auth paths outside product listing)

## Known Implementation Caveats

- Current repository cache filename is src/repositories/products/poducts_cache.ts (existing typo preserved in codebase).
- PRODUCTS list screen rendering is data-driven by renderer helpers in src/utils/product_flow_renderer.ts.
