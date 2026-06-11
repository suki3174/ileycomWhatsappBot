# updateProductFlow Metadata

This file stores project-side metadata for updateProductFlow.

## Source of Truth

- Handler: [src/handlers/seller/updateProductFlow_handler.ts](src/handlers/seller/updateProductFlow_handler.ts)
- Meta route: [src/app/api/seller/updateProductFlow/meta_endpoint/route.ts](src/app/api/seller/updateProductFlow/meta_endpoint/route.ts)
- Send route: [src/app/api/seller/updateProductFlow/send/route.ts](src/app/api/seller/updateProductFlow/send/route.ts)
- Service: [src/services/update_product_service.ts](src/services/update_product_service.ts)
- Cache service: [src/services/cache/update_product_cache_service.ts](src/services/cache/update_product_cache_service.ts)
- State cache: [src/repositories/updateProduct/update_product_cache.ts](src/repositories/updateProduct/update_product_cache.ts)
- Repository: [src/repositories/updateProduct/update_product_repo.ts](src/repositories/updateProduct/update_product_repo.ts)
- Product renderer utility: [src/utils/product_flow_renderer.ts](src/utils/product_flow_renderer.ts)
- Image processor: [src/utils/image_processor.ts](src/utils/image_processor.ts)

## Notes

- WhatsApp template name: modify_product_flow_local.
- Flow starts at WELCOME and transitions to PRODUCT_LIST on data_exchange cmd=load_products.
- Product list is paginated using shared renderer output then remapped to cmd=load_product_for_edit.
- Edit journey supports photos, product info, category/subcategory, and summary submit.
- Plugin update submission is sent through updateProductNow with duplicate-submit guard via submit_status.
- Auth failures return WELCOME with error_msg/error_message and trigger auth fallback sendAuthFlowOnce.
- Success path invalidates seller products list cache and sends menu message.
