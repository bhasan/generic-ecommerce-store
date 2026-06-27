import eventBus from '../services/event-bus.service';
import { notificationEventsService } from '../services/notificationEvents.service';
import { thermalPrinterService } from '../services/thermalPrinter.service';
import { logger } from '../utils/logger';

// Subscribe notifications to order creation
eventBus.subscribe('order.placed', 'OrderCreatedNotification', async ({ orderId, userId }) => {
  logger.info('Subscriber handling order.placed for notification', { orderId, userId });
  await notificationEventsService.notifyOrderCreated(orderId, userId);
});

// Subscribe printer dispatcher to order creation
eventBus.subscribe('order.placed', 'OrderCreatedReceiptPrint', async ({ orderId, userId }) => {
  logger.info('Subscriber handling order.placed for printing', { orderId, userId });
  try {
    await thermalPrinterService.dispatchReceipt(orderId, 'ORDER_CREATED', { userId });
  } catch (printerError) {
    logger.error('Thermal printer dispatch threw unexpectedly after order creation event', printerError, { orderId, userId });
  }
});

// Subscribe notifications to order status updates
eventBus.subscribe('order.status_changed', 'OrderStatusChangedNotification', async ({ orderId, userId, newStatus, previousStatus }) => {
  logger.info('Subscriber handling order.status_changed for status update notification', { orderId, userId, newStatus, previousStatus });
  await notificationEventsService.notifyOrderStatusUpdated(orderId, userId, newStatus, previousStatus);
});
