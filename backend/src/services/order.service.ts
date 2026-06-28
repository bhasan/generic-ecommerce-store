import { OrderCrudService, CreateOrderData, AddOrderItemData } from './order.crud.service';
import { OrderFulfillmentService, UpdateOrderStatusData, PrintOrderReceiptData } from './order.fulfillment.service';
import { OrderPaymentService } from './order.payment.service';
import { RoleName } from '../constants/roles';

const crud = new OrderCrudService();
const fulfillment = new OrderFulfillmentService();
const payment = new OrderPaymentService();

export class OrderService {
  getAllOrders = (userId: number, userRoles: RoleName[], limit?: number, offset?: number) =>
    crud.getAllOrders(userId, userRoles, limit, offset);

  getDeliveredOrders = () =>
    crud.getDeliveredOrders();

  getOutForDeliveryOrders = () =>
    crud.getOutForDeliveryOrders();

  getReadyForDeliveryOrders = () =>
    crud.getReadyForDeliveryOrders();

  getOrderById = (orderId: number, userId: number, userRoles: RoleName[]) =>
    crud.getOrderById(orderId, userId, userRoles);

  createOrder = (data: CreateOrderData) =>
    crud.createOrder(data);

  addItemToOrder = (orderId: number, data: AddOrderItemData) =>
    crud.addItemToOrder(orderId, data);

  voidOrderItem = (orderId: number, itemId: number) =>
    crud.voidOrderItem(orderId, itemId);

  deleteOrderItem = (orderId: number, itemId: number) =>
    crud.deleteOrderItem(orderId, itemId);

  deleteOrder = (orderId: number, requesterId: number | null) =>
    crud.deleteOrder(orderId, requesterId);

  updateOrderStatus = (orderId: number, data: UpdateOrderStatusData, userRoles?: RoleName[]) =>
    fulfillment.updateOrderStatus(orderId, data, userRoles);

  printOrderReceipt = (orderId: number, data?: PrintOrderReceiptData) =>
    fulfillment.printOrderReceipt(orderId, data);

  customerArrive = (orderId: number, userId: number, parkingSpot: string) =>
    fulfillment.customerArrive(orderId, userId, parkingSpot);

  getPaymentToken = (orderId: number, userId: number) =>
    payment.getPaymentToken(orderId, userId);

  confirmCardPayment = (orderId: number, userId: number, transId: string) =>
    payment.confirmCardPayment(orderId, userId, transId);
}

export default new OrderService();
