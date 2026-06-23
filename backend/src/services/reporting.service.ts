import prisma from '../config/database';
import { OrderStatus, PaymentMethodEnum, Prisma } from '../../generated/prisma';
import { getReportingConfig } from '../utils/reportingConfig';
import { ReportingPaginationInput } from '../utils/reportingPagination';
import { toUtcIso } from '../utils/reportingTime';

interface ReportingDateFilters {
  updatedSince?: Date;
  createdSince?: Date;
  createdUntil?: Date;
  placedSince?: Date;
  placedUntil?: Date;
  status?: string;
}

type ProductWithCategory = Prisma.ProductVariantGetPayload<{
  include: { product: { include: { category: true } } };
}>;
type CategoryWithRelations = Prisma.CategoryGetPayload<{ include: { parent: true; children: true } }>;

type OrderRecord = Prisma.OrderGetPayload<Record<string, never>>;
type OrderItemRecord = Prisma.OrderItemGetPayload<Record<string, never>>;
type UserRecord = Pick<Prisma.UserGetPayload<Record<string, never>>, 'id'>;
type ProductRecord = Prisma.ProductVariantGetPayload<Record<string, never>>;

const roundMoney = (value: number): number => Number(value.toFixed(2));

const makeProductId = (id: number): string => `prod_${id}`;
const makeCategoryId = (id: number | null): string | null => (id === null ? null : `cat_${id}`);
const makeOrderId = (id: number): string => `order_${id}`;
const makeOrderLineId = (id: number): string => `line_${id}`;
const makePaymentId = (orderId: number): string => `payment_order_${orderId}`;

const sourceStatus = (status: string): string => status.toLowerCase();

const buildCreatedUpdatedWhere = <T extends { createdAt?: unknown; updatedAt?: unknown }>(
  filters: ReportingDateFilters
): T => {
  const where: Record<string, unknown> = {};
  if (filters.updatedSince) where.updatedAt = { gte: filters.updatedSince };
  if (filters.createdSince || filters.createdUntil) {
    where.createdAt = {
      ...(filters.createdSince ? { gte: filters.createdSince } : {}),
      ...(filters.createdUntil ? { lte: filters.createdUntil } : {}),
    };
  }
  return where as T;
};

const mapPaymentType = (paymentMethod: PaymentMethodEnum): string => {
  switch (paymentMethod) {
    case PaymentMethodEnum.CC:
      return 'card';
    case PaymentMethodEnum.STORE_CREDIT:
      return 'store_credit';
    case PaymentMethodEnum.IN_STORE:
      return 'in_store';
    case PaymentMethodEnum.EXTERNAL:
    default:
      return 'external';
  }
};

const mapPaymentProvider = (paymentMethod: PaymentMethodEnum): string => {
  switch (paymentMethod) {
    case PaymentMethodEnum.CC:
      return 'authorize_net';
    case PaymentMethodEnum.STORE_CREDIT:
      return 'store_credit';
    default:
      return 'manual';
  }
};

const mapPaymentStatus = (order: OrderRecord): string => {
  if (order.status === OrderStatus.PENDING_PAYMENT) return 'pending';
  if (order.status === OrderStatus.NOT_FULFILLING) return 'cancelled';
  if (order.paymentMethod === PaymentMethodEnum.CC && order.transactionId) return 'paid';
  if (order.status === OrderStatus.PENDING) return 'pending';
  return 'paid';
};

const mapFulfillmentStatus = (status: OrderStatus): string => {
  switch (status) {
    case OrderStatus.DELIVERED:
    case OrderStatus.PICKED_UP:
      return 'fulfilled';
    case OrderStatus.NOT_FULFILLING:
      return 'cancelled';
    case OrderStatus.PENDING:
    case OrderStatus.PENDING_PAYMENT:
      return 'unfulfilled';
    default:
      return 'in_progress';
  }
};

const isPaidLike = (order: OrderRecord): boolean => mapPaymentStatus(order) === 'paid';

const normalizeStatusFilter = (status: string | undefined): string | undefined => status?.trim().toLowerCase();

export class ReportingService {
  getHealth() {
    const config = getReportingConfig();
    return {
      status: 'ok',
      service: 'online_store_reporting_api',
      provider_key: config.providerKey,
      source_system: config.sourceSystem,
      schema_version: config.schemaVersion,
      generated_at: toUtcIso(new Date()),
    };
  }

