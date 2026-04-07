# Services Documentation

Business logic layer handling external integrations, caching, and core workflows.

---

## ai_optimization_service.ts

Orchestrates AI product optimization workflow.

### triggerProductOptimization(productId, sellerPhone?)
**Purpose:** Initiate product optimization
- **Input:** Product ID and optional seller phone number
- **Returns:** OptimizationState with PROCESSING status
- **Behavior:** Non-blocking fire-and-forget; returns 202 Accepted immediately
- **Side effects:** 
  - Initial state stored in cache with PENDING status
  - Background submitToAIService() called asynchronously
  - Catch errors and update state to FAILED if submission fails

### getOptimizationStatus(productId)
**Purpose:** Check optimization status
- **Input:** Product ID
- **Returns:** OptimizationState or null
- **Behavior:** Fast in-memory cache lookup, respects TTL

### getOptimizationResult(productId)
**Purpose:** Retrieve optimization results
- **Input:** Product ID
- **Returns:** AIOptimizationResponse or null if not completed
- **Behavior:** Only returns result if status is COMPLETED

### retryProductOptimization(productId, sellerPhone?)
**Purpose:** Retry failed optimization
- **Input:** Product ID and optional seller phone
- **Returns:** OptimizationState
- **Throws:** Error if max retries (3) exceeded
- **Behavior:** Increments retry count, resets status to PENDING, calls triggerProductOptimization

### submitToAIService (Private)
**Purpose:** Contact external AI service
- **HTTP:** POST to AI_SERVICE_URL (30s timeout configurable)
- **Request:** `{ productId }`
- **Response:** AIOptimizationResponse
- **Post-success:** Updates cache to COMPLETED with result, calls triggerOptimizedProductFlowSend
- **Error handling:** Timeout → AbortError → logged; other errors update state to FAILED

### triggerOptimizedProductFlowSend (Private)
**Purpose:** Auto-send optimization flow to seller
- **Input:** Seller phone number
- **Workflow:** 
  1. Fetch seller profile to get real name (fallback: "Seller")
  2. POST to `/api/seller/optimizedProductFlow/send` with seller info
  3. Log success with seller phone and name
- **Error handling:** Non-blocking; failures don't cascade

---

## auth_service.ts

Manages seller authentication, sessions, and validation.

### getSellerByPhone(phone)
**Purpose:** Look up seller by phone number
- **Input:** Phone number string
- **Returns:** Seller or undefined
- **Source:** Plugin-backed repository

### getAllSellers()
**Purpose:** Get all registered sellers
- **Returns:** Seller array
- **Source:** In-memory fallback list

### findSellerByTokenOrPhone(token)
**Purpose:** Resolve seller from flow token or phone
- **Input:** Flow token or phone string
- **Returns:** Seller or undefined
- **Strategy:** Token lookup first (fast, authoritative); phone fallback if needed

### findSeller(token)
**Purpose:** Find seller by any token
- **Input:** Flow token
- **Returns:** Seller or undefined
- **Alias:** Calls findSellerByTokenOrPhone

### sellerHasCode(token)
**Purpose:** Check if seller has authentication code set
- **Input:** Flow token
- **Returns:** Boolean
- **Logic:** Finds seller, checks if code field is non-empty

### primeAuthWarmupAsync(token)
**Purpose:** Pre-load seller auth state (background)
- **Input:** Flow token
- **Side effect:** Asynchronously caches hasCode status for faster access
- **Use case:** Performance optimization during flow init

---

## add_product_service.ts

Handles product creation workflow and category management.

### persistDraftProduct(flowToken, state, quantity)
**Purpose:** Save new product to database
- **Input:** Flow token, product state, stock quantity
- **Returns:** CreateProductResult with productId or error
- **Workflow:**
  1. Extract seller abbreviation from seller name
  2. Call saveProductDraft with seller identifier
  3. Product created in WordPress backend
- **Error handling:** Returns error details in result

### confirmProduct(productId)
**Purpose:** Mark draft product as confirmed
- **Input:** Product ID
- **Side effect:** Updates backend product status

### getProductCategoriesCached()
**Purpose:** Fetch all product categories
- **Returns:** ProductCategory array
- **Source:** Cached via plugin call, updates daily

### getSubcategoriesByCategoryCached(categoryId)
**Purpose:** Get subcategories for a category
- **Input:** Category ID
- **Returns:** SubCategory array
- **Source:** Cached via plugin call

### convertTndPricesToEur(regularTnd, promoTnd)
**Purpose:** Convert TND prices to EUR
- **Input:** Regular and promo prices in TND
- **Returns:** Object with regularEur and promoEur prices
- **Source:** Plugin-backed exchange rate endpoint

