# Quick Reference Guide

Fast lookup for common tasks and code locations.

---

## 🎯 Find What You Need

### Adding a New Feature

**"I need to add a new flow type (like checkout)"**
1. Create handler: `src/handlers/seller/{flowName}Handler.ts`
2. Create service: `src/services/{flowName}_service.ts`
3. Create API endpoints:
   - `src/app/api/seller/{flowName}/meta_endpoint/route.ts` (POST)
   - `src/app/api/seller/{flowName}/send/route.ts` (POST)
4. Add cache: `src/repositories/{flowName}/*_cache.ts`
5. Update webhook routing in `webhook_endpoint/route.ts`
6. Document in `docs/API_ROUTES.md`

### Working with Product Data

**"I need to get seller's products"**
- Service: `src/services/products_service.ts` → `getProductsBySellerToken()`
- Cache: `src/repositories/products/poducts_cache.ts` → `getProductsBySellerCached()`
- Model: `src/models/product_model.ts` → `Product` interface

**"I need to fetch categories"**
- Service: `src/services/add_product_service.ts` → `getProductCategoriesCached()`
- Repository: `src/repositories/addProduct/product_category_repo.ts` → `fetchAllProductCategories()`
- Model: `src/models/category_model.ts` → `ProductCategory` interface

**"I need to save a new product"**
- Service: `src/services/add_product_service.ts` → `persistDraftProduct()`
- Handler: `src/handlers/seller/addProductFlow_handler.ts` → `handleSubmitSummary()`
- Repository: `src/repositories/addProduct/add_product_repo.ts` → `saveProductDraft()`

### Working with Orders

**"I need to fetch orders by seller"**
- Service: `src/services/order_service.ts` → `getOrdersBySellerToken()`
- Cache: `src/repositories/orders/order_cache.ts` → `getOrdersBySellerCached()`
- Model: `src/models/oder_model.ts` → `Order` interface

### Working with Authentication

**"I need to verify seller credentials"**
- Service: `src/services/auth_service.ts` → `findSeller()`, `sellerHasCode()`
- Repository: `src/repositories/auth/seller_repo.ts` → `findSellerByPhone()`
- Model: `src/models/seller_model.ts` → `Seller` interface

**"I need to create a seller session"**
- Service: `src/services/auth_service.ts` → `prepareSellerState()`
- Helper: `src/utils/seller_auth_helpers.ts` → `generateFlowtoken()`

### Price Calculations

**"I need to calculate selling price after commission"**
- Utility: `src/utils/core_utils.ts` → `computeSellingPrice(regular, promo)`
- Constant: `COMMISSION_RATE = 0.2261` (22.61%)

**"I need to convert TND to EUR"**
- Service: `src/services/add_product_service.ts` → `convertTndPricesToEur()`
- Repository: `src/repositories/addProduct/pricing_repo.ts` → `convertTndPricesViaPlugin()`

### Image & Media

**"I need to decrypt WhatsApp media"**
- Utility: `src/utils/flow_crypto.ts` → `decryptWhatsAppMedia(mediaObject)`

**"I need to compress images for carousel"**
- Utility: `src/utils/image_processor.ts` → `toCarouselBase64FromBase64()`

### Error Handling & Logging

**"I need to add error handling"**
- Pattern: Non-blocking operations don't re-throw
- Logging: Always use `[ComponentName]` prefix
- Example: `console.error("[ServiceName] Error:", error);`

**"I need to return error response"**
```typescript
return {
  screen: "ERROR",
  data: { error_msg: "User-friendly error message" }
};
```

---

## 📍 Code Location Index

| Task | File | Function |
|------|------|----------|
| Product list | `products_service.ts` | `getProductsBySellerToken()` |
| Save product | `addProductFlow_handler.ts` | `handleSubmitSummary()` |
| Get categories | `add_product_service.ts` | `getProductCategoriesCached()` |
| Order history | `order_service.ts` | `getOrdersBySellerToken()` |
| Verify seller | `auth_service.ts` | `findSeller()` |
| Encrypt/decrypt | `flow_crypto.ts` | `encryptFlowResponse()` / `decryptFlowRequest()` |
| Send menu | `menu_service.ts` | `sendMenu()` |
| Extract phone | `data_parser.ts` | `extractPhoneFromFlowToken()` |
| Validate email | `core_utils.ts` | `isValidEmail()` |
| Hash password | `pin_hash.ts` | `hashPin()` |
| Compress image | `image_processor.ts` | `toCarouselBase64FromBase64()` |
| Pagination | `core_utils.ts` | `paginateArray()` |

---

## 🔗 Flow Connections

### Add Product Flow
```
addProductFlow_handler.handleAddProductFlow() (route)
    ↓
handlePhoto() ... handleSubmitSummary() (screen handlers)
    ↓
Services: add_product_service.persistDraftProduct()
    ↓
Repo: add_product_repo.saveProductDraft()
    ↓
Cache: add_product_cache (state tracking)
```

