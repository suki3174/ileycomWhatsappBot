# Filtered Table Fields Actually Used by Plugin Code

| Table | Field | Type | Usage in Plugin |
|---|---|---|---|
| wp_users | ID | BIGINT(20) | Seller/user identity joins, filters |
| wp_users | display_name | VARCHAR(250) | Seller name selection |
| wp_users | user_email | VARCHAR(100) | Seller email lookup/filter |
| wp_usermeta | user_id | BIGINT(20) | Joins to users |
| wp_usermeta | meta_key | VARCHAR(255) | Capability/phone/PIN key filtering |
| wp_usermeta | meta_value | LONGTEXT | Capability/phone/PIN value filtering |
| wp_posts | ID | BIGINT(20) | Product/order/variation IDs |
| wp_posts | post_title | TEXT | Product title read/update |
| wp_posts | post_date | DATETIME | Product ordering/created date |
| wp_posts | post_date_gmt | DATETIME | Order sorting |
| wp_posts | post_excerpt | TEXT | Product short description |
| wp_posts | post_content | LONGTEXT | Product full description |
| wp_posts | post_type | VARCHAR(20) | Product/order/variation filtering |
| wp_posts | post_status | VARCHAR(20) | Product/order status filtering |
| wp_posts | post_author | BIGINT(20) | Seller ownership checks |
| wp_posts | post_parent | BIGINT(20) | Variation parent product |
| wp_posts | menu_order | INT(11) | Variation ordering |
| wp_posts | post_name | VARCHAR(200) | Product slug update |
| wp_postmeta | post_id | BIGINT(20) | Product/variation meta joins |
| wp_postmeta | meta_key | VARCHAR(255) | Meta-key based reads/writes |
| wp_postmeta | meta_value | LONGTEXT | Meta values read/written |
| wp_term_relationships | object_id | BIGINT(20) | Product-term linking |
| wp_term_relationships | term_taxonomy_id | BIGINT(20) | Join to taxonomy |
| wp_term_taxonomy | term_taxonomy_id | BIGINT(20) | Join key |
| wp_term_taxonomy | term_id | BIGINT(20) | Join to terms |
| wp_term_taxonomy | taxonomy | VARCHAR(32) | Filter product_cat / product_tag |
| wp_term_taxonomy | parent | BIGINT(20) | Category vs subcategory split |
| wp_terms | term_id | BIGINT(20) | Join key |
| wp_terms | slug | VARCHAR(200) | Category/subcategory slug |
| wp_terms | name | VARCHAR(200) | Category/subcategory label |
| wp_cwsb_seller_state | id | BIGINT(20) | Latest-by-phone ordering (ORDER BY id DESC) |
| wp_cwsb_seller_state | user_id | BIGINT(20) | Main seller link |
| wp_cwsb_seller_state | name | VARCHAR(255) | Seller state data |
| wp_cwsb_seller_state | email | VARCHAR(255) | Seller state data |
| wp_cwsb_seller_state | phone | VARCHAR(50) | Seller lookup by phone |
| wp_cwsb_seller_state | code | VARCHAR(255) | Hashed seller PIN storage field used during PIN verification. |
| wp_cwsb_seller_state | flow_token | VARCHAR(255) | Main flow identity |
| wp_cwsb_seller_state | reset_token | VARCHAR(255) | Reset flow |
| wp_cwsb_seller_state | reset_token_expiry | BIGINT(20) | Reset expiry |
| wp_cwsb_seller_state | session_active_until | BIGINT(20) | Session lifecycle |
| wp_wc_order_product_lookup | order_id | BIGINT(20) | Seller order discovery |
| wp_wc_order_product_lookup | product_id | BIGINT(20) | Seller product-based order filter |
| wp_woocommerce_order_items | order_id | BIGINT(20) | Fallback order lookup (without lookup table) |
| wp_woocommerce_order_items | order_item_id | BIGINT(20) | Join to item meta |
| wp_woocommerce_order_items | order_item_type | VARCHAR(200) | Filter line items |
| wp_woocommerce_order_itemmeta | order_item_id | BIGINT(20) | Join to order items |
| wp_woocommerce_order_itemmeta | meta_key | VARCHAR(255) | Filter _product_id |
| wp_woocommerce_order_itemmeta | meta_value | LONGTEXT | Product id value |

## Meta Key Table and Definitions

| Scope | Meta Key | Type | Definition |
|---|---|---|---|
| wp_postmeta | _sku | VARCHAR(255) | Product stock keeping unit identifier. |
| wp_postmeta | _price | DECIMAL as string | Effective display/sale price used by WooCommerce pricing logic. |
| wp_postmeta | _regular_price | DECIMAL as string | Base regular EUR price before discounts. |
| wp_postmeta | _sale_price | DECIMAL as string | Discounted EUR price when promotion is active. |
| wp_postmeta | _regular_price_tnd | DECIMAL as string | Base regular price in TND (custom multi-currency field). |
| wp_postmeta | _sale_price_tnd | DECIMAL as string | Discounted price in TND (custom multi-currency field). |
| wp_postmeta | _price_tnd | DECIMAL as string | Effective TND price used for display/business logic. |
| wp_postmeta | _stock | INT as string | Current stock quantity. |
| wp_postmeta | _manage_stock | yes/no string | Enables stock management behavior for the product. |
| wp_postmeta | _stock_status | enum-like string | Availability state, typically instock or outofstock. |
| wp_postmeta | _thumbnail_id | BIGINT(20) as string | Attachment ID of the main product image. |
| wp_postmeta | _product_image_gallery | CSV of BIGINT IDs | Comma-separated attachment IDs for gallery images. |
| wp_postmeta | _length | VARCHAR/DECIMAL as string | Product length dimension value. |
| wp_postmeta | _width | VARCHAR/DECIMAL as string | Product width dimension value. |
| wp_postmeta | _height | VARCHAR/DECIMAL as string | Product height dimension value. |
| wp_postmeta | _weight | VARCHAR/DECIMAL as string | Product weight value. |
| wp_postmeta | _cwsb_dim_unit | VARCHAR | Custom dimension unit (for example cm). |
| wp_postmeta | _cwsb_weight_unit | VARCHAR | Custom weight unit (for example kg). |
| wp_postmeta | _cwsb_color | VARCHAR | Custom color attribute captured by the bot flow. |
| wp_postmeta | _cwsb_size | VARCHAR | Custom size attribute captured by the bot flow. |
| wp_postmeta | _cwsb_category_label | VARCHAR | Human-readable category label stored by the flow. |
| wp_postmeta | _cwsb_subcategory_label | VARCHAR | Human-readable subcategory label stored by the flow. |
| wp_postmeta | _cwsb_idempotency_key | VARCHAR | Deduplication key to prevent duplicate product creation. |
| wp_postmeta | attribute_% | Dynamic meta key pattern | Variation attributes loaded by LIKE filter (for example attribute_pa_color). |
| wp_woocommerce_order_itemmeta | _product_id | BIGINT(20) as string | Product ID linked to a WooCommerce order line item. |
| wp_usermeta | billing_phone | VARCHAR as LONGTEXT payload | Billing phone number for user/vendor identity resolution. |
| wp_usermeta | phone | VARCHAR as LONGTEXT payload | Generic user phone number fallback key. |
| wp_usermeta | wcfm_phone | VARCHAR as LONGTEXT payload | WCFM vendor phone number key. |
| wp_cwsb_seller_state | code | Password hash string | Hashed seller PIN used for PIN verification flow. |
| wp_usermeta | <wp_prefix>capabilities | Serialized array in LONGTEXT | Core role/capability map that defines user permissions. |


