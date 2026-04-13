import {
  NotificationCategory,
  NotificationDeliveryStatus,
  NotificationEntityType,
  NotificationType,
  OrderStatus,
} from '../../generated/prisma';
import { RoleName, ROLES } from '../constants/roles';
import { notificationDeliveryService } from './notificationDelivery.service';
import { NotificationInput, notificationService } from './notification.service';
import { NotificationEmailRouting, StoreSettingsService } from './storeSettings.service';

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

  const value = (metadata as Record<string, unknown>)[key];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return String(value);
};

const resolveEmailDestination = (metadata: Record<string, unknown> | null): string | null => {
  if (!metadata) return null;

  const userEmail = getMetadataString(metadata, 'userEmail');
  const toEmail = getMetadataString(metadata, 'toEmail');
  return userEmail || toEmail || null;
};

const resolveOpsDestination = (metadata: Record<string, unknown> | null): string | null => {
  if (!metadata) return null;
  return getMetadataString(metadata, 'destinationEmail');
};

const ROLE_PRIORITY: RoleName[] = [
  ROLES.ADMIN,
  ROLES.MANAGEMENT,
  ROLES.EMPLOYEE,
  ROLES.DELIVERY_DRIVER,
  ROLES.VIP,
  ROLES.CUSTOMER,
  ROLES.GUEST,
];

const pickRecipientRole = (recipientRoles: RoleName[], targetRoles: RoleName[]) => {
  const targetRoleSet = new Set(targetRoles);
  for (const role of ROLE_PRIORITY) {
    if (targetRoleSet.has(role) && recipientRoles.includes(role)) {
      return role;
    }
  }

  return recipientRoles.find((role) => targetRoleSet.has(role)) ?? null;
};

const resolveOpsDestinationEmail = (
  recipientRole: RoleName | null,
  notificationEmails: NotificationEmailRouting,
) => {
  if (!recipientRole) return null;

  if (recipientRole === ROLES.ADMIN) return notificationEmails.adminEmail || null;
  if (recipientRole === ROLES.MANAGEMENT) return notificationEmails.managementEmail || null;
  if (recipientRole === ROLES.EMPLOYEE) return notificationEmails.employeeEmail || null;
  return null;
};

const storeSettingsService = new StoreSettingsService();

export class NotificationEventsService {
  async emit(input: EmitNotificationInput) {
    const notifications = await notificationService.createNotifications(input);

    if (notifications.length === 0) {
      return [];
    }

    if (!input.sendToMake) {
      return notifications;
    }

    const deliveryPayloads = notifications.map((notification) => ({
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
      }));

    const targetRoles = input.recipientRoles ?? [];
    const notificationEmailRouting = await storeSettingsService.getNotificationEmailRouting();
    const opsAlertRecipientIds = [...new Set(
      deliveryPayloads
        .filter((payload) => payload.channelIntent === 'ops_alert')
        .map((payload) => payload.recipient.userId),
    )];
    const recipientRolesByUser = await notificationService.getRecipientRolesForUsers(
      opsAlertRecipientIds,
      targetRoles,
    );
    const routedPayloads = deliveryPayloads.map((payload) => {
      if (payload.channelIntent !== 'ops_alert') return payload;

      const recipientRoles = recipientRolesByUser.get(payload.recipient.userId) ?? [];
      const recipientRole = pickRecipientRole(recipientRoles, targetRoles);
      const destinationEmail = resolveOpsDestinationEmail(recipientRole, notificationEmailRouting);
      return {
        ...payload,
        metadata: {
          ...(payload.metadata ?? {}),
          recipientRole,
          destinationEmail,
        },
      };
    });

    // Only forward email-intent payloads when a concrete destination address exists.
    // This keeps Make routing predictable and marks unroutable rows as DISABLED instead
    // of pushing ambiguous payloads into fallback branches.
    const deliverablePayloads = routedPayloads.filter((payload) => {
      if (payload.channelIntent === 'email') {
        return Boolean(resolveEmailDestination(payload.metadata ?? null));
      }
      if (payload.channelIntent === 'ops_alert') {
        return Boolean(resolveOpsDestination(payload.metadata ?? null));
      }
      return true;
    });

    const skippedPayloads = routedPayloads.filter((payload) => !deliverablePayloads.includes(payload));
    if (skippedPayloads.length > 0) {
      await notificationService.updateDeliveryStatus(
        skippedPayloads.map((payload) => payload.notificationId),
        NotificationDeliveryStatus.DISABLED,
      );
    }

    if (deliverablePayloads.length > 0) {
      await notificationDeliveryService.deliver(deliverablePayloads, input.category);
    }

    return notifications;
  }

  async notifyOrderCreated(orderId: number, customerUserId: number) {
    return this.emit({
      type: NotificationType.ORDER_CREATED,
      category: NotificationCategory.ORDERS,
      title: 'New order submitted',
      message: `Order #${orderId} is waiting for review.`,
      recipientRoles: [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN],
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
        requiresAttention: status === OrderStatus.NOT_FULFILLING,
        channelIntent: status === OrderStatus.NOT_FULFILLING ? 'ops_alert' : 'in_app_sync',
        sendToMake: status === OrderStatus.NOT_FULFILLING
          || status === OrderStatus.READY_FOR_DELIVERY
          || status === OrderStatus.OUT_FOR_DELIVERY,
        actor,
      }),
    ];

    if (status === OrderStatus.READY_FOR_DELIVERY || status === OrderStatus.OUT_FOR_DELIVERY) {
      notifications.push(this.emit({
        type: NotificationType.ORDER_STATUS_UPDATED,
        category: status === OrderStatus.READY_FOR_DELIVERY ? NotificationCategory.DRIVER : NotificationCategory.DRIVER,
        title: `Order #${orderId} ${status === OrderStatus.READY_FOR_DELIVERY ? 'ready for delivery' : 'out for delivery'}`,
        message: status === OrderStatus.READY_FOR_DELIVERY
          ? `Order #${orderId} is ready to be added to a route.`
          : `Order #${orderId} is now out for delivery.`,
        recipientRoles: [ROLES.DELIVERY_DRIVER, ROLES.MANAGEMENT, ROLES.ADMIN],
        sourceEntityType: NotificationEntityType.ORDER,
        sourceEntityId: orderId,
        metadata: {
          orderId,
          status,
          path: '/delivery-dashboard',
          label: 'Open delivery board',
        },
        requiresAttention: status === OrderStatus.READY_FOR_DELIVERY,
        channelIntent: 'ops_alert',
        sendToMake: true,
        actor,
      }));
    }

    if (status === OrderStatus.DELIVERED) {
      notifications.push(this.emit({
        type: NotificationType.ORDER_STATUS_UPDATED,
        category: NotificationCategory.ADMIN,
        title: `Order #${orderId} delivered`,
        message: `Order #${orderId} was marked delivered.`,
        recipientRoles: [ROLES.MANAGEMENT, ROLES.ADMIN],
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
      recipientRoles: [ROLES.MANAGEMENT, ROLES.ADMIN],
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
      recipientRoles: [ROLES.MANAGEMENT, ROLES.ADMIN],
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
    // Keep CONTACT_REPLY_SENT as an in-app notification only. The actual customer
    // outbound email is sent via emailService.sendReplyEmail in contact.controller,
    // which carries the destination email directly from the contact message record.
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
      channelIntent: 'in_app_sync',
      sendToMake: false,
      actor,
    });
  }
}

export const notificationEventsService = new NotificationEventsService();
