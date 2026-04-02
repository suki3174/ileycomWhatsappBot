# Utilities Documentation

Helper functions for common operations across the application.

---

## core_utils.ts

Core utility functions used throughout the app.

### Validation Functions

**isValidEmail(email)**
- Validates email format with regex
- Returns boolean

### Token & Flow Utilities

**normToken(t)**
- Trims and normalizes token string
- Returns empty string if falsy input

**generateResetToken()**
- Generates random 64-character hex string
- Used for password reset workflows

**getFlowToken(parsed)**
- Extracts flow_token from FlowRequest
- Checks data.flow_token first, then top-level field
- Returns always a string (empty string if not found)

### Array Utilities

**paginateArray(items, page, pageSize)**
- Splits array into pages
- Returns object:
  - `pageItems: T[]` - Current page items
  - `totalItems: number` - Total count
  - `totalPages: number` - Number of pages
  - `hasNext, hasPrev: boolean` - Navigation flags
  - `currentPage: number` - Current page (1-indexed)
- Handles invalid page numbers gracefully

### Price Utilities

**COMMISSION_RATE = 0.2261**
- Constant: 22.61% commission on sales
- Used for profit calculations

**computeSellingPrice(regularPrice, promoPrice)**
- Returns selling price after commission:
  - If promo price exists: Uses promo price
  - Otherwise: Uses regular price
  - Final: `price * (1 - COMMISSION_RATE)`

**parsePrice(input)**
- Converts string/number to price
- Handles "," or "." decimal separator
- Strips "TND" or currency suffix
- Returns 0 if unparseable

**hasInvalidPromoPrice(regular, promo)**
- Validates promo price logic:
  - Promo can't be 0 if regular exists
  - Promo must be < regular (if both set)
  - Returns boolean

**formatGainTnd(selling)**, **formatGainEur(selling)**
- Formats price for display
- Returns formatted string with currency

**toNumber(val, fallback)**
- Safely converts to number
- Returns fallback if conversion fails

### Currency Utilities

**resolveEurPrices(tndRegular, tndPromo)**
- Converts TND prices to EUR using exchange rate
- Returns { regularEur, promoEur, rate }
- Calls pricing_repo for current rate

---

## data_parser.ts

Data parsing and extraction utilities.

### Text Parsing Functions

**normText(text)**
- Trims, lowercases, removes extra whitespace
- Used for case-insensitive comparisons

**extractPhoneFromFlowToken(token)**
- Parses phone from flow token format: `flowtoken-{phone}-{timestamp}`
- Returns phone string with only digits
- Returns null if format invalid

**parsePluginJsonSafe(jsonString)**
- Safely parses JSON without throwing
- Returns parsed object or empty object if invalid
- Logs parse errors for debugging

**asRecord(obj)**
- Type guard: converts unknown to Record
- Returns empty object if falsy

**readResponseBodySafe(response)**
- Reads response as text safely
- Returns empty string if read fails

---

## flow_crypto.ts

WhatsApp Flow encryption/decryption.

### Encryption Functions

**encryptFlowResponse(response, publicKey)**
- Encrypts FlowResponse for sending to WhatsApp
- Uses RSA + AES (hybrid encryption)
- Returns encrypted payload

**decryptFlowRequest(encrypted, privateKey)**
- Decrypts incoming WhatsApp Flow requests
- Uses RSA + AES (hybrid decryption)
- Returns decrypted FlowRequest

**decryptWhatsAppMedia(mediaObject)**
- Decrypts media files sent through WhatsApp
- Uses cdn_url and encryption_metadata
- Returns decrypted Buffer

---

## image_processor.ts

Image handling and conversion.

### Image Functions

**buildCarousel(images, offset)**
- Groups images into carousel cards (3 per page)
- Input: base64 images array, starting offset
- Returns: { id, image_url, image_title }[] for carousel

**toCarouselBase64FromBase64(base64)**
- Compresses image for carousel display
- Ensures maximum dimensions (500x500)
- Returns base64 string

**compressImage(buffer)**
- Reduces image file size
- Maintains aspect ratio
- Returns compressed Buffer

---

## mailer.ts

Email sending functionality.

### Email Functions

**sendEmail(to, subject, template, variables)**
- Sends templated email to seller
- Supports templates: password-reset, order-confirmation, etc.
- Variables interpolated into template
- Returns Promise<boolean> (success/failure)

**formatEmailTemplate(template, variables)**
- Replaces {{variable}} placeholders in template
- Returns formatted HTML

---

## oders_flow_utils.ts

Order-specific utilities.

### Order Functions

