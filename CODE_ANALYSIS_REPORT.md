# Code Analysis Report - Duplicate Files & Unused Functions

**Analysis Date:** April 3, 2026

---

## DUPLICATE FILES (Never Imported - Can Be Deleted)

### 1. **`src/utils/products_flow_utils.ts`** ❌
- **Status:** NEVER IMPORTED OR USED
- **Duplicate of:** `src/utils/product_flow_renderer.ts` ✅ (actively used)
- **Imported by:** Nobody
- **Used by:** Nobody
- **Impact:** This is a complete duplicate file. All functions exist in `product_flow_renderer.ts` which is actively used by:
  - `src/handlers/seller/productsFlow_handler.ts`
  - `src/handlers/seller/updateProductFlow_handler.ts`
  - `src/handlers/seller/optimizedProduct_handler.ts`

### 2. **`src/utils/oders_flow_utils.ts`** ❌
- **Status:** NEVER IMPORTED OR USED (typo in filename: "oders" instead of "orders")
- **Duplicate of:** `src/utils/order_flow_renderer.ts` ✅ (actively used)
- **Imported by:** Nobody
- **Used by:** Nobody
- **Impact:** Complete duplicate file. All functions exist in `order_flow_renderer.ts` which is actively used by:
  - `src/handlers/seller/ordersFlow_handler.ts`

### 3. **`src/utils/utilities.ts`** ❌
- **Status:** NEVER IMPORTED OR USED
- **Duplicate of:** `src/utils/core_utils.ts` ✅ (actively used ~20+ imports)
- **Functions exported (12):** All identical to core_utils.ts
  - `isValidEmail()`
  - `generateResetToken()`
  - `getFlowToken()`
  - `paginateArray()`
  - `toNumber()`
  - `computeSellingPrice()`
  - `convertTndToEur()`
  - `formatGainTnd()`
  - `formatGainEur()`
  - `parsePrice()`
  - `hasInvalidPromoPrice()`
  - `safeInitLabel()`
- **Imported by:** Nobody
- **Used by:** Nobody
- **Impact:** core_utils.ts is the active version used everywhere

### 4. **`src/utils/repository_utils.ts`** ❌
- **Status:** NEVER IMPORTED OR USED
- **Duplicate of:** `src/utils/data_parser.ts` ✅ (actively used ~17 imports)
- **Functions exported (7):** All identical to data_parser.ts
  - `normText()`
  - `toNum()`
  - `toBool()`
  - `asRecord()`
  - `toStringArray()`
  - `extractPhoneFromFlowToken()`
  - `tryExtractTrailingJsonObject()`
- **Imported by:** Nobody
- **Used by:** Nobody
- **Impact:** data_parser.ts is the active version used everywhere

---

## UNUSED EXPORTED FUNCTIONS (Exported but Never Called)

### In `src/utils/product_flow_renderer.ts`

1. **`buildProductListResponse()`** (Line 363) ❌
   - Exported but never imported or called anywhere
   - Code replacement available: Use `buildProductListPagedResponse()` instead (which IS used)
   - Likely replaced by `buildProductListPagedResponse()` during refactoring
   - **Action:** SAFE TO DELETE

---

## UNUSED EXPORTED FUNCTIONS (In Duplicate Files)

### In `src/utils/order_flow_renderer.ts`
1. **`formatOrderStatusCounters()`** ❌ - Defined but never called
2. **`formatEmptyOrderListItem()`** ❌ - Defined but never called

These are likely legacy code. They exist in both `order_flow_renderer.ts` AND `oders_flow_utils.ts`.

---

## UNUSED EXPORTED FUNCTIONS (In Services)

### In `src/services/order_service.ts`

1. **`getOrderStatusCountersCached()`** (Line 132) ❌
   - Exported but never imported anywhere
   - Only returns hardcoded stub value: `{ total: 0, completed: 0, in_delivery: 0, to_deliver: 0 }`
   - **Action:** SAFE TO DELETE

