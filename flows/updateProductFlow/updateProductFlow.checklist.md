# updateProductFlow Validation Checklist

## Contract Alignment (JSON vs Runtime)

- [ ] Screen IDs match handler outputs:
  - WELCOME
  - PRODUCT_LIST
  - SCREEN_PHOTOS
  - SCREEN_EDIT_PHOTOS
  - SCREEN_EDIT_INFO
  - SCREEN_CATEGORY_INFO
  - SCREEN_EDIT_CATEGORY
  - SCREEN_EDIT_SUBCATEGORY
  - SCREEN_SUMMARY
  - SUCCESS
- [ ] routing_model matches transitions in handleUpdateProductFlow.
- [ ] WELCOME routes load_products into PRODUCT_LIST.
- [ ] PRODUCT_LIST handles paginate/load_products/details/load_product_for_edit commands.
- [ ] SCREEN_PHOTOS handles go_edit_photos and skip_photos.
- [ ] SCREEN_EDIT_PHOTOS handles save_photos.
- [ ] SCREEN_EDIT_INFO submit (no explicit cmd) routes to save-and-continue.
- [ ] SCREEN_CATEGORY_INFO handles go_edit_category and skip_category.
- [ ] SCREEN_EDIT_CATEGORY handles load_subcategories or footer submit.
- [ ] SCREEN_EDIT_SUBCATEGORY footer submit routes to summary.
- [ ] SCREEN_SUMMARY submit_update routes to SUCCESS or returns with error_message.
- [ ] Auth failure routes to WELCOME with error message.
- [ ] Duplicate-submit guard is active at SCREEN_SUMMARY.

## Gate A: Build

- [ ] pnpm build passes.

## Gate B: Endpoint Smoke

- [ ] GET /api/seller/updateProductFlow/meta_endpoint returns 200 and "Update product flow endpoint active".
- [ ] POST /api/seller/updateProductFlow/meta_endpoint malformed body returns 421.
- [ ] POST /api/seller/updateProductFlow/send with missing seller body returns 400.
- [ ] POST /api/seller/updateProductFlow/send with unauthenticated seller returns 401 and triggers auth guard.

## Gate C: Manual Flow Run (BLOCKED until template approval)

- [ ] Template modify_product_flow_local confirmed approved and active.
- [ ] WELCOME opens from WhatsApp template trigger.
- [ ] PRODUCT_LIST shows products and pagination works.
- [ ] Loading one product opens SCREEN_PHOTOS with current media.
- [ ] SCREEN_EDIT_PHOTOS save updates draft photos and returns edit info.
- [ ] SCREEN_EDIT_INFO validation blocks invalid TND/promo combinations.
- [ ] SCREEN_EDIT_CATEGORY and SCREEN_EDIT_SUBCATEGORY persist selected values.
- [ ] SCREEN_SUMMARY submit sends update and opens SUCCESS.
- [ ] Auth/session-expired scenario redirects to WELCOME with message.
- [ ] Updated product values are visible in WooCommerce backend.

## Final Verdict

- [ ] PASS