  getMetadata() {
    const config = getReportingConfig();
    return {
      provider_key: config.providerKey,
      source_system: config.sourceSystem,
      source_display_name: config.sourceDisplayName,
      schema_version: config.schemaVersion,
      store_timezone: config.timezone,
      currency: config.currency,
      supports: {
        products: true,
        variants: false,
        categories: true,
        inventory_snapshots: true,
        orders: true,
        order_line_items: true,
        payments: true,
        refunds: false,
        fulfillments: true,
        customers: config.includeCustomers,
        webhooks: false,
      },
      limits: {
        max_page_size: config.maxPageSize,
        default_page_size: config.defaultPageSize,
        max_backfill_months: 24,
      },
      limitations: {
        variants: 'This store does not have first-class variants. Product variants are returned as an empty array.',
        refunds: 'This store does not have a first-class refund model yet. The refunds endpoint returns an empty envelope.',
        product_identifiers: 'SKU, barcode, brand, and cost are not present in the current product schema and are returned as null.',
        order_amounts: 'Subtotal, tax, and line tax values are reconstructed from currently stored order totals/items because original subtotal/tax fields are not persisted.',
        inventory: 'Inventory snapshots are derived from current product stock and are not movement history.',
        customers: config.includeCustomers
          ? 'Customer exports are limited to stable internal IDs.'
          : 'Customer exports are disabled by configuration.',
      },
    };
  }

  async listProducts(pagination: ReportingPaginationInput, filters: ReportingDateFilters) {
    const where = buildCreatedUpdatedWhere<Prisma.ProductVariantWhereInput>(filters);
    const rows = await prisma.productVariant.findMany({
      where,
      include: { product: { include: { category: true } } },
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
    return rows.map((product) => this.mapProduct(product));
  }

  async listCategories(pagination: ReportingPaginationInput, filters: ReportingDateFilters) {
    const where = buildCreatedUpdatedWhere<Prisma.CategoryWhereInput>(filters);
    const rows = await prisma.category.findMany({
      where,
      include: { parent: true, children: true },
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
    return rows.map((category) => this.mapCategory(category));
  }

  async listInventorySnapshots(pagination: ReportingPaginationInput, filters: ReportingDateFilters) {
    const where = buildCreatedUpdatedWhere<Prisma.ProductVariantWhereInput>(filters);
    const rows = await prisma.productVariant.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
    const snapshotAt = toUtcIso(new Date());
    return rows.map((product) => this.mapInventorySnapshot(product, snapshotAt));
  }

  async listOrders(pagination: ReportingPaginationInput, filters: ReportingDateFilters) {
    const where: Prisma.OrderWhereInput = buildCreatedUpdatedWhere<Prisma.OrderWhereInput>(filters);
    if (filters.placedSince || filters.placedUntil) {
      where.createdAt = {
        ...(where.createdAt && typeof where.createdAt === 'object' ? where.createdAt : {}),
        ...(filters.placedSince ? { gte: filters.placedSince } : {}),
        ...(filters.placedUntil ? { lte: filters.placedUntil } : {}),
      };
    }

    const normalizedStatus = normalizeStatusFilter(filters.status);
    if (normalizedStatus && Object.values(OrderStatus).map((status) => status.toLowerCase()).includes(normalizedStatus)) {
      where.status = normalizedStatus.toUpperCase() as OrderStatus;
    }

    const rows = await prisma.order.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });

    const orders = normalizedStatus && ['paid', 'pending', 'cancelled'].includes(normalizedStatus)
      ? rows.filter((order) => {
          if (normalizedStatus === 'paid') return isPaidLike(order);
          if (normalizedStatus === 'pending') return mapPaymentStatus(order) === 'pending';
          return order.status === OrderStatus.NOT_FULFILLING;
        })
      : rows;

    if (orders.length === 0) return [];

    const orderIds = orders.map((order) => order.id);
    const userIds = Array.from(new Set(orders.map((order) => order.userId)));
    const items = await prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } });
    const variantIds = Array.from(new Set(items.map((item) => item.variantId)));
    const [variants, users] = await Promise.all([
      prisma.productVariant.findMany({ where: { id: { in: variantIds } } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    ]);

    const productMap = new Map<number, ProductRecord>(variants.map((variant) => [variant.id, variant]));
    const userMap = new Map(users.map((user) => [user.id, user]));
    const itemsByOrder = new Map<number, OrderItemRecord[]>();
    for (const item of items) {
      const existing = itemsByOrder.get(item.orderId) || [];
      existing.push(item);
      itemsByOrder.set(item.orderId, existing);
    }

    return orders.map((order) => this.mapOrder(
      order,
      itemsByOrder.get(order.id) || [],
      productMap,
      userMap
    ));
  }

  async listRefunds() {
    return [];
  }

  private mapProduct(product: ProductWithCategory) {
    return {
      id: makeProductId(product.id),
      sku: product.sku,
      barcode: null,
      name: product.product.name,
      description: product.product.description,
      category_id: makeCategoryId(product.product.categoryId),
      category_name: product.product.category?.name || null,
      brand: null,
      status: product.product.hidden || !product.active ? 'archived' : 'active',
      price: product.basePrice.toNumber(),
      cost: null,
      inventory_quantity: product.stockEnabled ? product.stock.toNumber() : null,
      created_at: toUtcIso(product.createdAt),
      updated_at: toUtcIso(product.updatedAt),
      deleted_at: null,
      source_updated_at: toUtcIso(product.updatedAt),
      variants: [],
    };
  }

  private mapCategory(category: CategoryWithRelations) {
    return {
      id: makeCategoryId(category.id),
      name: category.name,
      parent_id: makeCategoryId(category.parentId),
      status: 'active',
      created_at: toUtcIso(category.createdAt),
      updated_at: toUtcIso(category.updatedAt),
      deleted_at: null,
      source_updated_at: toUtcIso(category.updatedAt),
    };
  }

  private mapInventorySnapshot(product: ProductRecord, snapshotAt: string | null) {
    const quantity = product.stockEnabled ? product.stock.toNumber() : null;
    return {
      id: `inventory_${makeProductId(product.id)}`,
      product_id: makeProductId(product.id),
      variant_id: null,
      sku: null,
      quantity_available: quantity,
      quantity_reserved: 0,
      quantity_on_hand: quantity,
      location_id: 'online_store',
      snapshot_at: snapshotAt,
      created_at: toUtcIso(product.createdAt),
      updated_at: toUtcIso(product.updatedAt),
      deleted_at: null,
      status: product.active ? 'active' : 'archived',
      source_updated_at: toUtcIso(product.updatedAt),
      source_type: 'snapshot',
    };
  }

  private mapOrder(
    order: OrderRecord,
    items: OrderItemRecord[],
    productMap: Map<number, ProductRecord>,
    userMap: Map<number, UserRecord>
  ) {
    const config = getReportingConfig();
    const lineItems = items.map((item) => this.mapOrderLineItem(order, item, productMap.get(item.variantId)));
    const activeLineSubtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.net_sales, 0));
    const grandTotal = roundMoney(order.total.toNumber());
    const taxTotal = Math.max(0, roundMoney(grandTotal - activeLineSubtotal));
    const customer = userMap.get(order.userId);