### Authentication Flow
```
auth_flowHandler.handleAuthFlow() (route)
    ↓
Screen: SIGN_IN → Validate email/code
    ↓
Services: auth_service.findSeller()
    ↓
Repo: seller_repo.findSellerByPhone()
    ↓
Create session (24h)
    ↓
Send menu_template.send()
```

---

## 🛠 Common Patterns

### Cache Usage Pattern
```typescript
// Check cache first
let data = getFromCache(key);

// If not found, fetch from source
if (!data) {
  data = await fetchFromPlugin();
  setInCache(key, data);
}

return data;
```

### Handler Pattern
```typescript
export async function handleScreenName(parsed: FlowRequest): Promise<FlowResponse> {
  const token = getFlowToken(parsed);
  const data = parsed.data || {};
  
  // Fetch state
  const state = getState(token);
  
  // Process action
  const result = performAction(data);
  
  // Update cache
  updateState(token, { ...state, result });
  
  // Return response
  return {
    screen: "NEXT_SCREEN",
    data: { ...result }
  };
}
```

### Service Pattern
```typescript
export async function serviceFunction(input): Promise<Output> {
  try {
    // Validate input
    if (!input.required) throw new Error("Required field missing");
    
    // Call repository
    const result = await repositoryFunction(input);
    
    // Log success
    console.info("[ServiceName] Operation completed for", input.id);
    
    return result;
  } catch (error) {
    // Log error (don't re-throw if non-critical)
    console.warn("[ServiceName] Error:", error);
    
    // Return safe default or re-throw if critical
    return fallbackValue;
  }
}
```

### API Endpoint Pattern
```typescript
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    // Validate
    if (!payload.requiredField) {
      return NextResponse.json({ error: "..." }, { status: 400 });
    }
    
    // Process
    const result = await serviceFunction(payload);
    
    // Return
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[EndpointName] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
```

---

## 📊 Token/Phone Flow

```
User contacts bot on WhatsApp
    ↓ (embedded phone in message)
webhook_endpoint extracts: user_phone
    ↓
Some endpoints generate flow_token:
    flow_token = `flowtoken-{phone}-{timestamp}`
    ↓
Flow token passed in every subsequent request
    ↓
Handlers extract phone from token:
    extractPhoneFromFlowToken(token) → phone number
    ↓
Services use phone to identify seller:
    findSellerByPhone(phone) → Seller object
    ↓
Seller data available throughout flow
```

---

## 🚦 Request Status Codes

| Code | Usage | Example |
|------|-------|---------|
| 200 | Successful | Product fetched |
| 400 | Bad input | Missing product ID |
| 401 | Unauthorized | Invalid seller token |
| 404 | Not found | Seller not in system |
| 500 | Server error | Unhandled exception |

---

## ⏱ Timeout Values (in ms)

| Operation | Timeout | Source |
|-----------|---------|--------|
| Plugin call | 15000 | `PLUGIN_TIMEOUT_MS` |
| AI service | 30000 | `AI_SERVICE_TIMEOUT_MS` |
| Flow encryption | 5000 | Implicit |
| Total API request | 60000 | Node.js default |

---

## 🔑 Environment Variables Quick View

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_BASE_URL` | Local server URL | http://localhost:3000 |
| `AI_SERVICE_URL` | AI endpoint | http://localhost:8000/api/optimize |
| `AI_SERVICE_TIMEOUT_MS` | AI timeout | 30000 |
| `WHATSAPP_ACCESS_TOKEN` | Meta API auth | Required |
| `WHATSAPP_PHONE_ID` | WhatsApp phone ID | Required |
| `TEST_PHONE_NUMBER` | Test seller phone | 21650354773 |

---

## 📞 Testing Commands

**Test product creation:**
```bash
# Manually POST to add product endpoint (local: http://localhost:3000)
curl -X POST http://localhost:3000/api/seller/addProductFlow/meta_endpoint \
  -H "Content-Type: application/json" \
  -d '{"flow_token":"flowtoken-21650354773-123",...}'
```

**Send menu to test phone:**
```bash
curl -X POST http://localhost:3000/api/seller/menu_template/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"21650354773"}'
```

---

## ✅ Pre-Commit Checklist

Before pushing changes:
- [ ] All `console.log()` → `console.info/warn/error`
- [ ] All errors tagged with `[ComponentName]`
- [ ] New code follows current patterns
- [ ] Cache invalidation handled
- [ ] Error handling non-blocking where appropriate
- [ ] Timeouts set for external calls
- [ ] No secrets in logs
- [ ] Models updated if schema changes
- [ ] Documentation updated

---

**Last Updated:** March 31, 2026  
**For quick questions, check docs/ folder structure**

