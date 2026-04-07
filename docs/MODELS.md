# Data Models Documentation

All TypeScript interfaces and enums used throughout the application.

---

## product_model.ts

Product and product creation state models.

### ProductType (Enum)
Product variety types:
- `SIMPLE` - Single product (one price, one stock)
- `VARIABLE` - Multiple variants (different sizes/weights with separate pricing)

### Product (Interface)
Complete product information:
- `id, name, sku, created_at` - Basic info
- `type: ProductType` - Product kind
- `short_description, full_description` - Descriptions
- `categories[], tags[]` - Classification
- `image_src, image_gallery?` - Product images
- `general_price_euro?, promo_price_euro?` - EUR pricing (simple products)
- `general_price_tnd?, promo_price_tnd?` - TND pricing (simple products)
- `stock_quantity?, manage_stock` - Stock info (simple)
- `variations?: ProductVariation[]` - Multiple variants (variable products)
- `is_variable: boolean` - Flag for variable status

### ProductVariation (Interface)
Single variant of a variable product:
- `id, sku, title` - Variant identification
- `stock, stock_status, manage_stock` - Stock info
- `attributes` - Variant options (weight, size, etc.)
- `price_euro, price_tnd` - Variant pricing
- `image_src` - Variant image

### AddProductState (Interface)
State object for the add product flow (persisted in cache):
- `images?: string[]` - Product images in base64
- `product_name?: string` - Product name entered
- `product_category?, product_category_label?` - Selected category
- `product_subcategory?, product_subcategory_label?` - Selected subcategory
- `prix_regulier_tnd?, prix_promo_tnd?` - TND pricing
- `prix_regulier_eur?, prix_promo_eur?` - EUR pricing
- `longueur?, largeur?, profondeur?` - Dimensions
- `unite_dimension?` - Dimension unit (cm, mm, etc.)
- `valeur_poids?, unite_poids` - Weight and unit
- `couleur?, taille` - Color and size
- `quantite?` - Stock quantity
- `created_at?: string` - Creation date (FR format)
- `categories?, subcategories?` - Cached category lists
- `submitted_at?, product_id?` - Submission tracking

---

## seller_model.ts

Seller/User account information.

### Seller (Interface)
Seller profile:
- `name: string` - Seller name
- `email: string` - Email address
- `code: string | null` - Authentication code
- `phone: string` - Phone number (primary identifier)
- `flow_token: string | null` - WhatsApp Flow token
- `reset_token?: string | null` - Password reset token
- `session_active_until?: number` - Session expiration timestamp

---

## oder_model.ts

Order tracking and management models.

### OrderStatus (Enum)
Order fulfillment states:
- `COMPLETED` - Order delivered
- `IN_DELIVERY` - Order in transit
- `TO_DELIVER` - Order awaiting shipment

### OrderArticle (Interface)
Single item in an order:
- `id, sku` - Article identifiers
- `name` - Product name
- `quantity` - Units ordered
- `price` - Unit price
- `currency` - Price currency (XOF, etc.)
- `image` - Product photo

### Order (Interface)
Complete order information:
- `id, reference` - Order identifiers
- `customer_name, created_at` - Customer and timestamp
- `total, subtotal, shipping_cost` - Pricing breakdown
- `currency` - Currency code
- `status: OrderStatus` - Fulfillment state
- `tags?` - Order labels
- `payment_method, transaction_id` - Payment info
- `customer_note` - Customer notes
- `articles: OrderArticle[]` - Ordered items
- `billing_info, shipping_info` - Addresses
- `articles_count?` - Item count

---

## category_model.ts

Product categorization models.

### ProductCategory (Interface)
Category information:
- `id: string` - Category identifier
- `title: string` - Display name

### SubCategory (Interface, extends ProductCategory)
Category subdivision:
- Inherits `id, title`
- `parentId?: string` - Parent category ID
- `description?: string` - Breadcrumb path (e.g., "Mode & Vêtements > Robes")

---

## flowRequest.ts

WhatsApp Flow incoming request structure.

### FlowRequest (Interface)
Payload from WhatsApp Flow client:
- `action?: string` - User action (INIT, DATA_EXCHANGE, etc.)
- `screen?: string` - Current screen name
- `data?: Record<string, any>` - Screen field values
- `flow_token?: string` - Session token
- `version?: string` - Flow version

---

## flowResponse.ts

WhatsApp Flow outgoing response structure.

### FlowResponse (Interface)
Payload sent back to WhatsApp Flow client:
- `screen: string` - Next screen to show
- `data: Record<string, any>` - Data to populate screen fields

---

## sendResult.ts

Result of sending a WhatsApp message.

### SendResult (Type)
State of a message send operation:
- `seller: string` - Seller identifier
- `recipient: string` - Message recipient (phone)
- `status?: number` - HTTP status code
- `data?: unknown` - Response data from Meta API
- `error?: string` - Error description if failed
