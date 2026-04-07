# Handlers Documentation

WhatsApp Flow screen handlers converting user actions to responses.

---

## Pattern Overview

Handlers receive FlowRequest (user action on screen) and return FlowResponse (next screen to show). Each handler exports a main function and internal screen handlers.

### Common Pattern
1. **Main Handler:** Receives FlowRequest, routes by action
2. **INIT Logic:** Initialize flow state from cache/database
3. **DATA_EXCHANGE Logic:** Handle user input, calculate responses
4. **Response:** Return FlowResponse with screen name and data

---

## addProductFlow_handler.ts

Manages multi-screen product creation workflow.

### handleAddProductFlow(parsed: FlowRequest)
**Main entry point**
- **INIT:** Loads categories, returns SCREEN_PHOTO
- **DATA_EXCHANGE:** Routes by screen (photo, name, category, etc.)
- **Flow screens:**
  - `SCREEN_PHOTO` → `SCREEN_NAME` (upload images)
  - `SCREEN_NAME` → `SCREEN_CATEGORY` (enter product name)
  - `SCREEN_CATEGORY` → `SCREEN_SUBCATEGORY` (select category)
  - `SCREEN_SUBCATEGORY` → `SCREEN_PRICE_TND` (select subcategory)
  - `SCREEN_PRICE_TND` → `SCREEN_PRICE_EUR` (enter TND prices)
  - `SCREEN_PRICE_EUR` → `SCREEN_DETAILS` (enter EUR prices)
  - `SCREEN_DETAILS` → `SCREEN_QUANTITY` (dimensions, color, size)
  - `SCREEN_QUANTITY` → `SCREEN_SUMMARY` (enter stock quantity)
  - `SCREEN_SUMMARY` → `SUCCESS` (review and submit)

### handlePhoto()
- Decimates images, converts from encrypted WhatsApp format
- Stores as base64 in cache

### handleSaveName()
- Saves product_name
- Returns category list for next screen

### handleSaveCategory()
- Saves category selection
- Returns subcategories for selection

### handleSaveSubcategory()
- Saves subcategory + breadcrumb label
- Advances to pricing screens

### handleCalculateGainTnd() / handleCalculateGainEur()
- Computes selling price: regular - commission
- EmbeddedLink calculations for real-time UI updates

### handleSubmitSummary()
- **Critical function:** Saves product to database
- **Post-save:**
  1. Update state with created_at timestamp
  2. Extract seller phone from flow token
  3. Returns SUCCESS screen

---

## auth_flowHandler.ts

Manages seller authentication workflow.

### handleAuthFlow(parsed: FlowRequest)
**Main entry point**
- **INIT:** Returns WELCOME screen
- **SIGN_IN screen:** Prompts for email/code
- **Routes:**
  - Correct credentials → SUCCESS (creates session)
  - Wrong code → ERROR (stays on SIGN_IN)
  - Session exists → ALREADY_SIGNED_IN

### handleSignIn(email, code)
- Validates email format
- Verifies code against seller record
- Creates session (24-hour expiration)
- Returns flow_token for subsequent requests

### handleForgotCode() / handleResetCode()
- Send code to email
- Verify code for password reset

---

## menu_handler.ts

Routes incoming messages to appropriate flows.

### handleIncomingMessage(phone, messageBody)
- **Purpose:** Route text responses to flow endpoints
- **Triggers:**
  - "Voir mes commandes" → Orders flow
  - "Voir mes produits" → Products flow
  - "Modifier un produit" → Update product flow
- **Checks:** Session active before sending flow
- **Session expired:** Sends auth flow instead of requested flow

---

## productsFlow_handler.ts

Displays seller's product list.

### handleProductsFlow(parsed: FlowRequest)
**Main entry point**
- **INIT:** Fetches seller's products
- **SCREEN_PRODUCTS:** Shows paginated product list with search
- **Actions:** Select product (not yet implemented)

### handleListProducts(token)
- Fetches products from database
- Paginates (page 1 by default)
- Returns carousel with product cards

### handleSearchProducts(token, query)
- Filters products by name/SKU
- Re-paginates results
- Returns filtered list

---

## ordersFlow_handler.ts

Displays seller's order history.

### handleOrdersFlow(parsed: FlowRequest)
**Main entry point**
- **INIT:** Fetches seller's orders
- **SCREEN_ORDERS:** Shows paginated order list
- **Actions:** Select order detail

### handleListOrders(token)
- Fetches orders from database
- Paginates (10 per page)
- Returns order cards (reference, customer, total, status, date)

### handleOrderDetail(orderId)
- Fetches full order information
- Shows articles, pricing breakdown, tracking status

---

## updateProductFlow_handler.ts

Manages product editing workflow.

### handleUpdateProductFlow(parsed: FlowRequest)
**Main entry point**
- **INIT:** Shows product selection screen
- **SELECT_PRODUCT:** Routes to editing screens
- **Editable fields:**
  - Name, description, pricing, categories, tags
  - Stock quantity, dimensions

### handleSelectProduct(token)
- Fetches seller's products
- Shows product picker (name + current status)

### handleUpdateField()
- Each field has dedicated screen for editing
- Similar layout to addProductFlow
- Updates sent live to database

---

## sendBatch_handler.ts

Handles batch messaging to customers.

### handleSendBatchFlow(parsed: FlowRequest)
**Main entry point**
- **Template selector:** Choose message template
- **Recipients:** Select customer list or segments
- **Preview:** Show message before sending
- **Confirm:** Send batch

---

## Common Handler Utilities

### getFlowToken(parsed)
- Extracts flow_token from FlowRequest data or top-level
- Always returns normalized string

### updateState(token, updates)
- Partial cache update (merges with existing)
- Used to persist screen-to-screen data

### normText(text)
- Trims and normalizes text input
- Removes extra whitespace

### parsePrice(input)
- Converts string price to number
- Handles "," vs "." and "TND" suffix

