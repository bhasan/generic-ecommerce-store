import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { Role, OrderStatus } from '../generated/prisma';

async function seed() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (optional - comment out if you want to keep existing data)
  console.log('🧹 Cleaning existing data...');
  await prisma.cartItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('👥 Creating users...');
  
  const adminPassword = await hashPassword('admin123');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      password: adminPassword,
      name: 'Admin User',
      role: Role.ADMIN
    }
  });

  const managerPassword = await hashPassword('manager123');
  const manager = await prisma.user.create({
    data: {
      email: 'manager@test.com',
      password: managerPassword,
      name: 'Jane Manager',
      role: Role.MANAGEMENT
    }
  });

  const customerPassword = await hashPassword('customer123');
  const customer = await prisma.user.create({
    data: {
      email: 'customer@test.com',
      password: customerPassword,
      name: 'John Customer',
      role: Role.CUSTOMER
    }
  });

  console.log('✅ Users created');
  console.log('   Admin:', admin.email, '/ admin123');
  console.log('   Manager:', manager.email, '/ manager123');
  console.log('   Customer:', customer.email, '/ customer123');

  // Create products
  console.log('📦 Creating products...');

  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Premium Vape Pen',
        category: 'Vaporizers',
        price: 49.99,
        description: 'High-quality rechargeable vape pen with temperature control',
        image: 'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=400',
        images: [
          'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=400',
          'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=400'
        ],
        stock: 50,
        stockEnabled: true,
        hidden: false
      }
    }),
    prisma.product.create({
      data: {
        name: 'Glass Water Pipe',
        category: 'Glass',
        price: 89.99,
        description: 'Handcrafted borosilicate glass water pipe with ice catcher',
        image: 'https://images.unsplash.com/photo-1585662016823-080a0d84a4ec?w=400',
        images: [
          'https://images.unsplash.com/photo-1585662016823-080a0d84a4ec?w=400',
          'https://images.unsplash.com/photo-1585662016823-080a0d84a4ec?w=400'
        ],
        stock: 25,
        stockEnabled: true,
        hidden: false
      }
    }),
    prisma.product.create({
      data: {
        name: 'Rolling Papers - King Size',
        category: 'Accessories',
        price: 4.99,
        description: 'Premium slow-burning rolling papers, 32 leaves per pack',
        image: 'https://images.unsplash.com/photo-1565313797544-c42f8c5ec6ca?w=400',
        images: [
          'https://images.unsplash.com/photo-1565313797544-c42f8c5ec6ca?w=400'
        ],
        stock: 200,
        stockEnabled: true,
        hidden: false
      }
    }),
    prisma.product.create({
      data: {
        name: 'Herb Grinder',
        category: 'Accessories',
        price: 24.99,
        description: 'Aluminum 4-piece grinder with pollen catcher',
        image: 'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=400',
        images: [
          'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=400'
        ],
        stock: 75,
        stockEnabled: true,
        hidden: false
      }
    }),
    prisma.product.create({
      data: {
        name: 'CBD Oil - 1000mg',
        category: 'CBD Products',
        price: 59.99,
        description: 'Full-spectrum CBD oil, 30ml bottle',
        image: 'https://images.unsplash.com/photo-1605543667908-92c15e27e0e8?w=400',
        images: [
          'https://images.unsplash.com/photo-1605543667908-92c15e27e0e8?w=400'
        ],
        stock: 40,
        stockEnabled: true,
        hidden: false
      }
    })
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create sample reviews
  console.log('⭐ Creating reviews...');

  await prisma.review.create({
    data: {
      userId: customer.id,
      productId: products[0].id,
      rating: 5,
      comment: 'Amazing vape pen! Great vapor quality and battery life.',
      helpful: 3,
      notHelpful: 0,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  await prisma.review.create({
    data: {
      userId: manager.id,
      productId: products[1].id,
      rating: 4,
      comment: 'Beautiful piece, very well made. Highly recommend!',
      helpful: 5,
      notHelpful: 1,
      votedByHelpful: [],
      votedByNotHelpful: []
    }
  });

  console.log('✅ Reviews created');

  // Create sample orders
  console.log('🛒 Creating orders...');

  const order1 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.PENDING,
      total: 54.98,
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            price: products[0].price
          },
          {
            productId: products[2].id,
            quantity: 1,
            price: products[2].price
          }
        ]
      }
    }
  });

  const order2 = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.DELIVERED,
      total: 89.99,
      items: {
        create: [
          {
            productId: products[1].id,
            quantity: 1,
            price: products[1].price
          }
        ]
      }
    }
  });

  console.log('✅ Orders created');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log(`   Users: ${3}`);
  console.log(`   Products: ${products.length}`);
  console.log(`   Orders: ${2}`);
  console.log('');
  console.log('🔐 Test Accounts:');
  console.log('   Admin:    admin@test.com / admin123');
  console.log('   Manager:  manager@test.com / manager123');
  console.log('   Customer: customer@test.com / customer123');
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
