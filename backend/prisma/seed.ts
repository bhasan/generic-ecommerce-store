import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { DeliveryMethodEnum, OrderStatus, PaymentMethodEnum, PaymentStatus, Prisma } from '../generated/prisma';

async function seed() {
  console.log('🌱 Starting database seed...');

  // Cascade deletes handle orderStatusEvent + payment rows automatically.
  await prisma.notification.deleteMany();
  await prisma.contactMessage.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.storeCreditTransaction.deleteMany();
  await prisma.uiSetting.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  // ── Roles ──────────────────────────────────────────────────────────────
  const roleNames = ['GUEST', 'CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER', 'VIP'] as const;
  type RoleName = (typeof roleNames)[number];

  const roles = await Promise.all(
    roleNames.map(name => prisma.role.create({ data: { name } }))
  );

  const roleId = (name: RoleName) =>
    roles.find(r => r.name === name)?.id ?? (() => { throw new Error(`Missing role ${name}`); })();

  const assignRoles = (userId: number, names: RoleName[]) =>
    prisma.userRole.createMany({ data: names.map(name => ({ userId, roleId: roleId(name) })) });

  // ── Users ──────────────────────────────────────────────────────────────
  const makeUser = async (
    username: string,
    password: string,
    roles: RoleName[],
    extra: Partial<Parameters<typeof prisma.user.create>[0]['data']> = {},
  ) => {
    const user = await prisma.user.create({
      data: { username, password: await hashPassword(password), approved: true, ...extra },
    });
    await assignRoles(user.id, roles);
    return user;
  };

  const [admin, , , customer, sarah, mike] = await Promise.all([
    makeUser('admin',          'admin123',    ['ADMIN']),
    makeUser('manager',        'manager123',  ['MANAGEMENT']),
    makeUser('employee',       'employee123', ['EMPLOYEE']),
    makeUser('johncustomer',   'customer123', ['CUSTOMER'], {
      address: '123 Main Street, Austin, TX 78701',
      cashapp: '$JohnCustomer',
      phoneNumber: '(512) 555-0101',
    }),
    makeUser('sarahjohnson',   'customer123', ['CUSTOMER'], {
      address: '456 Oak Avenue, Austin, TX 78702',
      cashapp: '$SarahJ',
      phoneNumber: '(512) 555-0102',
    }),
    makeUser('mikethompson',   'customer123', ['CUSTOMER'], {
      address: '789 Pine Road, Austin, TX 78703',
      cashapp: '$MikeT',
      phoneNumber: '(512) 555-0103',
    }),
    makeUser('emilychen',      'customer123', ['CUSTOMER'], {
      address: '321 Elm Street, Austin, TX 78704',
      cashapp: '$EmilyC',
      phoneNumber: '(512) 555-0104',
    }),
    makeUser('davidwilliams',  'customer123', ['CUSTOMER'], {
      address: '654 Maple Drive, Austin, TX 78705',
      cashapp: '$DavidW',
      phoneNumber: '(512) 555-0105',
    }),
    makeUser('vipuser',        'vip123',      ['CUSTOMER', 'VIP'], {
      address: '100 VIP Lane, Austin, TX 78706',
      cashapp: '$VIPUser',
      phoneNumber: '(512) 555-0106',
    }),
    makeUser('driver',         'driver123',   ['DELIVERY_DRIVER'], {
      phoneNumber: '(512) 555-0400',
    }),
  ]);

  console.log('✅ Users created');

  // ── Categories ─────────────────────────────────────────────────────────
  const [electronics, accessories] = await Promise.all([
    prisma.category.create({ data: { name: 'Electronics', description: 'Audio, wearables, and smart devices' } }),
    prisma.category.create({ data: { name: 'Accessories', description: 'Bags, cables, and everyday add-ons' } }),
  ]);

  // ── Products ───────────────────────────────────────────────────────────
  const makeProduct = (opts: {
    name: string; slug: string; categoryId: number; description: string; image: string;
    price: number; stock: number; stockEnabled: boolean;
  }) =>
    prisma.product.create({
      data: {
        name: opts.name, slug: opts.slug, categoryId: opts.categoryId,
        description: opts.description, hidden: false,
        images: { create: [{ url: opts.image, role: 'THUMBNAIL', sortOrder: 0 }] },
        variants: {
          create: [{
            label: 'Default', sku: `SKU-${opts.slug}`, pricingMode: 'UNIT',
            basePrice: opts.price, stock: opts.stock, stockEnabled: opts.stockEnabled,
            isDefault: true, active: true, sortOrder: 0,
          }],
        },
      },
      include: { variants: true },
    });

  const products = await Promise.all([
    makeProduct({
      name: 'Wireless Headphones', slug: 'wireless-headphones', categoryId: electronics.id,
      description: 'High-quality wireless headphones with noise cancellation',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      price: 99.99, stock: 15, stockEnabled: true,
    }),
    makeProduct({
      name: 'Smart Watch', slug: 'smart-watch', categoryId: electronics.id,
      description: 'Feature-rich smartwatch with health tracking',
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
      price: 199.99, stock: 8, stockEnabled: true,
    }),
    makeProduct({
      name: 'Laptop Bag', slug: 'laptop-bag', categoryId: accessories.id,
      description: 'Durable laptop bag with multiple compartments',
      image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
      price: 49.99, stock: 20, stockEnabled: true,
    }),
    makeProduct({
      name: 'USB-C Cable', slug: 'usb-c-cable', categoryId: accessories.id,
      description: 'Fast charging USB-C cable',
      image: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400',
      price: 14.99, stock: 0, stockEnabled: false,
    }),
  ]);

  // Multi-variant product used by e2e variant tests
  await prisma.product.create({
    data: {
      name: 'Flow Test Hoodie', slug: 'flow-test-hoodie', categoryId: accessories.id,
      description: 'Comfortable hoodie in three sizes for testing variant selection.',
      hidden: false,
      images: { create: [{ url: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=400', role: 'THUMBNAIL', sortOrder: 0 }] },
      variants: {
        create: [
          { label: 'Small',  sku: 'SKU-hoodie-S', pricingMode: 'UNIT', basePrice: 29.99, stock: 10, stockEnabled: true,  isDefault: true,  active: true, sortOrder: 0 },
          { label: 'Medium', sku: 'SKU-hoodie-M', pricingMode: 'UNIT', basePrice: 34.99, stock: 5,  stockEnabled: true,  isDefault: false, active: true, sortOrder: 1 },
          { label: 'Large',  sku: 'SKU-hoodie-L', pricingMode: 'UNIT', basePrice: 34.99, stock: 0,  stockEnabled: true,  isDefault: false, active: true, sortOrder: 2 },
        ],
      },
    },
  });

  const v = (i: number) => products[i].variants[0];
  console.log(`✅ Created ${products.length + 1} products`);

  // ── Reviews ────────────────────────────────────────────────────────────
  await prisma.review.createMany({
    data: [
      { userId: customer.id, productId: products[0].id, rating: 5, comment: 'Amazing sound quality! Best headphones I have ever owned.', helpful: 12, notHelpful: 1, flagged: false },
      { userId: sarah.id,    productId: products[0].id, rating: 4, comment: 'Very comfortable for long listening sessions.', helpful: 8,  notHelpful: 0, flagged: false },
      { userId: mike.id,     productId: products[0].id, rating: 5, comment: 'Perfect for work from home!', helpful: 15, notHelpful: 2, flagged: false },
    ],
  });
  console.log('✅ Reviews created');

  // ── Orders ─────────────────────────────────────────────────────────────
  // Order 1 — PENDING, EXTERNAL (CashApp), awaiting staff approval
  const order1 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethodEnum.EXTERNAL,
      deliveryMethod: DeliveryMethodEnum.PICKUP,
      subtotal: new Prisma.Decimal('99.99'),
      tax: new Prisma.Decimal('8.25'),
      total: new Prisma.Decimal('108.24'),
      taxRate: new Prisma.Decimal('0.0825'),
      createdAt: new Date('2024-11-10'),
      items: {
        create: [{
          variantId: v(0).id, productName: products[0].name,
          variantLabel: v(0).label, quantity: 1, unitPrice: v(0).basePrice,
        }],
      },
      payments: {
        create: [{
          method: PaymentMethodEnum.EXTERNAL,
          status: PaymentStatus.PENDING,
          amount: new Prisma.Decimal('108.24'),
          paymentHandle: '$JohnCustomer',
        }],
      },
    },
  });

  // Order 2 — APPROVED, EXTERNAL; payment settled, one status event recorded
  const order2 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.APPROVED,
      paymentMethod: PaymentMethodEnum.EXTERNAL,
      deliveryMethod: DeliveryMethodEnum.PICKUP,
      subtotal: new Prisma.Decimal('214.98'),
      tax: new Prisma.Decimal('17.74'),
      total: new Prisma.Decimal('232.72'),
      taxRate: new Prisma.Decimal('0.0825'),
      createdAt: new Date('2024-11-09'),
      items: {
        create: [
          { variantId: v(1).id, productName: products[1].name, variantLabel: v(1).label, quantity: 1, unitPrice: v(1).basePrice },
          { variantId: v(3).id, productName: products[3].name, variantLabel: v(3).label, quantity: 1, unitPrice: v(3).basePrice },
        ],
      },
      payments: {
        create: [{
          method: PaymentMethodEnum.EXTERNAL,
          status: PaymentStatus.SETTLED,
          amount: new Prisma.Decimal('232.72'),
          paymentHandle: '$JohnCustomer',
        }],
      },
      statusEvents: {
        create: [{
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.APPROVED,
          changedBy: admin.id,
          note: 'Payment confirmed',
        }],
      },
    },
  });

  void order1; void order2; // suppress unused-var warnings
  console.log('✅ Orders created');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('🔐 Test Accounts:');
  console.log('   Admin:    admin / admin123');
  console.log('   Manager:  manager / manager123');
  console.log('   Employee: employee / employee123');
  console.log('   Customer: johncustomer / customer123');
  console.log('   Driver:   driver / driver123');
  console.log('');
}

seed()
  .catch(error => { console.error('❌ Seed failed:', error); process.exit(1); })
  .finally(() => prisma.$disconnect());
