# productsFlow Technical Walkthrough

## Purpose
This document explains productsFlow architecture, runtime behavior, and key technical terms.
It is written as the products equivalent of authFlow documentation, with focus on list/detail/variation behavior and auth/session guards.

## Architecture Overview

Boundaries involved in productsFlow:
- Meta Graph API (template send + encrypted flow callbacks)
- Next.js send route and encrypted callback route
- productsFlow handler state machine
- products service + repository data layer
- plugin endpoints for product retrieval
- auth/session guard services reused from auth layer
- optional Redis caching for product pages and detail screens

Primary entry points:
- src/app/api/seller/productsFlow/send/route.ts
- src/app/api/seller/productsFlow/meta_endpoint/route.ts
- src/handlers/seller/productsFlow_handler.ts

## Glossary (Technical Terms)

- productsFlow: WhatsApp interactive flow for seller product browsing and detail navigation.
- Flow token: token linking interaction to seller identity/session context.
- DATA_EXCHANGE: Meta action carrying screen events and payload data.
- INIT/NAVIGATE: entry actions used to bootstrap flow and return initial screen.
- Token-first auth guard: validation path that resolves seller/session from flow token first.
- Dispatch guard: send-time auth check by seller phone prior to launching template.
- Screen cache: cached FlowResponse payload keyed by token and screen context for faster repeat renders.
- Variable product: product with multiple variations (size/color/etc).
- Variation detail: screen showing one selected variation data.
- Renderer helper: utility that maps domain data into flow-friendly response fields.
- Fallback path: recovery path used when primary lookup/update fails.

## Development Phases

### Phase 1: Send + Callback Wiring
productsFlow routes were implemented following authFlow pattern:
- send route dispatches products flow template via Meta
- callback route decrypts incoming payload, executes handler, encrypts response

### Phase 2: Auth Guard Integration
productsFlow added strict session checks:
- send route uses validateSellerFlowDispatch(phone)
- handler uses validateSellerFlowAccess(flow_token)
If auth/session is invalid, sendAuthFlowOnce is triggered to redirect seller back to auth.

### Phase 3: Product List and Detail Behavior
handleProductList was added with support for:
- initial list rendering
- pagination command
- details command
- split path for SIMPLE vs VARIABLE products

### Phase 4: Variation Detail Path
handleVariationDetail was implemented to:
- resolve requested variation
- support return behavior for transition edge cases
- render variation-specific stock, attributes, and prices

### Phase 5: Caching and Prime Strategy
products service + cache layer were integrated to:
- prime products list on INIT/NAVIGATE (non-blocking)
- cache product pages, simple details, variable details, and variation details
- reduce repeated plugin latency during screen navigation

## Meta Decryption and Encryption Path

Callback route: src/app/api/seller/productsFlow/meta_endpoint/route.ts

Incoming body contains encrypted_flow_data, encrypted_aes_key, initial_vector.
Decryption process:
1. RSA OAEP decrypt encrypted_aes_key with server private key.
2. Validate AES key/IV lengths.
3. AES-GCM decrypt encrypted_flow_data.
4. Parse JSON into FlowRequest.

Routing process:
- action=ping returns active status.
- other actions route to handleProductsFlow(parsed).

Response process:
1. Build FlowResponse (screen + data).
2. AES-GCM encrypt response with derived key/IV transform.
3. Return encoded payload text to Meta.

Failure behavior:
- decryption failure returns 421 so Meta can refresh key material.
- unexpected processing failure maps to 400/500 depending on message class.

## Runtime Phases (End-to-End)

### Phase A: Send Route Launch
File: src/app/api/seller/productsFlow/send/route.ts
1. Validate request JSON and seller/phone fields.
2. Run validateSellerFlowDispatch(phone).
3. If auth fails: trigger sendAuthFlowOnce and return 401.
4. If auth passes: send template productsflow_message with flow button and auth token.

### Phase B: Callback Ping
File: src/app/api/seller/productsFlow/meta_endpoint/route.ts
1. Decrypt payload.
2. If action is ping, return active status.

### Phase C: INIT/NAVIGATE Entry
File: src/handlers/seller/productsFlow_handler.ts
1. Validate auth with validateSellerFlowAccess(token).
2. Prime product cache asynchronously via primeProductsAsync(token).
3. Return WELCOME_SCREEN.

### Phase D: Product List Screen
File: src/handlers/seller/productsFlow_handler.ts -> handleProductList
Behavior by command:
- cmd=noop: re-render current page
- cmd=paginate: render requested page
- cmd=details: resolve selected product and route to detail
- default: render first/selected page

Outputs:
- PRODUCT_LIST
- PRODUCT_DETAIL_SIMPLE
- PRODUCT_DETAIL_VARIABLE

### Phase E: Variable Detail Screen
File: src/handlers/seller/productsFlow_handler.ts -> handleVariationDetail
1. Resolve product_id and variation_id.
2. Fetch variation detail from service/repository/cache.
3. Return VARIATION_DETAIL with stock/attributes/prices.
4. On missing data, return PRODUCT_DETAIL_VARIABLE with error_msg.

### Phase F: Completion
File: src/handlers/seller/productsFlow_handler.ts
- PRODUCT_DETAIL_SIMPLE DATA_EXCHANGE -> SUCCESS
- VARIATION_DETAIL DATA_EXCHANGE -> SUCCESS

## Plugin Endpoints Hit

Products domain:
- /seller/products/by-flow-token
  - Fetch paged seller products list.
- /seller/product/by-id
  - Fetch product detail by id.
- /seller/product/variation/by-id
  - Fetch variation detail by product and variation ids.

Auth/session guard domain (reused by productsFlow guards):
- /seller/by-flow-token
  - Token-based seller/session resolution.
- /seller/state/by-phone
  - Send-route auth dispatch verification path by phone.
- /seller/state/insert
  - Session/state recovery path when needed.

Auth redirect side-effect:
- sendAuthFlowOnce ultimately triggers auth flow send route when seller is not authenticated.

## Error and Resilience Behavior

- Malformed JSON on send route -> 400.
- Auth/session invalid on send route -> 401 + auth redirect side-effect.
- Decryption failure on callback route -> 421.
- Missing product/variation in handler -> fallback screen with error_msg.
- Cache misses gracefully fallback to repository/plugin fetch.

## Source Files Map

- Handler: src/handlers/seller/productsFlow_handler.ts
- Send route: src/app/api/seller/productsFlow/send/route.ts
- Meta route: src/app/api/seller/productsFlow/meta_endpoint/route.ts
- Service: src/services/products_service.ts
- Repository: src/repositories/products/product_repo.ts
- Cache service: src/services/cache/products_cache_service.ts
- Renderer: src/utils/product_flow_renderer.ts
