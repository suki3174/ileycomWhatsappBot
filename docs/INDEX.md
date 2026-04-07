# Project Documentation Index

Complete reference documentation for the ILeycom WhatsApp Seller Bot application.

---

## 📚 Documentation Files

### 1. **README.md** - Main Overview
Complete project documentation with:
- Architecture overview (layered diagram)
- Key workflows (Authentication, Add Product, etc.)
- Directory structure
- External integrations (WordPress, Meta, AI Service, Email)
- Configuration and environment variables
- Data flow examples
- Performance optimizations
- Security measures
- Development notes

**→ Start here for project understanding**

---

### 2. **MODELS.md** - Data Types & Interfaces
All TypeScript interfaces and enums:

| Model | Purpose |
|-------|---------|
| `product_model.ts` | Product data (Product, ProductVariation, AddProductState) |
| `seller_model.ts` | Seller profile (Seller interface) |
| `oder_model.ts` | Order tracking (Order, OrderArticle, OrderStatus) |
| `category_model.ts` | Product categories (ProductCategory, SubCategory) |
| `flowRequest.ts` | WhatsApp Flow incoming requests |
| `flowResponse.ts` | WhatsApp Flow outgoing responses |
| `sendResult.ts` | Message sending results |

**→ Reference for all data structures**

---

### 3. **SERVICES.md** - Business Logic Layer
Services implementing core workflows:

| Service | Purpose | Key Functions |
|---------|---------|----------------|
| `auth_service.ts` | Authentication & sessions | findSeller(), sellerHasCode(), setSellerCode() |
| `add_product_service.ts` | Product creation | persistDraftProduct(), getProductCategoriesCached() |
| `menu_service.ts` | Menu distribution | sendMenu() |
| `order_service.ts` | Order retrieval | getOrdersBySellerToken(), updateOrderStatus() |
| `products_service.ts` | Product listing & search | getProductsBySellerToken(), searchProducts() |
| `reset_code_service.ts` | Password reset | initiateReset(), verifyResetCode() |
| `update_product_service.ts` | Product editing | updateProductFields(), getUpdateProductState() |

**→ Reference for business logic implementation**

---

### 4. **HANDLERS.md** - WhatsApp Flow Handlers
Screen-by-screen flow logic:

| Handler | Screens Managed | Key Entry Point |
|---------|-----------------|-----------------|
| `addProductFlow_handler.ts` | Photo → Name → Category → Pricing → Details → Quantity → Summary → Success | handleAddProductFlow() |
| `optimizedProduct_handler.ts` | INIT → Show AI_PRODUCT (with load/error states) | handleOptimizedProductDetail() |
| `auth_flowHandler.ts` | WELCOME → SIGN_IN → SUCCESS | handleAuthFlow() |
| `menu_handler.ts` | Incoming message routing | handleIncomingMessage() |
| `productsFlow_handler.ts` | Product list → Detail → Search | handleProductsFlow() |
| `ordersFlow_handler.ts` | Order list → Detail → Status filter | handleOrdersFlow() |
| `updateProductFlow_handler.ts` | Select product → Edit fields → Save | handleUpdateProductFlow() |
| `sendBatch_handler.ts` | Template selection → Recipients → Preview → Send | handleSendBatchFlow() |

**→ Reference for UI flow logic**

---

### 5. **REPOSITORIES.md** - Data Access Layer
Cache systems and database interactions:

| Repository | Data Type | Cache TTL |
|------------|-----------|-----------|
| `add_product_cache.ts` | Product creation state | 24 hours |
| `add_product_repo.ts` | Product persistence | — |
| `auth_cache.ts` | Auth warmup cache | 5 minutes |
| `order_cache.ts` | Order list | 24 hours |
| `poducts_cache.ts` | Product list | 5 minutes |
| `optimized_product_flow_cache.ts` | Flow session | 24 hours |

**→ Reference for data access patterns**

---

### 6. **UTILITIES.md** - Helper Functions
Reusable utility functions organized by category:

| Category | Functions | File |
|----------|-----------|------|
| **Validation** | isValidEmail(), parsePrice() | core_utils.ts |
| **Tokens** | getFlowToken(), generateResetToken() | core_utils.ts |
| **Arrays** | paginateArray(), unique(), groupBy() | core_utils.ts |
| **Prices** | computeSellingPrice(), formatGainTnd() | core_utils.ts |
| **Parsing** | extractPhoneFromFlowToken(), parsePluginJsonSafe() | data_parser.ts |
| **Encryption** | encryptFlowResponse(), decryptFlowRequest() | flow_crypto.ts |
| **Images** | buildCarousel(), compressImage() | image_processor.ts |
| **Email** | sendEmail(), formatEmailTemplate() | mailer.ts |
| **Hashing** | hashPin(), verifyStoredPin() | pin_hash.ts |
| **HTTP** | pluginPost(), pluginPostWithRetry() | plugin_client.ts |

