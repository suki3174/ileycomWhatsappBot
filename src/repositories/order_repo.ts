import { MOCK_ORDERS, type Order, type OrderArticle, OrderStatus } from "@/models/oder_model";
import { normToken } from "@/utils/utilities";

export async function findOrdersBySellerFlowToken(
  flowToken: string,
): Promise<Order[]> {
  const token = normToken(flowToken);
  if (!token) return [];
  // Mock implementation: return all orders for any valid token
  return MOCK_ORDERS;
}

export async function findOrderById(
  orderId: string,
): Promise<Order | undefined> {
  return MOCK_ORDERS.find((o) => String(o.id) === String(orderId));
}

export async function findOrderArticlesByOrderId(
  orderId: string,
): Promise<OrderArticle[]> {
  const order = await findOrderById(orderId);
  return order?.articles ?? [];
}

export function filterOrdersByStatus(
  orders: Order[],
  statusFilter: string,
): Order[] {
  if (!statusFilter || statusFilter === "all") return orders;
  if (statusFilter === OrderStatus.COMPLETED) {
    return orders.filter((o) => o.status === OrderStatus.COMPLETED);
  }
  if (statusFilter === OrderStatus.IN_DELIVERY) {
    return orders.filter((o) => o.status === OrderStatus.IN_DELIVERY);
  }
  if (statusFilter === OrderStatus.TO_DELIVER) {
    return orders.filter((o) => o.status === OrderStatus.TO_DELIVER);
  }
  return orders;
}

