# ordersFlow Metadata

This file stores project-side metadata that cannot exist in Meta Flow JSON.

## Source of Truth

- Handler: [src/handlers/seller/ordersFlow_handler.ts](src/handlers/seller/ordersFlow_handler.ts)
- Meta route: [src/app/api/seller/ordersFlow/meta_endpoint/route.ts](src/app/api/seller/ordersFlow/meta_endpoint/route.ts)
- Send route: [src/app/api/seller/ordersFlow/send/route.ts](src/app/api/seller/ordersFlow/send/route.ts)
- Service: [src/services/order_service.ts](src/services/order_service.ts)
- Cache service: [src/services/cache/orders_cache_service.ts](src/services/cache/orders_cache_service.ts)
- Repository: [src/repositories/orders/order_repo.ts](src/repositories/orders/order_repo.ts)
- Renderer: [src/utils/order_flow_renderer.ts](src/utils/order_flow_renderer.ts)

## Notes

- ordersFlow runtime already exists; this folder is currently empty and needs the same artifact set used for authFlow and productsFlow.
- The send route uses the WhatsApp template name `ordersflow` with French language code.
- The runtime supports status filtering, order list pagination, order detail lookup, and order article paging from the handler/service/repository stack.
