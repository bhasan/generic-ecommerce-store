import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { OrderStatus } from '../generated/prisma';

async function seed() {
  console.log('🌱 Starting database seed...');

  console.log('🧹 Cleaning existing data...');
  await prisma.notification.deleteMany();
  await prisma.contactMessage.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.creditTransaction.deleteMany();
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

  console.log('👥 Creating roles and users...');
  
  const roleNames = ['GUEST', 'CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER', 'VIP'] as const;
  type RoleName = (typeof roleNames)[number];

  const roles = await Promise.all(
    roleNames.map((name) =>
      prisma.role.create({
        data: { name },
      })
    )
  );

  const getRoleByName = (name: RoleName) =>
    roles.find((role) => role.name === name) ?? (() => { throw new Error(`Missing role ${name}`); })();

  const getRoleIds = (names: RoleName[]) =>
    names.map((name) => getRoleByName(name).id);

  const adminPassword = await hashPassword('admin123');
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: adminPassword,
      phoneNumber: '(512) 555-0100',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['ADMIN']).map(roleId => ({ userId: admin.id, roleId }))
  });

  const managerPassword = await hashPassword('manager123');
  const manager = await prisma.user.create({
    data: {
      username: 'manager',
      password: managerPassword,
      phoneNumber: '(512) 555-0200',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['MANAGEMENT']).map(roleId => ({ userId: manager.id, roleId }))
  });

  const employeePassword = await hashPassword('employee123');
  const employee = await prisma.user.create({
    data: {
      username: 'employee',
      password: employeePassword,
      phoneNumber: '(512) 555-0300',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['EMPLOYEE']).map(roleId => ({ userId: employee.id, roleId }))
  });

  const customerPassword = await hashPassword('customer123');
  const customer = await prisma.user.create({
    data: {
      username: 'johncustomer',
      password: customerPassword,
      address: '123 Main Street, Austin, TX 78701',
      cashapp: '$JohnCustomer',
      phoneNumber: '(512) 555-0101',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER']).map(roleId => ({ userId: customer.id, roleId }))
  });

  const sarahPassword = await hashPassword('customer123');
  const sarah = await prisma.user.create({
    data: {
      username: 'sarahjohnson',
      password: sarahPassword,
      address: '456 Oak Avenue, Austin, TX 78702',
      cashapp: '$SarahJ',
      phoneNumber: '(512) 555-0102',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER']).map(roleId => ({ userId: sarah.id, roleId }))
  });

  const mikePassword = await hashPassword('customer123');
  const mike = await prisma.user.create({
    data: {
      username: 'mikethompson',
      password: mikePassword,
      address: '789 Pine Road, Austin, TX 78703',
      cashapp: '$MikeT',
      phoneNumber: '(512) 555-0103',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER']).map(roleId => ({ userId: mike.id, roleId }))
  });

  const emilyPassword = await hashPassword('customer123');
  const emily = await prisma.user.create({
    data: {
      username: 'emilychen',
      password: emilyPassword,
      address: '321 Elm Street, Austin, TX 78704',
      cashapp: '$EmilyC',
      phoneNumber: '(512) 555-0104',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER']).map(roleId => ({ userId: emily.id, roleId }))
  });

  const davidPassword = await hashPassword('customer123');
  const david = await prisma.user.create({
    data: {
      username: 'davidwilliams',
      password: davidPassword,
      address: '654 Maple Drive, Austin, TX 78705',
      cashapp: '$DavidW',
      phoneNumber: '(512) 555-0105',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER']).map(roleId => ({ userId: david.id, roleId }))
  });

  const vipPassword = await hashPassword('vip123');
  const vipUser = await prisma.user.create({
    data: {
      username: 'vipuser',
      password: vipPassword,
      address: '100 VIP Lane, Austin, TX 78706',
      cashapp: '$VIPUser',
      phoneNumber: '(512) 555-0106',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['CUSTOMER', 'VIP']).map(roleId => ({ userId: vipUser.id, roleId }))
  });

  const driverPassword = await hashPassword('driver123');
  const driver = await prisma.user.create({
    data: {
      username: 'driver',
      password: driverPassword,
      phoneNumber: '(512) 555-0400',
      approved: true,
    },
  });
  await prisma.userRole.createMany({
    data: getRoleIds(['DELIVERY_DRIVER']).map(roleId => ({ userId: driver.id, roleId }))
  });

  console.log('✅ Users created');
  console.log('   Admin: admin / admin123');
  console.log('   Manager: manager / manager123');
  console.log('   Employee: employee / employee123');
  console.log('   Customer: johncustomer / customer123');
  console.log('   Driver: driver / driver123');
  console.log('   Sarah: sarahjohnson / customer123');
  console.log('   Mike: mikethompson / customer123');
  console.log('   Emily: emilychen / customer123');
  console.log('   David: davidwilliams / customer123');

  console.log('');
  console.log('🗂️  Creating categories...');

  const electronicsCategory = await prisma.category.create({
    data: {
      name: 'Electronics',
      description: 'Audio, wearables, and smart devices'
    }
  });

  const accessoriesCategory = await prisma.category.create({
    data: {
      name: 'Accessories',
      description: 'Bags, cables, and everyday add-ons'
    }
  });

  console.log('📦 Creating products...');

  // Each seed product gets one default UNIT variant (price/stock live on the variant)
  // plus a thumbnail image, matching the post-migration catalog shape.
  const makeProduct = (data: {
    name: string;
    slug: string;
    categoryId: number;
    description: string;
    image: string;
    price: number;
    stock: number;
    stockEnabled: boolean;
  }) =>
    prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        categoryId: data.categoryId,
        description: data.description,
        hidden: false,
        images: {
          create: [{ url: data.image, role: 'THUMBNAIL', sortOrder: 0 }],
        },
        variants: {
          create: [{
            label: 'Default',
            sku: `SKU-${data.slug}`,
            pricingMode: 'UNIT',
            basePrice: data.price,
            stock: data.stock,
            stockEnabled: data.stockEnabled,
            isDefault: true,
            active: true,
            sortOrder: 0,
          }],
        },
      },
      include: { variants: true },
    });

  const products = await Promise.all([
    makeProduct({
      name: 'Wireless Headphones', slug: 'wireless-headphones', categoryId: electronicsCategory.id,
      description: 'High-quality wireless headphones with noise cancellation',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      price: 99.99, stock: 15, stockEnabled: true,
    }),
    makeProduct({
      name: 'Smart Watch', slug: 'smart-watch', categoryId: electronicsCategory.id,
      description: 'Feature-rich smartwatch with health tracking',
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
      price: 199.99, stock: 8, stockEnabled: true,
    }),
    makeProduct({
      name: 'Laptop Bag', slug: 'laptop-bag', categoryId: accessoriesCategory.id,
      description: 'Durable laptop bag with multiple compartments',
      image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
      price: 49.99, stock: 20, stockEnabled: true,
    }),
    makeProduct({
      name: 'USB-C Cable', slug: 'usb-c-cable', categoryId: accessoriesCategory.id,
      description: 'Fast charging USB-C cable',
      image: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400',
      price: 14.99, stock: 0, stockEnabled: false,
    }),
  ]);

  // The default variant for each product (used by order items below).
  const defaultVariant = (p: (typeof products)[number]) => p.variants[0];

  console.log(`✅ Created ${products.length} products`);

  console.log('⭐ Creating reviews...');

  await prisma.review.create({
    data: {
      userId: customer.id,
      productId: products[0].id,
      rating: 5,
      comment: 'Amazing sound quality! Best headphones I have ever owned.',
      helpful: 12,
      notHelpful: 1,
      flagged: false
    }
  });

  await prisma.review.create({
    data: {
      userId: sarah.id,
      productId: products[0].id,
      rating: 4,
      comment: 'Very comfortable for long listening sessions.',
      helpful: 8,
      notHelpful: 0,
      flagged: false
    }
  });

  await prisma.review.create({
    data: {
      userId: mike.id,
      productId: products[0].id,
      rating: 5,
      comment: 'Perfect for work from home!',
      helpful: 15,
      notHelpful: 2,
      flagged: false
    }
  });

  console.log('✅ Reviews created');

  console.log('🛒 Creating orders...');

  const order1 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.PENDING,
      total: 99.99,
      createdAt: new Date('2024-11-10')
    }
  });
  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      variantId: defaultVariant(products[0]).id,
      productName: products[0].name,
      variantLabel: defaultVariant(products[0]).label,
      quantity: 1,
      unitPrice: defaultVariant(products[0]).basePrice
    }
  });

  const order2 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.APPROVED,
      total: 249.98,
      createdAt: new Date('2024-11-09')
    }
  });
  await prisma.orderItem.createMany({
    data: [
      {
        orderId: order2.id,
        variantId: defaultVariant(products[1]).id,
        productName: products[1].name,
        variantLabel: defaultVariant(products[1]).label,
        quantity: 1,
        unitPrice: defaultVariant(products[1]).basePrice
      },
      {
        orderId: order2.id,
        variantId: defaultVariant(products[3]).id,
        productName: products[3].name,
        variantLabel: defaultVariant(products[3]).label,
        quantity: 1,
        unitPrice: defaultVariant(products[3]).basePrice
      }
    ]
  });

  console.log('✅ Orders created');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log(`   Users: 9`);
  console.log(`   Products: ${products.length}`);
  console.log(`   Reviews: 3`);
  console.log(`   Orders: 2`);
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
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
