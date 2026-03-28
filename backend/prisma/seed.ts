import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { OrderStatus } from '../generated/prisma';

async function seed() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (optional - comment out if you want to keep existing data)
  console.log('🧹 Cleaning existing data...');
  await prisma.cartItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  // Create test users
  console.log('👥 Creating users...');
  
  const roleNames = ['GUEST', 'CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER'] as const;
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

  // Create additional users for reviews (matching mockData.js)
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

  // Create delivery driver user
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
  console.log('   Admin:', admin.username, '/ admin123');
  console.log('   Manager:', manager.username, '/ manager123');
  console.log('   Employee:', employee.username, '/ employee123');
  console.log('   Customer:', customer.username, '/ customer123');
  console.log('   Driver:', driver.username, '/ driver123');
  console.log('   Sarah:', sarah.username, '/ customer123');
  console.log('   Mike:', mike.username, '/ customer123');
  console.log('   Emily:', emily.username, '/ customer123');
  console.log('   David:', david.username, '/ customer123');

  // Create categories
  console.log('🗂️ Creating categories...');

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

  // Create products from mockData.js
  console.log('📦 Creating products...');

  const products = await Promise.all([
    // Product 1: Wireless Headphones
    prisma.productItem.create({
      data: {
        name: 'Wireless Headphones',
        categoryId: electronicsCategory.id,
        price: 99.99,
        description: 'High-quality wireless headphones with noise cancellation',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
        images: [
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400'
        ],
        stock: 15,
        stockEnabled: true,
        hidden: false
      }
    }),
    // Product 2: Smart Watch
    prisma.productItem.create({
      data: {
        name: 'Smart Watch',
        categoryId: electronicsCategory.id,
        price: 199.99,
        description: 'Feature-rich smartwatch with health tracking',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
        images: [
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
          'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400',
          'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=400'
        ],
        stock: 8,
        stockEnabled: true,
        hidden: false
      }
    }),
    // Product 3: Laptop Bag
    prisma.productItem.create({
      data: {
        name: 'Laptop Bag',
        categoryId: accessoriesCategory.id,
        price: 49.99,
        description: 'Durable laptop bag with multiple compartments',
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
        images: [
          'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400'
        ],
        stock: 20,
        stockEnabled: true,
        hidden: false
      }
    }),
    // Product 4: USB-C Cable
    prisma.productItem.create({
      data: {
        name: 'USB-C Cable',
        categoryId: accessoriesCategory.id,
        price: 14.99,
        description: 'Fast charging USB-C cable',
        image: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400',
        images: [
          'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400'
        ],
        stock: 0,
        stockEnabled: false, // Stock tracking disabled for this item
        hidden: false
      }
    })
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create reviews from mockData.js
  console.log('⭐ Creating reviews...');

  // Reviews for Wireless Headphones (product 0)
  await prisma.review.create({
    data: {
      userId: customer.id, // John Customer
      productId: products[0].id,
      rating: 5,
      comment: 'Amazing sound quality! The noise cancellation is fantastic. Best headphones I have ever owned.',
      helpful: 12,
      notHelpful: 1,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  await prisma.review.create({
    data: {
      userId: sarah.id, // Sarah Johnson
      productId: products[0].id,
      rating: 4,
      comment: 'Very comfortable for long listening sessions. Battery life is impressive. Only minor issue is the Bluetooth range could be better.',
      helpful: 8,
      notHelpful: 0,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  await prisma.review.create({
    data: {
      userId: mike.id, // Mike Thompson
      productId: products[0].id,
      rating: 5,
      comment: 'Perfect for work from home! The noise cancellation helps me focus. Highly recommend!',
      helpful: 15,
      notHelpful: 2,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  // Reviews for Smart Watch (product 1)
  await prisma.review.create({
    data: {
      userId: customer.id, // John Customer
      productId: products[1].id,
      rating: 4,
      comment: 'Great health tracking features. Sleep monitoring is accurate. Would give 5 stars if battery lasted longer.',
      helpful: 5,
      notHelpful: 0,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  await prisma.review.create({
    data: {
      userId: emily.id, // Emily Chen
      productId: products[1].id,
      rating: 5,
      comment: 'Love this watch! All the features I need for fitness tracking. The heart rate monitor is very accurate.',
      helpful: 10,
      notHelpful: 1,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  // Review for Laptop Bag (product 2)
  await prisma.review.create({
    data: {
      userId: david.id, // David Williams
      productId: products[2].id,
      rating: 5,
      comment: 'Perfect size for my 15-inch laptop. Great quality materials and lots of pockets for organization.',
      helpful: 7,
      notHelpful: 0,
      flagged: false,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  console.log('✅ Reviews created');

  // Create orders from mockData.js
  console.log('🛒 Creating orders...');

  // Order 1: PENDING - Wireless Headphones
  // Order 1: PENDING - Wireless Headphones
  const order1 = await prisma.order.create({
    data: {
      userId: customer.id, // John Customer (userId 2 in mockData)
      status: OrderStatus.PENDING,
      total: 99.99,
      createdAt: new Date('2024-11-10')
    }
  });
  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      productId: products[0].id, // Wireless Headphones
      quantity: 1,
      price: products[0].price
    }
  });

  // Order 2: APPROVED - Smart Watch + USB-C Cable
  const order2 = await prisma.order.create({
    data: {
      userId: customer.id, // John Customer (userId 2 in mockData)
      status: OrderStatus.APPROVED,
      total: 249.98,
      createdAt: new Date('2024-11-09')
    }
  });
  await prisma.orderItem.createMany({
    data: [
      {
        orderId: order2.id,
        productId: products[1].id, // Smart Watch
        quantity: 1,
        price: products[1].price
      },
      {
        orderId: order2.id,
        productId: products[3].id, // USB-C Cable
        quantity: 1,
        price: products[3].price
      }
    ]
  });

  // Order 3: READY_FOR_DELIVERY - For delivery driver testing
  const order3 = await prisma.order.create({
    data: {
      userId: sarah.id, // Sarah Johnson
      status: OrderStatus.READY_FOR_DELIVERY,
      total: 99.99,
      createdAt: new Date('2024-11-11T10:00:00')
    }
  });
  await prisma.orderItem.create({
    data: {
      orderId: order3.id,
      productId: products[0].id, // Wireless Headphones
      quantity: 1,
      price: products[0].price
    }
  });

  // Order 4: READY_FOR_DELIVERY - Multiple items
  const order4 = await prisma.order.create({
    data: {
      userId: emily.id, // Emily Chen
      status: OrderStatus.READY_FOR_DELIVERY,
      total: 264.97,
      createdAt: new Date('2024-11-11T09:30:00')
    }
  });
  await prisma.orderItem.createMany({
    data: [
      {
        orderId: order4.id,
        productId: products[1].id, // Smart Watch
        quantity: 1,
        price: products[1].price
      },
      {
        orderId: order4.id,
        productId: products[2].id, // Laptop Bag
        quantity: 1,
        price: products[2].price
      },
      {
        orderId: order4.id,
        productId: products[3].id, // USB-C Cable
        quantity: 1,
        price: products[3].price
      }
    ]
  });

  // Order 5: READY_FOR_DELIVERY - Another order
  const order5 = await prisma.order.create({
    data: {
      userId: mike.id, // Mike Thompson
      status: OrderStatus.READY_FOR_DELIVERY,
      total: 49.99,
      createdAt: new Date('2024-11-11T08:15:00')
    }
  });
  await prisma.orderItem.create({
    data: {
      orderId: order5.id,
      productId: products[2].id, // Laptop Bag
      quantity: 1,
      price: products[2].price
    }
  });

  console.log('✅ Orders created');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log(`   Users: ${9}`); // admin, manager, employee, customer, driver, sarah, mike, emily, david
  console.log(`   Products: ${products.length}`);
  console.log(`   Reviews: ${6}`);
  console.log(`   Orders: ${5} (2 regular, 3 ready for delivery)`);
  console.log('');
  console.log('🔐 Test Accounts:');
  console.log('   Admin:    admin / admin123');
  console.log('   Manager:  manager / manager123');
  console.log('   Employee: employee / employee123');
  console.log('   Customer: johncustomer / customer123');
  console.log('   Driver:   driver / driver123');
  console.log('   Sarah:    sarahjohnson / customer123');
  console.log('   Mike:     mikethompson / customer123');
  console.log('   Emily:    emilychen / customer123');
  console.log('   David:    davidwilliams / customer123');
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
