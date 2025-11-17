export const initialProducts = [
  { 
    id: 1, 
    name: 'Wireless Headphones', 
    category: 'Electronics', 
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
  },
  { 
    id: 2, 
    name: 'Smart Watch', 
    category: 'Electronics', 
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
  },
  { 
    id: 3, 
    name: 'Laptop Bag', 
    category: 'Accessories', 
    price: 49.99, 
    description: 'Durable laptop bag with multiple compartments', 
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
    images: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400'
    ],
    stock: 20,
    stockEnabled: true,
    hidden: false
  },
  { 
    id: 4, 
    name: 'USB-C Cable', 
    category: 'Accessories', 
    price: 14.99, 
    description: 'Fast charging USB-C cable', 
    image: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400',
    images: [
      'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400'
    ],
    stock: 0,
    stockEnabled: false, // Stock tracking disabled for this item
    hidden: false
  },
];

export const initialOrders = [
  { 
    id: 1, 
    userId: 2, 
    status: 'PENDING', 
    total: 99.99, 
    items: [
      { productId: 1, quantity: 1, price: 99.99 }
    ], 
    createdAt: '2024-11-10' 
  },
  { 
    id: 2, 
    userId: 2, 
    status: 'APPROVED', 
    total: 249.98, 
    items: [
      { productId: 2, quantity: 1, price: 199.99 }, 
      { productId: 4, quantity: 1, price: 14.99 }
    ], 
    createdAt: '2024-11-09' 
  },
];