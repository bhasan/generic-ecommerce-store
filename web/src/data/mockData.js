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
    hidden: false,
    reviews: [
      {
        id: 1,
        userId: 2,
        userName: 'johncustomer',
        rating: 5,
        comment: 'Amazing sound quality! The noise cancellation is fantastic. Best headphones I have ever owned.',
        date: '2024-11-10',
        helpful: 12,
        notHelpful: 1,
        flagged: false,
        replies: []
      },
      {
        id: 2,
        userId: 3,
        userName: 'sarahjohnson',
        rating: 4,
        comment: 'Very comfortable for long listening sessions. Battery life is impressive. Only minor issue is the Bluetooth range could be better.',
        date: '2024-11-08',
        helpful: 8,
        notHelpful: 0,
        flagged: false,
        replies: []
      },
      {
        id: 3,
        userId: 4,
        userName: 'mikethompson',
        rating: 5,
        comment: 'Perfect for work from home! The noise cancellation helps me focus. Highly recommend!',
        date: '2024-11-05',
        helpful: 15,
        notHelpful: 2,
        flagged: false,
        replies: []
      }
    ]
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
    hidden: false,
    reviews: [
      {
        id: 1,
        userId: 2,
        userName: 'johncustomer',
        rating: 4,
        comment: 'Great health tracking features. Sleep monitoring is accurate. Would give 5 stars if battery lasted longer.',
        date: '2024-11-12',
        helpful: 5,
        notHelpful: 0,
        flagged: false,
        replies: []
      },
      {
        id: 2,
        userId: 5,
        userName: 'emilychen',
        rating: 5,
        comment: 'Love this watch! All the features I need for fitness tracking. The heart rate monitor is very accurate.',
        date: '2024-11-09',
        helpful: 10,
        notHelpful: 1,
        flagged: false,
        replies: []
      }
    ]
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
    hidden: false,
    reviews: [
      {
        id: 1,
        userId: 6,
        userName: 'davidwilliams',
        rating: 5,
        comment: 'Perfect size for my 15-inch laptop. Great quality materials and lots of pockets for organization.',
        date: '2024-11-11',
        helpful: 7,
        notHelpful: 0,
        flagged: false,
        replies: []
      }
    ]
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
    hidden: false,
    reviews: []
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