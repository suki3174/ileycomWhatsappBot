# addProductFlow Metadata

This file stores project-side metadata for addProductFlow.

## Source of Truth

- Handler: [src/handlers/seller/addProductFlow_handler.ts](src/handlers/seller/addProductFlow_handler.ts)
- Meta route: [src/app/api/seller/addProductFlow/meta_endpoint/route.ts](src/app/api/seller/addProductFlow/meta_endpoint/route.ts)
- Send route: [src/app/api/seller/addProductFlow/send/route.ts](src/app/api/seller/addProductFlow/send/route.ts)
- Service: [src/services/add_product_service.ts](src/services/add_product_service.ts)
- Cache service: [src/services/cache/add_product_cache_service.ts](src/services/cache/add_product_cache_service.ts)
- State cache: [src/repositories/addProduct/add_product_cache.ts](src/repositories/addProduct/add_product_cache.ts)
- Repository: [src/repositories/addProduct/add_product_repo.ts](src/repositories/addProduct/add_product_repo.ts)
- Category repo: [src/repositories/addProduct/product_category_repo.ts](src/repositories/addProduct/product_category_repo.ts)
- Pricing repo: [src/repositories/addProduct/pricing_repo.ts](src/repositories/addProduct/pricing_repo.ts)
- Image processor: [src/utils/image_processor.ts](src/utils/image_processor.ts)

## Notes

- WhatsApp template name: `addproductflow_message_template` — French, status: pending review.
- Photo upload uses WhatsApp Media encryption (`decryptWhatsAppMedia`) — requires real device for manual test.
- Product creation calls plugin `/seller/product/create/by-flow-token` via `persistDraftProduct`.
- After successful creation, AI optimization is triggered fire-and-forget via `triggerProductOptimization`.
- Categories/subcategories have hardcoded fallbacks (`DEFAULT_CATEGORIES`, `DEFAULT_SUBCATEGORIES`) in case plugin is unavailable.
- Duplicate-submit guard is implemented at SCREEN_SUMMARY level using `submit_status` state key.
- No dedicated renderer file; all payload shaping is inline in handler screen functions.