---

## auth_service.ts (Additional Functions)

### sellerHasCodeByFlowToken(token)
**Purpose:** Check code status by flow token
- **Input:** Flow token
- **Returns:** Boolean

### setSellerCode(token, code)
**Purpose:** Save authentication code for seller
- **Input:** Flow token, code value
- **Returns:** Updated Seller or undefined
- **Side effects:** Updates backend, updates cache

### prepareSellerState(token)
**Purpose:** Initialize seller session
- **Input:** Flow token
- **Returns:** Boolean (success)
- **Side effects:** Creates session, sets expiration

### sellerSignIn(email, code)
**Purpose:** Authenticate seller credentials
- **Input:** Email, authentication code
- **Returns:** Seller or undefined
- **Validation:** Checks email and code against database

---

## menu_service.ts

Handles main menu distribution to sellers.

### sendMenu(phoneOrToken)
**Purpose:** Send WhatsApp menu template to seller
- **Input:** Phone number or flow token
- **Returns:** Promise<void>
- **Retry logic:** 
  - Max 5 attempts
  - Exponential backoff (1s → 2s → 4s → 8s → 16s)
  - Stops on success or 404 (endpoint not found)
- **Phone extraction:** From token if needed
- **POST to:** `/api/seller/menu_template/send`

---

## order_service.ts

Manages order tracking and retrieval.

### getOrdersBySellerToken(token)
**Purpose:** Fetch seller's orders
- **Input:** Flow token
- **Returns:** Order array
- **Behavior:** Extracts phone from token, queries backend

### getOrderById(orderId)
**Purpose:** Fetch specific order details
- **Input:** Order ID
- **Returns:** Order or undefined
- **Source:** Cached order repository

### updateOrderStatus(orderId, newStatus)
**Purpose:** Update order fulfillment state
- **Input:** Order ID, new OrderStatus
- **Returns:** Updated Order or null
- **Side effects:** Persists to plugin backend

---

## products_service.ts

Handles product listing and search.

### getProductsBySellerToken(token)
**Purpose:** Fetch seller's products
- **Input:** Flow token
- **Returns:** Product array
- **Behavior:** Extracts phone from token, queries backend
- **Caching:** Via product cache (TTL: 5 minutes)

### getProductById(productId)
**Purpose:** Fetch product details
- **Input:** Product ID
- **Returns:** Product or undefined
- **Source:** Cached repository

### searchProducts(query, filters?)
**Purpose:** Search products by name/SKU/tags
- **Input:** Search term, optional filters
- **Returns:** Matching Product array
- **Performance:** Uses indexed backend query

---

## reset_code_service.ts

Handles password reset workflow.

### initiateReset(email)
**Purpose:** Send reset code to seller email
- **Input:** Seller email address
- **Returns:** Boolean (success)
- **Side effects:** Generates token, sends email via mailer

### verifyResetCode(token, code)
**Purpose:** Validate reset code
- **Input:** Reset token, user-entered code
- **Returns:** Boolean

### confirmNewPassword(token, newPassword)
**Purpose:** Save new password after validation
- **Input:** Reset token, new password (hashed)
- **Returns:** Updated Seller or null
- **Side effects:** Updates backend, clears reset token

---

## update_product_service.ts

Handles product modification workflows.

### updateProductFields(productId, updates)
**Purpose:** Update existing product data
- **Input:** Product ID, field changes object
- **Returns:** UpdateProductResult
- **Fields updatable:** Name, description, pricing, categories, tags, images
- **Post-update:** Cache invalidated

### getUpdateProductState(flowToken)
**Purpose:** Get seller's product update session
- **Input:** Flow token
- **Returns:** UpdateProductState or null
- **Source:** Update product cache

### saveUpdateProductState(flowToken, state)
**Purpose:** Persist product update session
- **Input:** Flow token, state object
- **Side effects:** Stores in cache for later retrieval
- **TTL:** 24 hours
- **Note:** Unused legacy helpers were removed from the update service surface to keep the flow lean and focused

---

## Common Patterns

### Cache Usage
- All services use cache for frequently accessed data
- TTL prevents stale data
- Cache priming optimizes INIT performance

### Error Handling
- Non-blocking operations continue on sub-operation failure
- Errors logged with context tags: `[ServiceName]`
- Graceful degradation (fallback values used when possible)

### Phone Extraction
- Flow tokens contain embedded phone numbers: `flowtoken-{phone}-{timestamp}`
- All services can work with either phone or token
- Normalization removes non-digits

### Async Patterns
- Fire-and-forget for non-critical operations (menu send, AI trigger)
- Retry logic with exponential backoff for critical operations
- 30-second timeouts on external calls