**→ Reference for helper functions**

---

### 7. **API_ROUTES.md** - REST Endpoints & Webhooks
Complete API endpoint documentation:

#### Main Endpoints
- `/api/webhook_endpoint` - WhatsApp webhook receiver
- `/api/seller/menu_template/send` - Send main menu

#### Flow Endpoints (3 per flow)
Each flow has pattern: `meta_endpoint` (receiver) + `send` (trigger) + optional (create)

| Flow | Purpose | Endpoints |
|------|---------|-----------|
| Auth Flow | Seller login | 5 endpoints (sign in, forgot code, reset code, batch send) |
| Add Product Flow | Create product | 2 endpoints + AI trigger |
| Products Flow | View products | 2 endpoints |
| Orders Flow | View orders | 2 endpoints |
| Update Product Flow | Edit product | 2 endpoints + AI trigger |
| Optimized Product Flow | AI results | 3 endpoints (detect, send, check AI status) |

**→ Reference for API contracts and request/response formats**

---

### 8. **QUICK_REFERENCE.md** - Fast Lookup
Developer quick-reference guide:

- **Find What You Need** - Code locations for common tasks
- **Code Location Index** - Function-to-file mapping
- **Flow Connections** - How components interact
- **Common Patterns** - Copy-paste templates
- **Request Status Codes** - HTTP semantics
- **Timeout Values** - Performance SLAs
- **Testing Commands** - curl examples
- **Pre-Commit Checklist** - Quality gates

**→ Use for quick lookups during development**

---

## 📁 Documentation Organization

```
docs/
├── README.md                 ← Start here
├── MODELS.md                 ← Data structures
├── SERVICES.md               ← Business logic
├── HANDLERS.md               ← UI flow logic
├── REPOSITORIES.md           ← Data access
├── UTILITIES.md              ← Helper functions
├── API_ROUTES.md             ← REST endpoints
├── QUICK_REFERENCE.md        ← Fast lookup
└── INDEX.md                  ← This file
```

---

## 🔍 How to Use This Documentation

### For New Developers
1. **Start:** README.md + architecture overview
2. **Understand:** MODELS.md (what data exists)
3. **Learn flows:** HANDLERS.md (how UI works)
4. **Explore code:** REPOSITORIES.md + SERVICES.md (backend logic)
5. **Reference:** QUICK_REFERENCE.md (during coding)

### For Debugging
1. Find problematic component
2. Look up in QUICK_REFERENCE.md → File location
3. Read relevant doc section (README, HANDLERS, SERVICES)
4. Check data flow diagrams
5. Use curl examples from API_ROUTES.md

### For Adding Features
1. Determine which layer (handler, service, repo)
2. Check corresponding documentation file
3. Follow patterns from existing code
4. Use QUICK_REFERENCE.md for patterns/templates
5. Update relevant documentation file

### For Code Review
1. Check pre-commit checklist in QUICK_REFERENCE.md
2. Verify pattern adherence (use common patterns from docs)
3. Check error handling (review SERVICES.md patterns)
4. Verify cache invalidation (review REPOSITORIES.md)

---

## 🎯 Key Concepts Explained Per Document

### README.md Covers
- ✅ High-level architecture
- ✅ Workflow diagrams
- ✅ External integrations
- ✅ Environment setup
- ✅ Performance optimization
- ✅ Security measures

### MODELS.md Covers
- ✅ All interfaces and enums
- ✅ Fields and types
- ✅ Related models
- ✅ Mock/example data

### SERVICES.md Covers
- ✅ Function signatures
- ✅ Input/output contracts
- ✅ Side effects
- ✅ Error handling patterns
- ✅ Cache usage
- ✅ Phone extraction patterns

### HANDLERS.md Covers
- ✅ Screen flow sequences
- ✅ Action routing logic
- ✅ Data merging logic
- ✅ Error states
- ✅ Common utilities

### REPOSITORIES.md Covers
- ✅ Cache layer design
- ✅ TTL strategy
- ✅ Plugin integration pattern
- ✅ Fallback behavior
- ✅ Cache invalidation

### UTILITIES.md Covers
- ✅ Function purpose and contract
- ✅ Input validation behavior
- ✅ Error handling approach
- ✅ Performance considerations
- ✅ Related functions

### API_ROUTES.md Covers
- ✅ Request/response formats
- ✅ HTTP status codes
- ✅ Processing sequence
- ✅ Error responses
- ✅ Encryption/decryption
- ✅ Retry logic

### QUICK_REFERENCE.md Covers
- ✅ Fast code location lookup
- ✅ Copy-paste code patterns
- ✅ Common commands
- ✅ Quick checklist items

---

