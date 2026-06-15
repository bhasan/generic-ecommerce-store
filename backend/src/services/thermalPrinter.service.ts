import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { printJobService } from './printJob.service';
import { StoreSettingsService } from './storeSettings.service';

export type ReceiptDispatchReason = 'ORDER_CREATED' | 'MANUAL_REPRINT';

const STAFF_TICKET_WIDTH = 42;
const STAFF_TICKET_TEMPLATE = 'STAFF_TICKET';

interface ReceiptActor {
  userId?: number | null;
  username?: string | null;
}

interface ReceiptOrderSnapshot {
  id: number;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  deliveryMethod: string;
  paymentMethod: string;
  deliveryAddress: string | null;
  vehicleDescription: string | null;
  customer: {
    id: number;
    username: string;
    phoneNumber: string | null;
    address: string | null;
  };
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    categoryName: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    voided: boolean;
    addedAfterSubmission: boolean;
  }>;
}

const STORE_NAME_TTL_MS = 5 * 60 * 1000;
let _cachedStoreName: string | null = null;
let _storeNameCacheExpiresAt = 0;

export function invalidateStoreNameCache(): void {
  _cachedStoreName = null;
}

export class ThermalPrinterService {
  private async getStoreName(): Promise<string> {
    const envName = process.env.THERMAL_PRINTER_STORE_NAME;
    if (envName) return envName;
    const now = Date.now();
    if (_cachedStoreName !== null && now < _storeNameCacheExpiresAt) {
      return _cachedStoreName;
    }
    const settings = await new StoreSettingsService().getStoreSettings();
    _cachedStoreName = settings.name || 'Store';
    _storeNameCacheExpiresAt = now + STORE_NAME_TTL_MS;
    return _cachedStoreName;
  }

  isConfigured() {
    return true;
  }

  async dispatchReceipt(orderId: number, reason: ReceiptDispatchReason, actor?: ReceiptActor) {
    const snapshot = await this.buildReceiptOrderSnapshot(orderId);
    const payload = await this.buildPayload(snapshot, reason, actor);

    const job = await printJobService.createPrintJob({
      orderId,
      reason,
      payload,
    });

    logger.info('Thermal printer receipt queued', {
      orderId,
      reason,
      printJobId: job.id,
      itemCount: snapshot.items.length,
    });

    return {
      queued: true,
      reason,
      orderId,
    };
  }

  private async buildPayload(snapshot: ReceiptOrderSnapshot, reason: ReceiptDispatchReason, actor?: ReceiptActor) {
    const receiptText = await this.buildStaffTicketText(snapshot, reason);

    return {
      eventType: 'ORDER_RECEIPT_PRINT_REQUESTED',
      source: 'smoke-station-delivery',
      requestedAt: new Date().toISOString(),
      reason,
      actor: {
        userId: actor?.userId ?? null,
        username: actor?.username ?? null,
      },
      printer: {
        storeName: await this.getStoreName(),
        format: 'text/plain',
        width: STAFF_TICKET_WIDTH,
      },
      order: snapshot,
      receipt: {
        templateType: STAFF_TICKET_TEMPLATE,
        text: receiptText,
        lineCount: receiptText.split('\n').length,
      },
    };
  }