**formatOrderForDisplay(order)**
- Formats order for WhatsApp Flow display
- Truncates long text fields
- Formats dates and prices
- Returns displayable order object

**groupOrdersByStatus(orders)**
- Groups orders by OrderStatus
- Returns { completed: [], in_delivery: [], to_deliver: [] }

**calculateOrderMetrics(orders)**
- Calculates aggregates: total revenue, avg order value, count
- Returns { total, average, count, byStatus }

---

## order_flow_renderer.ts

Renders order flow screen data.

### Rendering Functions

**renderOrderListScreen(orders, page, pageSize)**
- Formats order list for Flow screen display
- Handles pagination
- Returns screen data object

**renderOrderDetailScreen(order)**
- Formats single order for detail view
- Includes article breakdown, pricing, tracking
- Returns screen data object

---

## pin_hash.ts

Password/PIN hashing and verification.

### Hash Functions

**hashPin(pin)**
- Securely hashes PIN using bcrypt
- Returns hashed string

**verifyStoredPin(pin, hash)**
- Verifies PIN against stored hash
- Returns boolean

**generateRandomPin()**
- Generates random 6-digit PIN
- Returns string

---

## plugin_client.ts

Plugin/backend API client.

### Configuration

**PLUGIN_TIMEOUT_MS**
- Default timeout for plugin calls: 15000ms
- Configurable per request

### HTTP Functions

**pluginGet(endpoint, timeout?)**
- HTTP GET to plugin backend
- Returns parsed JSON response

**pluginPost(endpoint, payload, timeout?)**
- HTTP POST to plugin backend
- Sends JSON payload
- Returns parsed response

**pluginPostWithRetry(endpoint, payload, maxRetries?)**
- POST with retry logic
- Exponential backoff (1s → 2s → 4s)
- Returns parsed response on success or null on failure

**createLogger(prefix)**
- Returns logger with prefix tag
- Used for consistent [ServiceName] logging

---

## product_flow_renderer.ts

Product flow screen rendering.

### Rendering Functions

**renderProductListScreen(products, page)**
- Formats product list for display
- Includes pagination info
- Returns screen data

**renderProductDetailScreen(product)**
- Formats single product details
- Includes gallery, pricing, categories, tags
- Returns screen data

---

## products_flow_utils.ts

Product-specific utilities.

### Product Functions

**filterProductsByQuery(products, query)**
- Searches products by name, SKU, tags
- Returns matching Product array

**groupProductsByCategory(products)**
- Groups products by category
- Returns map of category → products

**calculateProductStats(products)**
- Totals: count, avg price, stock
- Returns stats object

---

## repository_utils.ts

Common repository patterns.

### Cache Helpers

**getCacheKey(prefix, id)**
- Generates consistent cache key
- Format: "{prefix}:{id}"

**isExpired(timestamp, ttlMs)**
- Checks if cache entry expired
- Returns boolean

**calculateExpiration(ttlMs)**
- Calculates future expiration timestamp
- Returns Date | null

---

## seller_auth_helpers.ts

Seller authentication utilities.

### Auth Functions

**generateFlowtoken(phone, seller)**
- Creates flow token: `flowtoken-{phone}-{timestamp}`
- Includes seller ID for identification
- Returns string

**hasSellerCodeValue(seller)**
- Checks if seller has password code set
- Returns boolean

**sellerEmailMatches(seller, testEmail)**
- Case-insensitive email comparison
- Returns boolean

**sellerSessionActive(seller)**
- Checks if session_active_until timestamp in future
- Returns boolean

---

## utilities.ts

Miscellaneous helper functions.

### General Utilities

**sleep(ms)**
- Promise-based delay
- Used for retry backoff

**retryWithBackoff(fn, maxAttempts, baseDelayMs)**
- Executes function with exponential backoff on failure
- Returns result on success or throws after max attempts

**deepMerge(target, source)**
- Recursively merges objects
- Source overwrites target
- Returns merged object

**groupBy(items, keyFn)**
- Groups array by key function result
- Returns Map<key, items[]>

**unique(items, keyFn?)**
- Removes duplicates from array
- Optional key function for comparison
- Returns unique items

---

## Common Utilities Patterns

### Error Handling
- Safe parsing functions return empty defaults instead of throwing
- Errors logged but don't cascade
- Graceful degradation preferred

### Performance
- Caching at utilities layer (parsing results cached)
- Lazy computation (calculate on use)
- Pagination support built-in

### Safety
- Type guards (asRecord, isValidEmail)
- Safe conversions (toNumber, parsePrice)
- Null/undefined handling

### Logging
- Consistent prefix tags: [ComponentName]
- Error context included
- Truncate large values in logs

