import {
  NotificationCategory,
  NotificationEntityType,
  NotificationType,
} from '../../generated/prisma';
import { notificationDeliveryService } from './notificationDelivery.service';
import { NotificationInput, notificationService } from './notification.service';

interface ActorContext {
  userId?: number | null;
  username?: string | null;
}

type ChannelIntent = 'email' | 'ops_alert' | 'in_app_sync';

interface EmitNotificationInput extends NotificationInput {
  actor?: ActorContext;
  channelIntent?: ChannelIntent;
  sendToMake?: boolean;
}

const getMetadataString = (metadata: unknown, key: string) => {
  if (!metadata || typeof metadata !== 'object' || !(key in metadata)) {
    return null;
  }

  return String((metadata as Record<string, unknown>)[key]);
};

export class NotificationEventsService {
  async emit(input: EmitNotificationInput) {
    const notifications = await notificationService.createNotifications(input);

    if (notifications.length === 0) {
      return [];
    }

    if (!input.sendToMake) {
      return notifications;
    }

    await notificationDeliveryService.deliver(
      notifications.map((notification) => ({
        eventType: notification.type,
        category: notification.category,
        channelIntent: input.channelIntent ?? 'in_app_sync',
        notificationId: notification.id,
        occurredAt: notification.createdAt.toISOString(),
        recipient: {
          userId: notification.recipientUserId,
        },
        targetRoles: input.recipientRoles ?? null,
        actor: {
          userId: input.actor?.userId ?? null,
          username: input.actor?.username ?? null,
        },
        entity: {
          type: notification.sourceEntityType ?? null,
          id: notification.sourceEntityId ?? null,
        },
        message: {
          title: notification.title,
          body: notification.message,
        },
        status: getMetadataString(notification.metadata, 'status'),
        path: getMetadataString(notification.metadata, 'path'),
        requiresAttention: notification.requiresAttention,
        metadata: notification.metadata as Record<string, unknown> | null,
      })),
      input.category,
    );

    return notifications;
  }

  async notifyOrderCreated(orderId: number, customerUserId: number) {
    return this.emit({
      type: NotificationType.ORDER_CREATED,
      category: NotificationCategory.ORDERS,
      title: 'New order submitted',
      message: `Order #${orderId} is waiting for review.`,
      recipientRoles: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      sourceEntityType: NotificationEntityType.ORDER,
      sourceEntityId: orderId,
      metadata: {
        orderId,
        path: `/orders?status=PENDING`,
        label: 'Review order',
      },
      requiresAttention: true,
      channelIntent: 'ops_alert',
      sendToMake: true,
      actor: {
        userId: customerUserId,
      },
    });
  }

  async notifyOrderStatusUpdated(
    orderId: number,
    customerUserId: number,
    status: string,
    previousStatus?: string,
    actor?: ActorContext,
  ) {
    const notifications: Promise<unknown>[] = [
      this.emit({
        type: NotificationType.ORDER_STATUS_UPDATED,
        category: NotificationCategory.ORDERS,
        title: `Order #${orderId} updated`,
        message: `Your order is now ${status.replace(/_/g, ' ').toLowerCase()}.`,
        recipientUserIds: [customerUserId],
        sourceEntityType: NotificationEntityType.ORDER,
        sourceEntityId: orderId,
        metadata: {
          orderId,
          status,
          previousStatus: previousStatus ?? null,
          path: '/orders',
          label: 'View order',
        },
        requiresAttention: status === 'NOT_FULFILLING',
        channelIntent: status === 'NOT_FULFILLING' ? 'ops_alert' : 'in_app_sync',
        sendToMake: status === 'NOT_FULFILLING'
          || status === 'READY_FOR_DELIVERY'
          || status === 'OUT_FOR_DELIVERY',
        actor,
      }),
    ];

    if (status === 'READY_FOR_DELIVERY' || status === 'OUT_FOR_DELIVERY') {
      notifications.push(this.emit({
        type: NotificationType.ORDER_STATUS_UPDATED,
        category: status === 'READY_FOR_DELIVERY' ? NotificationCategory.DRIVER : NotificationCategory.DRIVER,
        title: `Order #${orderId} ${status === 'READY_FOR_DELIVERY' ? 'ready for delivery' : 'out for delivery'}`,
        message: status === 'READY_FOR_DELIVERY'
          ? `Order #${orderId} is ready to be added to a route.`
          : `Order #${orderId} is now out for delivery.`,
        recipientRoles: ['DELIVERY_DRIVER', 'MANAGEMENT', 'ADMIN'],
        sourceEntityType: NotificationEntityType.ORDER,
        sourceEntityId: orderId,
        metadata: {
          orderId,
          status,
          path: '/delivery-dashboard',
          label: 'Open delivery board',
        },
        requiresAttention: status === 'READY_FOR_DELIVERY',
        channelIntent: 'ops_alert',
        sendToMake: true,
        actor,
      }));
    }

    if (status === 'DELIVERED') {
      notifications.push(this.emit({
        type: NotificationType.ORDER_STATUS_UPDATED,
        category: NotificationCategory.ADMIN,
        title: `Order #${orderId} delivered`,
        message: `Order #${orderId} was marked delivered.`,
        recipientRoles: ['MANAGEMENT', 'ADMIN'],
        sourceEntityType: NotificationEntityType.ORDER,
        sourceEntityId: orderId,
        metadata: {
          orderId,
          status,
          previousStatus: previousStatus ?? null,
          path: '/orders',
          label: 'View order',
        },
        actor,
      }));
    }

    await Promise.all(notifications);
  }

