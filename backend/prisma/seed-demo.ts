// backend/prisma/seed-demo.ts
import { getUnscopedPrisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { DeliveryMethodEnum, OrderStatus, PaymentMethodEnum, PaymentStatus, Prisma } from '../generated/prisma';

const prisma = getUnscopedPrisma();
const DEMO_SLUG = 'demo';

export async function seedDemo(): Promise<{ tenantId: number; storeId: number; productCount: number; orderCount: number }> {
  // ── Tenant & Store (idempotent) ──────────────────────────────────────────
  let tenant = await prisma.tenant.findFirst({ where: { slug: DEMO_SLUG } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { slug: DEMO_SLUG, name: 'Demo Smoke Shop', status: 'ACTIVE', plan: 'demo' } });
  }
  const tenantId = tenant.id;

  let store = await prisma.store.findFirst({ where: { tenantId, slug: 'main' } });
  if (!store) {
    store = await prisma.store.create({ data: { tenantId, name: 'Demo Store', slug: 'main', isDefault: true, status: 'ACTIVE' } });
  }
  const storeId = store.id;

  // Re-runnable: clear this tenant's mutable data, leave tenant/store rows.
  await prisma.order.deleteMany({ where: { tenantId } });        // cascades items/payments/events
  await prisma.product.deleteMany({ where: { tenantId } });      // cascades images/variants
  await prisma.category.deleteMany({ where: { tenantId } });
  await prisma.userRole.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });

  // ── Roles (reuse the GLOBAL role catalog; demo only needs assignment) ─────
  const need = ['CUSTOMER', 'MANAGEMENT'] as const;
  const roleByName: Record<string, number> = {};
  for (const name of need) {
    const role = (await prisma.role.findFirst({ where: { name } })) ?? (await prisma.role.create({ data: { name } }));
    roleByName[name] = role.id;
  }

  // ── Demo users (known credentials) ───────────────────────────────────────
  const mgr = await prisma.user.create({ data: { username: 'demo-manager', password: await hashPassword('demo1234'), approved: true, tenantId } });
  await prisma.userRole.create({ data: { userId: mgr.id, roleId: roleByName.MANAGEMENT, tenantId, storeId } });

  const cust = await prisma.user.create({ data: { username: 'demo-customer', password: await hashPassword('demo1234'), approved: true, tenantId, address: '1 Demo Way, Austin, TX 78701', phoneNumber: '(512) 555-0199' } });
  await prisma.userRole.create({ data: { userId: cust.id, roleId: roleByName.CUSTOMER, tenantId } });

  // ── Fake catalog ─────────────────────────────────────────────────────────
  const cat = await prisma.category.create({ data: { name: 'Demo Goods', slug: 'demo-goods', description: 'Obviously-fake demo catalog', tenantId } });
  const productSpecs = [
    { name: 'Demo Widget',  slug: 'demo-widget',  price: '19.99', stock: 25 },
    { name: 'Demo Gadget',  slug: 'demo-gadget',  price: '39.99', stock: 10 },
    { name: 'Demo Gizmo',   slug: 'demo-gizmo',   price: '9.99',  stock: 50 },
  ];
  const products = [];
  for (const p of productSpecs) {
    const product = await prisma.product.create({
      data: {
        name: p.name, slug: p.slug, categoryId: cat.id, description: `${p.name} — demo only`, hidden: false, tenantId,
        images: { create: [{ url: 'https://placehold.co/400x400?text=Demo', role: 'THUMBNAIL', sortOrder: 0, tenantId }] },
        variants: { create: [{ label: 'Default', sku: `DEMO-${p.slug}`, pricingMode: 'UNIT', basePrice: new Prisma.Decimal(p.price), stock: p.stock, stockEnabled: true, isDefault: true, active: true, sortOrder: 0, tenantId }] },
      },
      include: { variants: true },
    });
    products.push(product);
  }

  // ── Orders across the lifecycle ──────────────────────────────────────────
  const stages: OrderStatus[] = [
    OrderStatus.PENDING, OrderStatus.APPROVED, OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.READY_FOR_PICKUP, OrderStatus.PICKED_UP,
  ];
  let orderCount = 0;
  for (const status of stages) {
    const variant = products[orderCount % products.length].variants[0];
    const price = variant.basePrice as unknown as Prisma.Decimal;
    await prisma.order.create({
      data: {
        userId: cust.id, status,
        paymentMethod: PaymentMethodEnum.EXTERNAL,
        deliveryMethod: status === OrderStatus.READY_FOR_PICKUP || status === OrderStatus.PICKED_UP ? DeliveryMethodEnum.PICKUP : DeliveryMethodEnum.DELIVERY,
        subtotal: price, tax: new Prisma.Decimal('0'), total: price, taxRate: new Prisma.Decimal('0'),
        tenantId, storeId,
        items: { create: [{ variantId: variant.id, productName: products[orderCount % products.length].name, variantLabel: variant.label, quantity: 1, unitPrice: price, tenantId, storeId }] },
        payments: { create: [{ method: PaymentMethodEnum.EXTERNAL, status: status === OrderStatus.PENDING ? PaymentStatus.PENDING : PaymentStatus.SETTLED, amount: price, tenantId, storeId }] },
      },
    });
    orderCount++;
  }

  return { tenantId, storeId, productCount: products.length, orderCount };
}

// Self-invoke when run directly as a script (not when imported by a test).
if (require.main === module) {
  seedDemo()
    .then((r) => { console.log('🎭 Demo tenant seeded:', r); })
    .catch((e) => { console.error('❌ Demo seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
