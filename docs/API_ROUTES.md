# API Routes Documentation

Next.js API endpoints for WhatsApp Flow integration and webhooks.

---

## Endpoint Pattern Overview

### Typical Flow Endpoint Structure
Each flow has 3 endpoints:
1. **meta_endpoint/** - Receives encrypted flow requests from WhatsApp
2. **send/** - Sends flow template to seller (triggers flow in WhatsApp)
3. Optional: Create/trigger endpoints (e.g., genAI_endpoint for optimization)

### Request Flow Within a Flow
```
User Message
    ↓
→ /api/seller/FLOW/send (sends template)
    ↓
WhatsApp sends request to /api/webhook_endpoint
    ↓
→ Decrypts and routes to /api/seller/FLOW/meta_endpoint
    ↓
Handler processes request
    ↓
Encrypts response, returns to WhatsApp
    ↓
User sees next screen
```

---

## Webhook Endpoint

### /api/webhook_endpoint (POST)

**Purpose:** Main webhook from WhatsApp (receives all flow messages)

**Request:** Encrypted WhatsApp message with payload

**Processing:**
1. Verify webhook signature
2. Extract bot_phone and user_phone
3. Decrypt payload
4. Check message type (text vs flow)
5. Route to appropriate handler:
   - Text messages → menuHandler (menu triggers)
   - Flow messages → Identify flow type and decrypt
   - Flow status update → Log completion/error

**Routing Logic:**
- `action === "INIT"` → First flow screen
- `screen === specific_screen` → Flow navigation
- `action === "DATA_EXCHANGE"` → User data submission

**Response:** Send back encrypted response

**Error Handling:** Invalid signatures rejected, malformed messages logged

---

## Auth Flow

### /api/seller/authFlow/meta_endpoint (POST)
**Receives:** Encrypted auth flow requests

**Handlers:**
- `INIT` → WELCOME screen
- `SIGN_IN` screen → Email/code entry
- Validation → SUCCESS or ERROR

**Stores:** Session token (24h expiration)

### /api/seller/authFlow/send (POST)
**Purpose:** Send auth flow template to seller

**Request:** `{ phone }`

**Process:**
1. Validate phone
2. Generate flow_token
3. POST to Meta Graph API
4. Return response

**Used when:** Seller signs in, session expired, code verification needed

### /api/seller/authFlow/forgot_code (POST)
**Purpose:** Send password reset request

**Request:** `{ email }`

**Process:**
1. Find seller by email
2. Generate reset token
3. Send reset link via email
4. Store reset token with 24h expiration

### /api/seller/authFlow/reset_code (POST)
**Purpose:** Complete password reset

**Request:** `{ token, newCode }`

**Process:**
1. Validate reset token (not expired)
2. Validate new code strength
3. Hash and store new code
4. Clear reset token
5. Return SUCCESS

### /api/seller/authFlow/sendBatches (POST)
**Purpose:** Send batch messages to multiple sellers

**Request:** `{ template, recipients: {email|phone|segment} }`

**Process:**
1. Resolve recipients (email → phone lookup)
2. Queue batch job (async)
3. Send messages with retry logic
4. Return batch ID for tracking

---

## Add Product Flow

### /api/seller/addProductFlow/meta_endpoint (POST)
**Receives:** Encrypted add product flow requests

**Screen Handlers:**
- `SCREEN_PHOTO` → Decrypt and compress images
- `SCREEN_NAME` → Save product name
- `SCREEN_CATEGORY` → Return categories list
- `SCREEN_SUBCATEGORY` → Return subcategories
- `SCREEN_PRICE_TND` → Calculate TND margin
- `SCREEN_PRICE_EUR` → Calculate EUR margin
- `SCREEN_DETAILS` → Save dimensions/color/size
- `SCREEN_QUANTITY` → Save stock
- `SCREEN_SUMMARY` → Save product to database + trigger AI optimization
- SUCCESS → Return completion screen

**AI Trigger:** In handleSubmitSummary:
```
1. POST to /api/seller/optimizedProductFlow/genAI_endpoint
2. Body: { productId, sellerPhone }
3. Returns 202 Accepted (async)
```

### /api/seller/addProductFlow/send (POST)
**Purpose:** Send add product flow to seller

**Request:** `{ phone }`

**Response:** Flow template URL/reference

**Used when:** Seller clicks "Add Product" from menu

---

## Products Flow

### /api/seller/productsFlow/meta_endpoint (POST)
**Receives:** Product list flow requests

**Handlers:**
- `INIT` → SCREEN_PRODUCTS with seller's products (paginated)
- `SEARCH` → Filter products by term
- `SELECT_PRODUCT` → Show product detail
- `PAGINATE` → Load next/previous page

### /api/seller/productsFlow/send (POST)
**Purpose:** Send product list flow

**Request:** `{ phone }`

**Used when:** Seller clicks "View My Products" from menu

---

## Orders Flow

### /api/seller/ordersFlow/meta_endpoint (POST)
**Receives:** Order list flow requests

**Handlers:**
- `INIT` → SCREEN_ORDERS with seller's orders (paginated)
- `SELECT_ORDER` → Show order detail
- `UPDATE_STATUS` → Change order fulfillment state
- `FILTER_STATUS` → Show orders by status (completed/in_delivery/to_deliver)

### /api/seller/ordersFlow/send (POST)
**Purpose:** Send order list flow

**Request:** `{ phone }`

**Used when:** Seller clicks "View My Orders" from menu

---

## Update Product Flow

### /api/seller/updateProductFlow/meta_endpoint (POST)
**Receives:** Product editing flow requests

**Handlers:**
- `INIT` → SCREEN_SELECT_PRODUCT with seller's products
- `SELECT_PRODUCT` → SCREEN_PRODUCT_MENU (options: name, desc, pricing, etc.)
- `EDIT_FIELD` → Screen for specific field editing
- `SAVE_FIELD` → Update product in database and trigger AI optimization asynchronously
- SUCCESS → Confirmation

### /api/seller/updateProductFlow/send (POST)
**Purpose:** Send product editing flow

**Request:** `{ phone }`

**Used when:** Seller clicks "Edit Product" from menu

---

## Optimized Product Flow

### /api/seller/optimizedProductFlow/genAI_endpoint (POST/GET)

**POST: Trigger AI Optimization**
- **Request:** `{ productId, sellerPhone? }`
- **Response:** 202 Accepted
- **Behavior:** 
  1. Non-blocking, returns immediately
  2. Fires background AI optimization task
  3. Phone stored for auto-sending flow when complete
  4. Status tracked in cache

**GET: Check Optimization Status**
- **Query:** `?productId=...`
- **Response:** 
  ```json
  {
    "status": "pending|processing|completed|failed",
    "productId": "...",
    "requestedAt": 1711896000000,
    "completedAt": 1711896045000,
    "result": { ...AIOptimizationResponse... }
  }
  ```

### /api/seller/optimizedProductFlow/meta_endpoint (POST)
**Receives:** Encrypted optimized product flow requests

**Handlers:**
- `INIT` → Fetch recently created product
- `DEFAULT` → Show AI_PRODUCT screen
  - Checks optimization status:
    - PENDING/PROCESSING → LOADING screen
    - COMPLETED → AI_PRODUCT (merged data)
    - FAILED → ERROR screen
- `ACCEPT_OPTIMIZATION` → Apply suggestions to product
- `REJECT_OPTIMIZATION` → Keep original product data

**Data Display:**
- If optimization complete: Show original + optimized side-by-side
- Merge optimized name, descriptions, tags, categories
- Pricing always original (not optimized)

### /api/seller/optimizedProductFlow/send (POST)
**Purpose:** Send optimized product flow to seller

**Request:** `{ seller: { phone, name } }`

**HTTP:** POST to Meta Graph API
- **Template:** `optimizedproductflow_message_template`
- **Data:** Seller's recent product ID
- **Trigger:** Auto-called when AI optimization completes

**Workflow:**
1. Validate seller phone
2. Generate or retrieve flow_token for seller
3. Send template via Meta API
4. Return response with Meta API status

**Auto-triggered by:** `/ai_optimization_service.ts` after AI completion

---

## Menu Template

### /api/seller/menu_template/send (POST)
**Purpose:** Send main menu to seller

**Request:** `{ phone }`

**Sends:** Template with buttons:
- "Add Product"
- "View My Products"
- "Edit Product"
- "View My Orders"

**Used by:** Menu broadcast, post-auth signup, session re-activation

**Retry Logic:** Built-in 5 attempts with exponential backoff

---

## Common API Patterns

### Response Status Codes
| Code | Meaning | Use |
|------|---------|-----|
| 200 | OK | Successful GET/POST |
| 202 | Accepted | Async job queued (AI optimization) |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid credentials |
| 404 | Not Found | Seller/product not found |
| 500 | Server Error | Unhandled exception |

### Request/Response Format
**Request:**
```json
{
  "phone": "21650354773",
  "seller": { "name": "...", "phone": "..." },
  "data": { ...flow_data... }
}
```

**Response:**
```json
{
  "success": true,
  "status": "processing",
  "message": "...",
  "data": { ...response_data... }
}
```

### Error Responses
```json
{
  "error": "Error message",
  "details": "Additional context",
  "status": 400
}
```

### Encryption/Decryption
All flow endpoints:
1. Receive: Encrypted payload
2. Decrypt with private key
3. Process request
4. Encrypt response
5. Send back

### Logging
All endpoints log:
- Entry: `[EndpointName] Received request`
- Processing: `[EndpointName] Processing action: ACTION`
- Success: `[EndpointName] Sent to PHONE`
- Error: `[EndpointName] Error: MESSAGE`

### Rate Limiting
- Per seller: 10 requests/minute
- Per phone: 5 templates/minute
- Batch sends: 100/minute total

### Timeouts
- Flow encryption: 5s
- Database queries: 10s
- External API calls: 30s
- Total request: 60s

