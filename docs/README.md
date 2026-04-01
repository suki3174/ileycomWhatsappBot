# WhatsApp Bot Project Documentation

Complete documentation for the ILeycom WhatsApp seller bot application.

---

## 📋 Table of Contents

- **[MODELS.md](./MODELS.md)** - Data types and interfaces
- **[SERVICES.md](./SERVICES.md)** - Business logic layer
- **[HANDLERS.md](./HANDLERS.md)** - WhatsApp Flow screen handlers
- **[REPOSITORIES.md](./REPOSITORIES.md)** - Data access and caching
- **[UTILITIES.md](./UTILITIES.md)** - Helper functions
- **[API_ROUTES.md](./API_ROUTES.md)** - REST endpoints and webhooks

---

## 🏗 Architecture Overview

### Application Layers

```
┌─────────────────────────────────────────────────────┐
│         WhatsApp Flow Interface (Client)             │
└────────────────────┬────────────────────────────────┘
                     │ (Encrypted Messages)
                     ↓
┌─────────────────────────────────────────────────────┐
│         API Routes Layer                             │
│  (webhook_endpoint, meta_endpoint, send endpoints)   │
│  - Decrypt/encrypt WhatsApp requests                 │
│  - Route to appropriate handler                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│         Handlers Layer                               │
│  (Flow screen logic)                                 │
│  - addProductFlow_handler                            │
│  - productsFlow_handler                              │
│  - ordersFlow_handler                                │
│  - optimizedProduct_handler                          │
│  - etc.                                              │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│         Services Layer                               │
│  (Business Logic)                                    │
│  - add_product_service                               │
│  - ai_optimization_service                           │
│  - auth_service                                      │
│  - menu_service                                      │
│  - order_service                                     │
│  - products_service                                  │
│  - etc.                                              │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│         Repositories Layer                           │
│  (Data Access & Caching)                             │
│  - *_cache.ts (in-memory cache with TTL)             │
│  - *_repo.ts (plugin/database queries)               │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│         External Services                            │
│  - WordPress Plugin API                              │
│  - Meta Graph API (WhatsApp)                         │
│  - AI Optimization Service                           │
│  - Email Service                                     │
└─────────────────────────────────────────────────────┘
```

### Flow Architecture

```
Seller Message via WhatsApp
         ↓
    webhook_endpoint (verify + route)
         ↓
handler/{flow}_meta_endpoint (decrypt, handler.ts logic)
         ↓
Services → Repositories Caches/Database
         ↓
Response encrypted and returned to WhatsApp
         ↓
Seller sees next flow screen
```

---

## 🔄 Key Workflows

### 1. Seller Authentication
```
Seller texts menu button → Auth flow sent
     ↓
Seller enters email/code → Validated by auth_service
     ↓
Session created → flow_token generated
     ↓
Menu sent → Seller sees options
```

### 2. Product Creation (Add Product Flow)
```
Seller selects "Add Product" → addProductFlow sent
     ↓
Multi-screen flow: photo → name → category → pricing → details → quantity
     ↓
Summary screen → Seller submits
     ↓
Product saved to WordPress → Seller phone extracted
     ↓
AI optimization triggered (async, non-blocking)
     ↓
Seller sees SUCCESS → Returns to menu
     ↓
(Background) AI processes → Auto-sends optimizedProductFlow
```

### 3. AI Optimization (NEW)
```
Product created in addProductFlow_handler
     ↓
POST to /api/seller/optimizedProductFlow/genAI_endpoint
  { productId, sellerPhone }
     ↓
Returns 202 Accepted immediately
     ↓
(Background) submitToAIService:
  - POST to AI_SERVICE_URL with { productId }
  - AI fetches full product details
  - AI analyzes and returns suggestions
  - Cache updated to COMPLETED
     ↓
triggerOptimizedProductFlowSend:
  - Fetch seller name from database
  - POST to /api/seller/optimizedProductFlow/send
  - WhatsApp sends flow to seller
     ↓
Seller receives notification + can view optimized product
```

### 4. View Products
```
Seller selects "View My Products" → Products flow sent
     ↓
Products list screen (paginated)
     ↓
Seller can search or select product for detail view
```

### 5. View Orders
```
Seller selects "View My Orders" → Orders flow sent
     ↓
Orders list with status (completed/in_delivery/to_deliver)
     ↓
Seller can select order for detail view
     ↓
Order detail: articles, pricing, addresses, tracking
```

---

## 📁 Directory Structure

