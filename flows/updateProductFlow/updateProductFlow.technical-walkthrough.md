# updateProductFlow Technical Walkthrough

## Purpose

This document explains how updateProductFlow runs end-to-end and maps runtime behavior to WhatsApp screens.

## Architecture Overview

updateProductFlow spans these boundaries:
- WhatsApp Cloud API template dispatch
- Next.js send route and encrypted Meta callback route
- updateProductFlow handler state machine with list, edit, and summary stages
- Redis-backed update state store keyed by flow token/product context
- Product fetch/update service layer
- Repository layer for product details/photos/category and update persistence
- Image processing and media decryption path for photo replacement

## Main Entry Points

- Send endpoint: [src/app/api/seller/updateProductFlow/send/route.ts](src/app/api/seller/updateProductFlow/send/route.ts)
- Encrypted callback endpoint: [src/app/api/seller/updateProductFlow/meta_endpoint/route.ts](src/app/api/seller/updateProductFlow/meta_endpoint/route.ts)
- Flow handler: [src/handlers/seller/updateProductFlow_handler.ts](src/handlers/seller/updateProductFlow_handler.ts)

## Runtime Call Chain

### Phase 1: Send Route
1. Validates seller/phone input from POST body.
2. Normalizes phone and runs validateSellerFlowDispatch.
3. On auth failure, dispatches sendAuthFlowOnce and returns 401.
4. On success, posts WhatsApp template modify_product_flow_local with flow_token.

### Phase 2: Meta Ping
1. Callback route decrypts payload with decryptFlowPayload.
2. Ping action returns data.status=active.
3. Other responses are encrypted with encryptFlowResponse.

### Phase 3: INIT/NAVIGATE
1. handleUpdateProductFlow validates access via validateSellerFlowAccess.
2. INIT/NAVIGATE returns WELCOME immediately.

### Phase 4: WELCOME -> PRODUCT_LIST
1. cmd=load_products calls handleLoadProducts.
2. Product page is fetched via getSellerProductsPageByFlowToken.
3. Shared list renderer output is remapped from details to load_product_for_edit cmd.

### Phase 5: PRODUCT_LIST -> SCREEN_PHOTOS
1. Selecting a product loads photos via loadProductPhotosForEditScreen.
2. Per-product edit state is reset.
3. Existing gallery is converted to carousel payload and returned in SCREEN_PHOTOS.

### Phase 6: Photos Branch
1. go_edit_photos opens SCREEN_EDIT_PHOTOS.
2. save_photos decrypts WhatsApp media, converts to base64 carousel content, sets photos_modified=true, then opens SCREEN_EDIT_INFO.
3. skip_photos jumps directly to SCREEN_EDIT_INFO.

### Phase 7: SCREEN_EDIT_INFO -> SCREEN_CATEGORY_INFO
1. Existing editable fields are preloaded via loadProductEditInfoForEditScreen.
2. Submitted values are merged with prior state and validated.
3. TND regular price is required and promo constraints are enforced.
4. EUR values are auto-resolved when needed.
5. On success, flow advances to SCREEN_CATEGORY_INFO.

### Phase 8: Category Branch
1. SCREEN_CATEGORY_INFO offers go_edit_category or skip_category.
2. go_edit_category loads categories and opens SCREEN_EDIT_CATEGORY.
3. load_subcategories fetches subcategories and opens SCREEN_EDIT_SUBCATEGORY.
4. Saving subcategory returns to SCREEN_SUMMARY.
5. skip_category goes directly to SCREEN_SUMMARY.

### Phase 9: SCREEN_SUMMARY -> SUCCESS
1. Summary screen renders photos, labels, pricing, dimensions, and attributes.
2. submit_update enforces duplicate-submit guards.
3. updateProductNow persists update payload to plugin backend.
4. On success: submit_status=submitted, invalidateProductsListByTokenCache, sendMenu, then SUCCESS.
5. On failure: returns SCREEN_SUMMARY with error_message.

## Plugin Endpoints Touched

- /seller/product/list-paged/by-flow-token
- /seller/product/photos/by-flow-token
- /seller/product/edit-info/by-flow-token
- /seller/product/category-info/by-flow-token
- /seller/product/update/by-flow-token

## Error and Resilience Behavior

- Missing seller on send route returns 400.
- Auth/session failure on send route returns 401 and dispatches auth fallback.
- Decryption failure on callback returns 421.
- Product/photo/detail/category fetch failures fall back to product list or existing state.
- Update submit failure returns to SCREEN_SUMMARY with error_message.
- submit_status guard prevents duplicate submissions.

## Validation State

- Gate A: run pnpm build.
- Gate B: smoke test send/meta routes.
- Gate C: manual device run after template modify_product_flow_local approval.
