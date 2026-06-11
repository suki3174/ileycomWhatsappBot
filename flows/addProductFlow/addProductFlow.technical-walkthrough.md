# addProductFlow Technical Walkthrough

## Purpose

This document explains how addProductFlow runs end-to-end in production and maps its runtime call chain to the WhatsApp screens. It follows the same format as the authFlow and productsFlow walkthroughs.

## Architecture Overview

addProductFlow spans these boundaries:
- WhatsApp Cloud API template dispatch
- Next.js send route and encrypted Meta callback route
- addProductFlow handler state machine with 10 sequential screens
- Redis-backed draft state store that accumulates field values across screens
- Category and pricing service layers
- Plugin boundary for product creation, category fetch, and price conversion
- Image processor for photo decryption and carousel building
- AI optimization service triggered fire-and-forget on success

## Main Entry Points

- Send endpoint: [src/app/api/seller/addProductFlow/send/route.ts](src/app/api/seller/addProductFlow/send/route.ts)
- Encrypted callback endpoint: [src/app/api/seller/addProductFlow/meta_endpoint/route.ts](src/app/api/seller/addProductFlow/meta_endpoint/route.ts)
- Flow handler: [src/handlers/seller/addProductFlow_handler.ts](src/handlers/seller/addProductFlow_handler.ts)

## Runtime Call Chain

### Phase 1: Send Route
1. Validates seller/phone input from POST body.
2. Normalizes phone and runs `validateSellerFlowDispatch`.
3. On auth failure, dispatches `sendAuthFlowOnce` and returns 401.
4. On success, posts the WhatsApp template `addproductflow_message_template` in French with the active flow token.

### Phase 2: Meta Ping
1. Callback route decrypts payload with `decryptFlowPayload`.
2. Ping action returns `{ data: { status: "active" } }` without entering the state machine.
3. All other responses are encrypted with `encryptFlowResponse` before being returned.

### Phase 3: INIT → SCREEN_PHOTO
1. `handleAddProductFlow` validates seller access via `validateSellerFlowAccess`.
2. INIT action resets draft state (clears prior product data, categories, submission state).
3. Returns `SCREEN_PHOTO` with empty data.

### Phase 4: SCREEN_PHOTO → SCREEN_NAME
1. `handlePhoto` receives image array from WhatsApp PhotoPicker.
2. Each image is decrypted via `decryptWhatsAppMedia` and compressed via `toCarouselBase64FromBase64`.
3. Images are stored in draft state. Returns `SCREEN_NAME`.

### Phase 5: SCREEN_NAME → SCREEN_CATEGORY
1. `handleSaveName` stores `product_name` in draft state.
2. Categories are loaded from draft state (set during INIT) or from `getProductCategoriesCached`.
3. Falls back to `DEFAULT_CATEGORIES` if service is unavailable.
4. Returns `SCREEN_CATEGORY` with categories array.

### Phase 6: SCREEN_CATEGORY → SCREEN_SUBCATEGORY
1. `handleSaveCategory` receives `product_category` and cmd `load_subcategories`.
2. Resolves the human-readable category label from the loaded categories.
3. Calls `resolveSubcategories` which tries service → draft state cache → `DEFAULT_SUBCATEGORIES`.
4. Returns `SCREEN_SUBCATEGORY` with `parent_category_label` and `subcategories`.

### Phase 7: SCREEN_SUBCATEGORY → SCREEN_PRICE_TND
1. `handleSaveSubcategory` receives `product_subcategory`.
2. Resolves the breadcrumb label from cached subcategories.
3. Stores category and subcategory in draft state.
4. Returns `SCREEN_PRICE_TND` with empty `gain_tnd`.

### Phase 8: SCREEN_PRICE_TND (gain preview + save)
1. EmbeddedLink `calculate_gain_tnd` → `handleCalculateGainTnd` computes gain and returns to same screen.
2. Footer → `handleSavePriceTnd` validates promo price, stores TND prices, converts to EUR via `resolveEurPrices`.
3. Returns `SCREEN_PRICE_EUR` with pre-filled EUR values.

### Phase 9: SCREEN_PRICE_EUR (gain preview + save)
1. EmbeddedLink `calculate_gain_eur` → `handleCalculateGainEur` recomputes EUR gain.
2. Footer → `handleSavePriceEur` validates and stores EUR prices.
3. Returns `SCREEN_DETAILS`.

### Phase 10: SCREEN_DETAILS → SCREEN_QUANTITY
1. `handleSaveDetails` stores dimensions, weight, color, and size fields.
2. Returns `SCREEN_QUANTITY`.

### Phase 11: SCREEN_QUANTITY → SCREEN_SUMMARY
1. `handleSaveQuantity` resolves quantity from chip selection or manual input.
2. Builds image carousels via `buildCarousel` (up to 6 images split across 2 carousels).
3. Returns `SCREEN_SUMMARY` with the full product recap from draft state.

### Phase 12: SCREEN_SUMMARY → SUCCESS
1. `handleSubmitSummary` checks duplicate-submit guards (already submitted, currently submitting).
2. Marks draft state `submit_status: "submitting"`.
3. Calls `persistDraftProduct` which posts to plugin endpoint.
4. On failure, returns to `SCREEN_SUMMARY` with `error_message`.
5. On success: marks submitted, invalidates products list cache via `invalidateProductsListByTokenCache`, sends menu via `sendMenu`.
6. Fires `triggerProductOptimization` as a non-blocking side effect.
7. Returns `SUCCESS`.

## Plugin Endpoints Touched

- `/seller/product/create/by-flow-token` (via `persistDraftProduct`)
- `/seller/products/categories` (via `getProductCategoriesCached`)
- `/seller/products/subcategories/by-category` (via `getSubcategoriesByCategoryCached`)
- Price conversion (via `resolveEurPrices` / `pricing_repo`)

## Error and Resilience Behavior

- Missing seller on send route returns 400.
- Auth/session failure on send route returns 401 and dispatches auth fallback.
- Decryption failure on callback returns 421.
- Category service failure falls back to `DEFAULT_CATEGORIES`.
- Subcategory service failure falls back to `DEFAULT_SUBCATEGORIES` or last-known draft state.
- Product creation failure returns to `SCREEN_SUMMARY` with `error_message`; does not reset draft state.
- Duplicate-submit guard prevents double-creation on double-tap.
- AI optimization failure is silently logged; product creation is unaffected.

## Validation State

- Gate A: run `pnpm build` to validate flow artifacts and TypeScript.
- Gate B: endpoint smoke checks for send/meta routes.
- Gate C: BLOCKED until template `addproductflow_message_template` is approved and active on Meta.