  async notifyRegistrationSubmitted(userId: number, username: string) {
    return this.emit({
      type: NotificationType.REGISTRATION_SUBMITTED,
      category: NotificationCategory.AUTH,
      title: 'New registration pending',
      message: `${username} is waiting for approval.`,
      recipientRoles: ['MANAGEMENT', 'ADMIN'],
      sourceEntityType: NotificationEntityType.USER,
      sourceEntityId: userId,
      metadata: {
        userId,
        path: '/dashboard?section=pending-registrations',
        label: 'Review registrations',
      },
      requiresAttention: true,
      channelIntent: 'ops_alert',
      sendToMake: true,
      actor: {
        userId,
        username,
      },
    });
  }

  async notifyAccountApproved(userId: number) {
    return this.emit({
      type: NotificationType.ACCOUNT_APPROVED,
      category: NotificationCategory.AUTH,
      title: 'Account approved',
      message: 'Your account has been approved. You can continue shopping now.',
      recipientUserIds: [userId],
      sourceEntityType: NotificationEntityType.USER,
      sourceEntityId: userId,
      metadata: {
        userId,
        path: '/products',
        label: 'Browse products',
      },
      channelIntent: 'in_app_sync',
    });
  }

  async notifyAccountRejected(userId: number) {
    return this.emit({
      type: NotificationType.ACCOUNT_REJECTED,
      category: NotificationCategory.AUTH,
      title: 'Account status updated',
      message: 'Your registration status was updated. Please contact the store if you need help.',
      recipientUserIds: [userId],
      sourceEntityType: NotificationEntityType.USER,
      sourceEntityId: userId,
      metadata: {
        userId,
        path: '/help',
        label: 'Contact support',
      },
      requiresAttention: true,
      channelIntent: 'in_app_sync',
    });
  }

  async notifyContactMessageReceived(contactMessageId: number, actor: ActorContext) {
    return this.emit({
      type: NotificationType.CONTACT_MESSAGE_RECEIVED,
      category: NotificationCategory.CONTACT,
      title: 'New support message',
      message: 'A customer message needs staff attention.',
      recipientRoles: ['MANAGEMENT', 'ADMIN'],
      sourceEntityType: NotificationEntityType.CONTACT_MESSAGE,
      sourceEntityId: contactMessageId,
      metadata: {
        contactMessageId,
        path: '/dashboard?section=messages',
        label: 'Open messages',
      },
      requiresAttention: true,
      channelIntent: 'ops_alert',
      sendToMake: true,
      actor,
    });
  }

  async notifyContactReplySent(contactMessageId: number, recipientUserId: number, actor: ActorContext) {
    return this.emit({
      type: NotificationType.CONTACT_REPLY_SENT,
      category: NotificationCategory.CONTACT,
      title: 'Support replied',
      message: 'We replied to your support message.',
      recipientUserIds: [recipientUserId],
      sourceEntityType: NotificationEntityType.CONTACT_MESSAGE,
      sourceEntityId: contactMessageId,
      metadata: {
        contactMessageId,
        path: '/help',
        label: 'View support',
      },
      requiresAttention: true,
      channelIntent: 'email',
      sendToMake: true,
      actor,
    });
  }
}

export const notificationEventsService = new NotificationEventsService();