  private async buildStaffTicketText(snapshot: ReceiptOrderSnapshot, reason: ReceiptDispatchReason) {
    const divider = '-'.repeat(STAFF_TICKET_WIDTH);
    const strongDivider = '='.repeat(STAFF_TICKET_WIDTH);
    const createdLabel = new Date(snapshot.createdAt).toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const isDelivery = snapshot.deliveryMethod === 'DELIVERY';
    const isCurbside = snapshot.deliveryMethod === 'CURBSIDE';
    const methodText = isDelivery 
      ? '*** DELIVERY ***' 
      : isCurbside 
        ? '*** CURBSIDE PICKUP ***' 
        : '*** PICKUP ***';

    const storeName = await this.getStoreName();
    const lines = [
      this.centerText(storeName.toUpperCase()),
      this.centerText(reason === 'MANUAL_REPRINT' ? 'REPRINT' : 'NEW ORDER'),
      strongDivider,
      `ORDER #${snapshot.id}`,
      `CREATED ${createdLabel}`,
      strongDivider,
      this.centerText(methodText),
    ];

    if (isDelivery) {
      lines.push('');
      lines.push(divider);
      lines.push('DELIVERY ADDRESS');
      if (snapshot.deliveryAddress) {
        lines.push(...this.wrapText(snapshot.deliveryAddress.toUpperCase()));
      } else {
        lines.push('ADDRESS NOT PROVIDED');
      }
      lines.push(divider);
    } else if (isCurbside) {
      lines.push('');
      lines.push(divider);
      lines.push('CURBSIDE VEHICLE INFO');
      const vehicleText = snapshot.vehicleDescription || snapshot.deliveryAddress;
      if (vehicleText) {
        lines.push(...this.wrapText(vehicleText.toUpperCase()));
      } else {
        lines.push('VEHICLE INFO NOT PROVIDED');
      }
      lines.push(divider);
    }

    lines.push('');
    lines.push(`CUSTOMER ${snapshot.customer.username}`);
    if (snapshot.customer.phoneNumber) {
      lines.push(`PHONE ${snapshot.customer.phoneNumber}`);
    }

    lines.push('');
    lines.push('ITEMS');
    lines.push(divider);

    const printableItems = snapshot.items.filter((item) => !item.voided);
    printableItems.forEach((item) => {
      const itemNameLines = this.wrapText(item.productName.toUpperCase());
      lines.push(...itemNameLines);

      if (item.addedAfterSubmission) {
        lines.push('[ADDED LATER]');
      }

      lines.push(...this.wrapText(`${this.formatQuantity(item.quantity)} x $${item.unitPrice.toFixed(2)} = $${item.lineTotal.toFixed(2)}`));
      lines.push(divider);
    });

    if (printableItems.length === 0) {
      lines.push('NO ACTIVE ITEMS');
      lines.push(divider);
    }

    lines.push(this.alignAmount('TOTAL', snapshot.total));
    lines.push('');

    return lines.join('\n');
  }

  private centerText(value: string) {
    if (value.length >= STAFF_TICKET_WIDTH) return value;
    const totalPadding = STAFF_TICKET_WIDTH - value.length;
    const leftPadding = Math.floor(totalPadding / 2);
    return `${' '.repeat(leftPadding)}${value}`;
  }

  private wrapText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return [''];

    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (word.length > STAFF_TICKET_WIDTH) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }

        let remaining = word;
        while (remaining.length > STAFF_TICKET_WIDTH) {
          lines.push(remaining.slice(0, STAFF_TICKET_WIDTH));
          remaining = remaining.slice(STAFF_TICKET_WIDTH);
        }
        currentLine = remaining;
        continue;
      }

      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length > STAFF_TICKET_WIDTH) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private alignAmount(label: string, amount: number) {
    const right = `$${amount.toFixed(2)}`;
    const left = label.toUpperCase();
    const spaces = Math.max(1, STAFF_TICKET_WIDTH - left.length - right.length);
    return `${left}${' '.repeat(spaces)}${right}`;
  }

  private formatQuantity(quantity: number) {
    return Number.isInteger(quantity) ? `${quantity}` : `${quantity}`;
  }

  private async buildReceiptOrderSnapshot(orderId: number): Promise<ReceiptOrderSnapshot> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const [customer, orderItems] = await Promise.all([
      prisma.user.findUnique({
        where: { id: order.userId },
        select: {
          id: true,
          username: true,
          phoneNumber: true,
          address: true,
        },
      }),
      prisma.orderItem.findMany({
        where: { orderId },
      }),
    ]);

    if (!customer) {
      throw new AppError('Customer not found for order receipt', 404);
    }

    const products = orderItems.length > 0
      ? await prisma.productItem.findMany({
          where: {
            id: { in: [...new Set(orderItems.map((item) => item.productId))] },
          },
          include: {
            category: true,
          },
        })
      : [];

    const productMap = new Map(products.map((product) => [product.id, product]));

    return {
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      deliveryAddress: order.deliveryAddress || customer.address || null,
      vehicleDescription: order.vehicleDescription || null,
      customer,
      items: orderItems.map((item) => {
        const product = productMap.get(item.productId);
        return {
          id: item.id,
          productId: item.productId,
          productName: product?.name || `Product #${item.productId}`,
          categoryName: product?.category?.name || null,
          quantity: item.quantity,
          unitPrice: item.price,
          lineTotal: item.price * item.quantity,
          voided: item.voided,
          addedAfterSubmission: item.addedAfterSubmission,
        };
      }),
    };
  }
}

export const thermalPrinterService = new ThermalPrinterService();