    return {
      id: makeOrderId(order.id),
      order_number: String(order.id),
      status: sourceStatus(order.status),
      source_status: order.status,
      order_type: 'online',
      placed_at: toUtcIso(order.createdAt),
      created_at: toUtcIso(order.createdAt),
      updated_at: toUtcIso(order.updatedAt),
      deleted_at: null,
      source_updated_at: toUtcIso(order.updatedAt),
      subtotal: activeLineSubtotal,
      discount_total: 0,
      tax_total: taxTotal,
      shipping_total: 0,
      grand_total: grandTotal,
      currency: config.currency,
      payment_status: mapPaymentStatus(order),
      fulfillment_status: mapFulfillmentStatus(order.status),
      fulfillment_method: order.deliveryMethod.toLowerCase(),
      customer_id: config.includeCustomers && customer ? `customer_${customer.id}` : null,
      line_items: lineItems,
      payments: this.mapPayments(order),
      limitations: {
        subtotal_tax_split: 'The current order schema stores final total, not persisted subtotal/tax fields; subtotal and tax are reconstructed from current line items and total.',
        line_item_snapshots: 'The current order item schema stores product id, quantity, and unit price; product name is resolved from the current product record.',
      },
    };
  }

  private mapOrderLineItem(order: OrderRecord, item: OrderItemRecord, product: ProductRecord | undefined) {
    const unitPrice = item.unitPrice.toNumber();
    const grossSales = roundMoney(unitPrice * item.quantity);
    const netSales = item.voided || order.status === OrderStatus.NOT_FULFILLING ? 0 : grossSales;
    return {
      id: makeOrderLineId(item.id),
      order_id: makeOrderId(item.orderId),
      product_id: makeProductId(product?.id ?? item.variantId),
      variant_id: null,
      sku: null,
      barcode: null,
      name_snapshot: item.productName,
      quantity: item.quantity,
      unit_price: unitPrice,
      unit_cost: null,
      discount_amount: 0,
      tax_amount: 0,
      gross_sales: grossSales,
      net_sales: netSales,
      refunded_quantity: 0,
      created_at: toUtcIso(item.createdAt),
      updated_at: toUtcIso(order.updatedAt),
      deleted_at: null,
      status: item.voided ? 'voided' : 'active',
      source_updated_at: toUtcIso(order.updatedAt),
    };
  }

  private mapPayments(order: OrderRecord) {
    if (order.status === OrderStatus.NOT_FULFILLING) return [];
    const config = getReportingConfig();
    const status = mapPaymentStatus(order);
    const total = order.total.toNumber();
    return [
      {
        id: makePaymentId(order.id),
        order_id: makeOrderId(order.id),
        payment_type: mapPaymentType(order.paymentMethod),
        provider: mapPaymentProvider(order.paymentMethod),
        amount: status === 'pending' ? 0 : roundMoney(total),
        currency: config.currency,
        status: status === 'paid' ? 'captured' : status,
        paid_at: status === 'paid' ? toUtcIso(order.updatedAt) : null,
        processor_reference: config.includePaymentDetails && order.paymentMethod === PaymentMethodEnum.CC
          ? order.transactionId
          : null,
      },
    ];
  }
}

export const reportingService = new ReportingService();
