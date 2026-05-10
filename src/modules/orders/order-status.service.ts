import { orderRepository } from "../data/repositories.js";

export class OrderStatusService {
  async update(orderId: string, status: string, note?: string) {
    return orderRepository.updateStatus(orderId, status, note);
  }
}

export const orderStatusService = new OrderStatusService();
