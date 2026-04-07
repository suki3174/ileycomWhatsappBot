# Repositories Documentation

Data access layer handling caching and database interactions.

---

## Pattern Overview

Repositories follow a consistent pattern:
- **Cache layer:** Fast in-memory lookup with TTL
- **Database layer:** Plugin/API calls for persistence
- **Fallback:** In-memory defaults if backend unavailable

---

## addProduct/

Manages product creation state and database records.

### add_product_cache.ts
In-memory cache for product creation workflow state.

**getAddProductState(token)**
- Retrieves AddProductState from cache for a seller
- Returns null if expired or not found
- Expires after 24 hours of inactivity and also 24 hours of initial creation

**updateAddProductState(token, updates)**
- Partial update (merges with existing)
- Stores updated state with new expiration
- Returns updated state

**clearAddProductState(token)**
- Removes state from cache
- Called after product submission

### add_product_repo.ts
Persists products to database.

**saveProductDraft(token, state, quantity, sellerAbbr)**
- Creates new product in WordPress
- Generates SKU from seller abbreviation + timestamp
- Uploads images from base64 to CDN
- Returns CreateProductResult { ok, productId, errorCode, errorMessage }

**markProductConfirmed(productId)**
- Marks draft product as published on WordPress
- Makes product visible to customers

### product_category_repo.ts
Category and subcategory management.

**fetchAllProductCategories()**
- Returns all product categories from plugin
- Cached with 24-hour TTL
- Fallback to DEFAULT_CATEGORIES if plugin unavailable

**fetchSubCategoriesByCategory(categoryId)**
- Returns subcategories for given category
- Cached per category
- Fallback to DEFAULT_SUBCATEGORIES

### pricing_repo.ts
Currency conversion.

**convertTndPricesViaPlugin(regularTnd, promoTnd)**
- Converts TND prices to EUR using current exchange rate
- Calls backend plugin endpoint
- Returns { regularEur, promoEur }

---

## auth/

Manages seller authentication state and data.

### auth_cache.ts
In-memory session cache.

**updateAuthWarmupCache(token, data)**
- Pre-loads seller auth state (hasCode status) for faster access
- Caches hasCode boolean for ~5 minutes

**consumePendingCode(token)**
- Marks authentication code as used
- Prevents replay attacks

**isSessionActive(token)**
- Checks if seller's session hasn't expired
- Session lasts 24 hours from login

### seller_repo.ts
Seller account data and plugin integration.

**findSellerByFlowToken(token)**
- Looks up seller by flow token
- First checks global in-memory list
- Falls back to plugin /seller/by-token API

**findSellerByPhone(phone)**
- Looks up seller by phone number
- Slow (~7-8s) plugin call, prefer token lookup
- Falls back to in-memory list

**findAllSellers()**
- Returns all sellers from in-memory list
- Used for fallback when plugin unavailable

**upsertSellerState(phone, updates)**
- Updates seller session/state on backend
- Creates session record if needed

**updateSellerCode(phone, newCode)**
- Updates seller password code hash
- Used after password reset

**activateSellerSessionViaPlugin(email)**
- Creates authenticated session for seller
- Generates and returns flow_token

---

## orders/

Manages order data access.

### order_cache.ts
In-memory order cache.

**getOrdersBySellerCached(sellerPhone)**
- Returns seller's order history from cache
- 5-minute TTL

**getOrderByIdCached(orderId)**
- Returns single order from cache
- Expires after 24 hours

**updateOrderStatusCached(orderId, newStatus)**
- Updates cached order status
- Invalidates related caches

### order_repo.ts
Order persistence.

**fetchSellerOrders(sellerPhone)**
- Calls plugin endpoint to get seller's orders
- Returns Order array with sorting
- Caches result

**fetchOrderById(orderId)**
- Calls plugin endpoint for single order
- Returns full Order details (items, addresses, tracking)

**updateOrderStatus(orderId, newStatus)**
- Updates order fulfillment state on backend
- Returns updated Order or null

---

## products/

Manages product data access.

### poducts_cache.ts
In-memory product cache (note: typo in filename).

**getProductsBySellerCached(sellerPhone)**
- Caches seller's product list
- 5-minute TTL

**getProductByIdCached(productId)**
- Caches individual product data
- 1-hour TTL

**searchProductsCached(query, filters)**
- Caches search results
- 10-minute TTL

### product_repo.ts
Product persistence.

**fetchSellerProducts(sellerPhone)**
- Calls plugin endpoint for seller's products
- Returns Product array
- Filters out drafts by default

**fetchProductById(productId)**
- Calls plugin endpoint for product details
- Returns full Product information

**updateProductFields(productId, updates)**
- Calls plugin endpoint to modify product
- Returns updated Product

### update_product_cache.ts
State for product modification flow.

**getUpdateProductState(token)**
- Retrieves product editing session state
- Returns UpdateProductState or null

**updateUpdateProductState(token, updates)**
- Stores product editing progress
- 24-hour TTL

### update_product_repo.ts
Saves product modifications.

**saveProductUpdates(productId, updates)**
- Calls plugin to save product changes
- Handles image uploads if needed
- Returns UpdateProductResult { ok, updatedProduct, error }

**updateOptimizationState(productId, updates)**
- Partial update (merges with existing)
- Extends expiration
- Returns updated state

---

## optimizedProductFlow/

Manages optimized product flow session state.

### optimized_product_flow_cache.ts
In-memory flow state.

**getOptimizedProductFlowState(token)**
- Retrieves flow session state
- Returns OptimizedProductFlowState or null

**updateOptimizedProductFlowState(token, updates)**
- Stores flow progress
- Tracks product_id, optimization_status, results
- 24-hour TTL

---

## Common Repository Patterns

### Cache TTL Strategy
| Data Type | TTL | Reason |
|-----------|-----|--------|
| Product list | 5 min | Frequent updates expected |
| Individual product | 1 hour | Changes less frequent |
| Categories | 24 hours | Rarely change |
| Order | 24 hours | Historical data |
| Optimization state | 24 hours | Prevents memory leak |
| Flow session | 24 hours | Matches session duration |

### Error Handling
- **Plugin unavailable:** Return in-memory fallbacks
- **Invalid data:** Null return vs empty array context-dependent
- **Logging:** All errors tagged with repository name

### Plugin Integration Pattern
1. Call plugin endpoint with retry logic (3 attempts, exponential backoff)
2. Parse JSON response safely (handle malformed JSON)
3. Cache result with appropriate TTL
4. Fallback to in-memory data if plugin fails

### Cache Invalidation
- Explicit: Call clear function after mutation
- Automatic: TTL expiration
- Cascade: Update product cache when seller updates product