2. **`filterOrdersForStatus()`** (Line 138) ❌
   - Exported but never imported anywhere
   - Simple wrapper around `filterOrdersByStatus()` from order_repo
   - No semantic difference from using the repo function directly
   - **Action:** SAFE TO DELETE

3. **`primeOrdersAsync()`** (Line 145) ❌
   - Exported but never imported anywhere
   - Job: Preload order summaries page in background
   - Could be deleted OR kept if it's reserved for future use
   - **Action:** SAFE TO DELETE

4. **`primeOrderCountersAsync()`** (Line 152) ❌
   - Exported but never imported anywhere
   - Job: Preload order status counters in background
   - Could be deleted OR kept if it's reserved for future use
   - **Action:** SAFE TO DELETE

---

## UNUSED EXPORTED FUNCTIONS (In Repositories)

### In `src/repositories/orders/order_cache.ts`

1. **`getCachedOrdersForToken()`** (Line 51) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

2. **`getCachedOrderCountersForToken()`** (Line 79) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

### In `src/repositories/products/poducts_cache.ts` (note: typo in filename)

1. **`getProductsPageCursor()`** (Line 17) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

2. **`setProductsPageCursor()`** (Line 22) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

3. **`getLastVariableProductId()`** (Line 27) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

4. **`setLastVariableProductId()`** (Line 32) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

5. **`getCachedProductListPageData()`** (Line 37) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

6. **`setCachedProductListPageData()`** (Line 48) ❌
   - Exported but never imported anywhere
   - **Action:** SAFE TO DELETE

---

## SUMMARY & RECOMMENDATIONS

### Duplicate Files to Delete
| File | Issue | Action | Impact |
|------|-------|--------|--------|
| `src/utils/products_flow_utils.ts` | Duplicate & unused | **DELETE** | 🟢 Safe - No imports |
| `src/utils/oders_flow_utils.ts` | Duplicate & unused | **DELETE** | 🟢 Safe - No imports |
| `src/utils/utilities.ts` | Duplicate & unused | **DELETE** | 🟢 Safe - No imports |
| `src/utils/repository_utils.ts` | Duplicate & unused | **DELETE** | 🟢 Safe - No imports |

### Unused Functions to Remove

| File | Functions | Count | Action |
|------|-----------|-------|--------|
| `src/utils/product_flow_renderer.ts` | `buildProductListResponse()` | 1 | **DELETE** |
| `src/utils/order_flow_renderer.ts` | `formatOrderStatusCounters()`, `formatEmptyOrderListItem()` | 2 | **DELETE** |
| `src/services/order_service.ts` | `getOrderStatusCountersCached()`, `filterOrdersForStatus()`, `primeOrdersAsync()`, `primeOrderCountersAsync()` | 4 | **DELETE** |
| `src/repositories/orders/order_cache.ts` | `getCachedOrdersForToken()`, `getCachedOrderCountersForToken()` | 2 | **DELETE** |
| `src/repositories/products/poducts_cache.ts` | `getProductsPageCursor()`, `setProductsPageCursor()`, `getLastVariableProductId()`, `setLastVariableProductId()`, `getCachedProductListPageData()`, `setCachedProductListPageData()` | 6 | **DELETE** |

---

## ACTION ITEMS

### Priority 1 (High Impact - Delete Duplicate Files)
- [ ] Delete `src/utils/products_flow_utils.ts`
- [ ] Delete `src/utils/oders_flow_utils.ts`
- [ ] Delete `src/utils/utilities.ts`
- [ ] Delete `src/utils/repository_utils.ts`

**Expected Savings:** ~400-500 lines of redundant code removed

### Priority 2 (High Impact - Remove Unused Exports)

#### Utils Files
- [ ] Remove `buildProductListResponse()` from `src/utils/product_flow_renderer.ts`
- [ ] Remove `formatOrderStatusCounters()` from `src/utils/order_flow_renderer.ts`
- [ ] Remove `formatEmptyOrderListItem()` from `src/utils/order_flow_renderer.ts`