```
src/
├── app/
│   └── api/
│       ├── webhook_endpoint/          # Main WhatsApp webhook
│       └── seller/
│           ├── authFlow/              # Authentication (3 endpoints)
│           ├── menu_template/         # Main menu (1 endpoint)
│           ├── addProductFlow/        # Product creation (2 endpoints)
│           ├── productsFlow/          # Product listing (2 endpoints)
│           ├── ordersFlow/            # Order history (2 endpoints)
│           ├── updateProductFlow/     # Product editing (2 endpoints)
│           └── optimizedProductFlow/  # AI optimized product (3 endpoints)
│
├── handlers/seller/
│   ├── addProductFlow_handler.ts
│   ├── auth_flowHandler.ts
│   ├── menu_handler.ts
│   ├── optimizedProduct_handler.ts     # NEW
│   ├── ordersFlow_handler.ts
│   ├── productsFlow_handler.ts
│   ├── sendBatch_handler.ts
│   └── updateProductFlow_handler.ts
│
├── services/
│   ├── add_product_service.ts
│   ├── ai_optimization_service.ts      # NEW
│   ├── auth_service.ts
│   ├── menu_service.ts
│   ├── order_service.ts
│   ├── products_service.ts
│   ├── reset_code_service.ts
│   └── update_product_service.ts
│
├── repositories/
│   ├── addProduct/
│   │   ├── add_product_cache.ts
│   │   ├── add_product_repo.ts
│   │   ├── pricing_repo.ts
│   │   └── product_category_repo.ts
│   ├── auth/
│   │   ├── auth_cache.ts
│   │   └── seller_repo.ts
│   ├── orders/
│   │   ├── order_cache.ts
│   │   └── order_repo.ts
│   ├── products/
│   │   ├── poducts_cache.ts
│   │   ├── product_repo.ts
│   │   ├── update_product_cache.ts
│   │   └── update_product_repo.ts
│   ├── ai_optimization/              # NEW
│   │   └── ai_optimization_cache.ts
│   └── optimizedProductFlow/         # NEW
│       └── optimized_product_flow_cache.ts
│
├── models/
│   ├── ai_optimization_model.ts       # NEW
│   ├── category_model.ts
│   ├── flowRequest.ts
│   ├── flowResponse.ts
│   ├── oder_model.ts
│   ├── product_model.ts
│   ├── seller_model.ts
│   └── sendResult.ts
│
└── utils/
    ├── core_utils.ts
    ├── data_parser.ts
    ├── flow_crypto.ts
    ├── image_processor.ts
    ├── mailer.ts
    ├── oders_flow_utils.ts
    ├── order_flow_renderer.ts
    ├── pin_hash.ts
    ├── plugin_client.ts
    ├── product_flow_renderer.ts
    ├── products_flow_utils.ts
    ├── repository_utils.ts
    ├── seller_auth_helpers.ts
    └── utilities.ts
```

---

## 🌐 External Integrations

### WordPress Plugin API
- **Endpoint:** Plugin callbacks configured on backend
- **Operations:**
  - Save products (with images)
  - Fetch products/categories/orders
  - Update product fields
  - Get exchange rates (TND ↔ EUR)
- **Timeout:** 10-15 seconds
- **Retry:** 3 attempts with exponential backoff

### Meta Graph API
- **Endpoint:** `https://graph.instagram.com/...`
- **Operations:**
  - Send WhatsApp Flow template messages
  - Receive flow callbacks
  - Encryption/decryption
- **Authentication:** Bearer token from environment
- **Rate limit:** 1000 messages/day per seller

### AI Optimization Service
- **Endpoint:** Configured via `AI_SERVICE_URL` environment variable
- **Request:** `{ productId }`
- **Response:** Optimized suggestions (name, descriptions, tags, categories)
- **Timeout:** 30 seconds
- **Non-blocking:** Called async after product creation

### Email Service
- **Endpoint:** SMTP configured in `.env`
- **Usage:** Password reset flows
- **Templates:** HTML templates stored in filesystem

---

## ⚙️ Configuration (Environment Variables)

```bash
# WhatsApp/Meta Integration
WHATSAPP_PHONE_ID=...
WHATSAPP_BUSINESS_ID=...
WHATSAPP_ACCESS_TOKEN=...
META_WEBHOOK_VERIFY_TOKEN=...

# Flow Encryption
FLOW_ENCRYPTION_PRIVATE_KEY=...
FLOW_ENCRYPTION_PUBLIC_KEY=...

# AI Optimization
AI_SERVICE_URL=http://localhost:8000/api/optimize
AI_SERVICE_TIMEOUT_MS=30000
AI_SERVICE_API_KEY=...

# Plugin Backend
PLUGIN_API_URL=...
PLUGIN_TIMEOUT_MS=15000

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...

# Base URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Testing
TEST_PHONE_NUMBER=21650354773
```

---

## 📊 Data Flow Examples

### Add Product → AI Optimization

```
User submits product
    ↓ [addProductFlow_handler.handleSubmitSummary]
persistDraftProduct() → Creates in WordPress
    ↓ Extract seller phone from token
POST /api/seller/optimizedProductFlow/genAI_endpoint
    { productId: "123", sellerPhone: "21650354773" }
    ↓ [genAI_endpoint POST handler]
triggerProductOptimization(productId, sellerPhone) → Returns 202
    ↓ (Async background)
submitToAIService(productId, sellerPhone)
    ↓ POST to AI_SERVICE_URL with only { productId }
    [AI fetches details from backend, analyzes]
    AI returns optimization result
    ↓ Cache updated to COMPLETED
triggerOptimizedProductFlowSend(sellerPhone)
    ↓ Fetch seller name from database
POST /api/seller/optimizedProductFlow/send
    { seller: { phone: "21650354773", name: "Maison & Argile" } }
    ↓ Send WhatsApp Flow template
Seller receives notification with optimized product screen
```