## 🔗 Cross-References

### Authentication Flow
- **Overview:** README.md → "Seller Authentication" workflow
- **Service:** SERVICES.md → "auth_service.ts"
- **Repository:** REPOSITORIES.md → "auth/"
- **Handler:** HANDLERS.md → "auth_flowHandler.ts"
- **API:** API_ROUTES.md → "Auth Flow"

### Product Creation
- **Overview:** README.md → "Product Creation" workflow
- **Handler:** HANDLERS.md → "addProductFlow_handler.ts"
- **Service:** SERVICES.md → "add_product_service.ts"
- **Repository:** REPOSITORIES.md → "addProduct/"
- **API:** API_ROUTES.md → "Add Product Flow"
- **Models:** MODELS.md → "product_model.ts"

---

## 📊 File Statistics

- **Total documentation files:** 8 markdown files
- **Total lines:** ~3,500 lines
- **Code locations referenced:** 70+ files
- **Diagrams:** 5+ ASCII diagrams
- **Examples:** 20+ code examples
- **Tables:** 30+ reference tables

---

## 🚀 Coming Soon / TODO Documentation

- [ ] Database schema documentation
- [ ] Plugin API contract documentation
- [ ] WhatsApp Flow template JSON examples
- [ ] Performance testing guide
- [ ] Troubleshooting runbook
- [ ] Deployment guide
- [ ] API rate limiting documentation

---

## 📋 File Statistics by Layer

| Layer | Files | Pages | Functions |
|-------|-------|-------|-----------|
| **Models** | 8 | 1 | 8 interfaces + 1 enum |
| **Services** | 8 | 2 | 30+ functions |
| **Handlers** | 8 | 1.5 | 15+ functions |
| **Repositories** | 14 | 1.5 | 25+ functions |
| **Utilities** | 14 | 1.5 | 35+ functions |
| **API Routes** | 18 | 2 | 25+ endpoints |
| **Total** | 70 | 9.5 | 130+ |

---

## 🎓 Learning Path

### Beginner (New to project)
1. README.md - Overview (20 min)
2. MODELS.md - Data structures (15 min)
3. QUICK_REFERENCE.md - Navigation (10 min)
4. Pick one flow and read HANDLERS + API_ROUTES (30 min)

**Total: ~75 minutes**

### Intermediate (Adding features)
1. Read SERVICES.md section for feature area (20 min)
2. Read REPOSITORIES.md for data patterns (15 min)
3. Read QUICK_REFERENCE.md for common patterns (10 min)
4. Find similar code and adapt (variable)

**Total: ~45+ minutes**

### Advanced (Code review, debugging)
1. QUICK_REFERENCE.md for component locations (5 min)
2. Relevant documentation section (10 min)
3. Cross-reference related files (variable)
4. Use API_ROUTES.md for request testing (5 min)

**Total: ~20+ minutes**

---

## 📞 How to Update Documentation

When code changes:
1. **New file/function added?** → Add entry to relevant doc file
2. **Changed flow?** → Update README.md diagram + HANDLERS.md
3. **New API endpoint?** → Update API_ROUTES.md
4. **Bug fixed?** → Consider adding troubleshooting note to README.md

When adding feature:
1. Update README.md with workflow
2. Document in relevant layer file (SERVICES, HANDLERS, REPOSITORIES)
3. Add quick reference entry in QUICK_REFERENCE.md
4. Add data model to MODELS.md if new types

---

## ✅ Documentation Quality Checklist

- ✅ All 70+ source files referenced
- ✅ Every public function documented
- ✅ Every interface/enum explained
- ✅ Examples provided for complex patterns
- ✅ Cross-references between documents
- ✅ Performance implications noted
- ✅ Error handling patterns shown
- ✅ Security considerations mentioned
- ✅ Configuration options listed
- ✅ Quick lookup available

---

## 📞 Questions? Check Here:

| Question | Document | Section |
|----------|----------|---------|
| "How does the app work?" | README.md | Architecture Overview |
| "What data structures exist?" | MODELS.md | All sections |
| "How do I add a feature?" | QUICK_REFERENCE.md | Adding a New Feature |
| "Where is function X?" | QUICK_REFERENCE.md | Code Location Index |
| "How does caching work?" | REPOSITORIES.md | Common Patterns |
| "What's the API contract?" | API_ROUTES.md | Endpoint Pattern Overview |
| "How do I test something?" | QUICK_REFERENCE.md | Testing Commands |
| "What's the flow for X?" | HANDLERS.md | Relevant handler |
| "How do services work?" | SERVICES.md | Relevant service |
| "What's the code pattern?" | QUICK_REFERENCE.md | Common Patterns |

---

**Last Updated:** March 31, 2026  
**Documentation Version:** 2.1 (removed AI Optimization)  
**Status:** Complete and current