#### Service Files
- [ ] Remove `getOrderStatusCountersCached()` from `src/services/order_service.ts`
- [ ] Remove `filterOrdersForStatus()` from `src/services/order_service.ts`
- [ ] Remove `primeOrdersAsync()` from `src/services/order_service.ts`
- [ ] Remove `primeOrderCountersAsync()` from `src/services/order_service.ts`

#### Repository Files
- [ ] Remove `getCachedOrdersForToken()` from `src/repositories/orders/order_cache.ts`
- [ ] Remove `getCachedOrderCountersForToken()` from `src/repositories/orders/order_cache.ts`
- [ ] Remove `getProductsPageCursor()` from `src/repositories/products/poducts_cache.ts`
- [ ] Remove `setProductsPageCursor()` from `src/repositories/products/poducts_cache.ts`
- [ ] Remove `getLastVariableProductId()` from `src/repositories/products/poducts_cache.ts`
- [ ] Remove `setLastVariableProductId()` from `src/repositories/products/poducts_cache.ts`
- [ ] Remove `getCachedProductListPageData()` from `src/repositories/products/poducts_cache.ts`
- [ ] Remove `setCachedProductListPageData()` from `src/repositories/products/poducts_cache.ts`

**Expected Savings:** ~200-300 more lines of unused code removed

**Total Expected Code Reduction:** ~600-800 lines (~10-15% of utility/service/repository code)

---

## VERIFICATION CHECKLIST

### Duplicate Files
- ✅ `products_flow_utils.ts` - Confirmed 0 imports, 100% identical to `product_flow_renderer.ts`
- ✅ `oders_flow_utils.ts` - Confirmed 0 imports, 100% identical to `order_flow_renderer.ts`
- ✅ `utilities.ts` - Confirmed 0 imports, 100% identical to `core_utils.ts`
- ✅ `repository_utils.ts` - Confirmed 0 imports, 100% identical to `data_parser.ts` (verified across entire src/ tree)

### Unused Functions Verified (0 usages)
- ✅ `buildProductListResponse()` - Confirmed 0 imports/calls
- ✅ `formatOrderStatusCounters()` - Confirmed 0 imports/calls
- ✅ `formatEmptyOrderListItem()` - Confirmed 0 imports/calls
- ✅ `getOrderStatusCountersCached()` - Confirmed 0 imports/calls
- ✅ `filterOrdersForStatus()` - Confirmed 0 imports/calls
- ✅ `primeOrdersAsync()` - Confirmed 0 imports/calls
- ✅ `primeOrderCountersAsync()` - Confirmed 0 imports/calls
- ✅ `getCachedOrdersForToken()` - Confirmed 0 imports/calls
- ✅ `getCachedOrderCountersForToken()` - Confirmed 0 imports/calls
- ✅ `getProductsPageCursor()` - Confirmed 0 imports/calls
- ✅ `setProductsPageCursor()` - Confirmed 0 imports/calls
- ✅ `getLastVariableProductId()` - Confirmed 0 imports/calls
- ✅ `setLastVariableProductId()` - Confirmed 0 imports/calls
- ✅ `getCachedProductListPageData()` - Confirmed 0 imports/calls
- ✅ `setCachedProductListPageData()` - Confirmed 0 imports/calls

---

## FILES ACTIVELY USED (Keep These!)

### Core Utilities (Used)
- ✅ `src/utils/product_flow_renderer.ts` - 3 handlers import from this
- ✅ `src/utils/order_flow_renderer.ts` - 1 handler imports from this
- ✅ `src/utils/core_utils.ts` - ~20+ files import from this
- ✅ `src/utils/data_parser.ts` - ~17 files import from this

---

## NOTES

1. **Possible cause of duplicates:** These may have been created during the development process as backups or alternative implementations, but the "primary" versions (product_flow_renderer, order_flow_renderer, core_utils, data_parser) became the standard and are now actively used throughout the codebase.

2. **Filename typo:** `oders_flow_utils.ts` has a typo ("oders" instead of "orders"), which suggests it was created hastily or as a backup.

3. **No Breaking Changes:** Deleting these files will have ZERO impact on the running application since they are not imported anywhere.