### View Products with Optimization Status

```
User navigates to optimized product flow
    ↓ [optimizedProduct_handler]
getAddProductState(token) → Get product_id
    ↓ [handleShowOptimizedProduct]
getOptimizationStatus(productId) → Check cache
    ↓ if COMPLETED:
getOptimizationResult(productId) → Fetch AI result
    ↓ getAddProductState() → Fetch original product
Merge: Use optimized name/desc/tags; keep original pricing
    ↓
Return AI_PRODUCT screen with merged data
```

---

## 🚀 Performance Optimizations

### Caching Strategy
- **Product list:** 5-minute TTL (frequent updates)
- **Individual product:** 1-hour TTL
- **Categories:** 24-hour TTL (rarely change)
- **Session state:** 24-hour TTL (matches session)
- **Optimization state:** 24-hour TTL (prevents memory leak)

### Non-blocking Operations
- AI optimization: Fire-and-forget, return 202 Accepted
- Menu sending: Queued with retry logic
- Image compression: Async processing
- Batch messages: Background job queue

### Early Termination
- Token-first auth lookup (avoids slow phone lookup)
- Category cache warmup during INIT
- Subcategory lazy loading (on demand)
- Product pagination (load only needed page)

---

## 🔐 Security Measures

### Authentication
- Flow token embedded in requests (can't spoof)
- Session expiration (24 hours)
- Email + code verification
- Reset tokens (24-hour expiration)

### Encryption
- All flow messages encrypted (RSA-OAEP + AES)
- Media files encrypted in transit
- Private keys never logged
- Signature verification on webhooks

### Input Validation
- Email format validation
- Phone number normalization
- Price parsing with bounds checking
- File type/size validation on images

### Data Protection
- No passwords stored (PIN hashed with bcrypt)
- Sensitive data truncated in logs
- Cache data auto-expires
- Session tokens rotate

---

## 🧪 Common Testing Scenarios

### Test Phone Number
- Default: `21650354773`
- Seeded seller: "Maison & Argile"
- Configured via `TEST_PHONE_NUMBER` env var

### Test Product Creation
1. Start addProductFlow
2. Upload test images
3. Enter "Test Product"
4. Select category/subcategory
5. Enter pricing (e.g., 100 TND, 25 EUR)
6. Submit → Check AI optimization triggered

### Test AI Optimization
1. Monitor AI_SERVICE_URL logs
2. Check cache state transitions (PENDING → PROCESSING → COMPLETED)
3. Verify flow auto-sent when AI completes
4. View optimized product screen

### Test Orders/Products
1. Load test data with mock orders/products
2. Navigate products flow
3. Test pagination and search
4. Load orders flow
5. Test status filtering

---

## 📝 Development Notes

### Adding a New Flow
1. Create handler in `handlers/seller/{flow}Handler.ts`
2. Create service functions in `services/{flow}_service.ts`
3. Create repository caches in `repositories/{flow}/*_cache.ts`
4. Create API endpoints:
   - `api/seller/{flow}/meta_endpoint` (GET)
   - `api/seller/{flow}/send` (POST)
5. Update webhook_endpoint routing
6. Document in this README

### Adding a New Handler Function
1. Follow screen naming convention
2. Accept `FlowRequest` or token parameter
3. Return `FlowResponse` with screen and data
4. Handle errors gracefully
5. Log all operations with `[HandlerName]` prefix

### Cache Invalidation Strategy
- **Explicit:** Call clear function after mutations
- **Automatic:** TTL expiration
- **Cascade:** When seller updates product, invalidate product cache

---

## 📚 Additional Resources

- **WhatsApp Flow Documentation:** [Meta Business Docs](https://developers.facebook.com/docs/whatsapp/flows)
- **Next.js API Routes:** [Next.js Docs](https://nextjs.org/docs/api-routes/introduction)  
- **Environment Setup:** See `.env.example`
- **Plugin Integration:** Consult plugin documentation

---

## 🐛 Troubleshooting

**Issue:** Flow not sending to seller
- Check: Seller phone valid
- Check: Meta API token valid
- Check: Template published on Meta
- Check: Endpoint CORS configured

**Issue:** AI optimization not triggering
- Check: AI_SERVICE_URL configured
- Check: AI service running and accessible
- Check: sellerPhone passed through pipeline
- Check: Cache not full (monitor memory)

**Issue:** Product not created
- Check: Image encryption/decryption
- Check: Plugin API accessible
- Check: Seller authenticated
- Check: All required fields entered

**Issue:** Slow flow responses
- Check: Cache hits (log timing)
- Check: Plugin API latency
- Check: Database querycount
- Consider: Adding pagination, filtering

---

**Last Updated:** March 31, 2026
**Version:** 2.0 (with AI Optimization)
**Maintainer:** Development Team

