import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { RoleName, hasAnyRole } from '../constants/roles';

interface CreateProductData {
  name: string;
  category: string;
  price: number;
  description?: string;
  image?: string;
  images?: string[];
  stock?: number;
  stockEnabled?: boolean;
  hidden?: boolean;
}

interface UpdateProductData {
  name?: string;
  category?: string;
  price?: number;
  description?: string;
  image?: string;
  images?: string[];
  stock?: number;
  stockEnabled?: boolean;
  hidden?: boolean;
}

export class ProductService {
  /**
   * Get all products (filters hidden products for non-admin users)
   */
  async getAllProducts(userRoles?: RoleName[]) {
    const canViewHidden = hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT']);
    const where = canViewHidden ? {} : { hidden: false };

    const products = await prisma.productItem.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch reviews with users for each product
    const productIds = products.map(p => p.id);
    const reviews = await prisma.review.findMany({
      where: { productId: { in: productIds } },
      orderBy: { createdAt: 'desc' }
    });

    const userIds = [...new Set(reviews.map(r => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });

    // Join reviews with users and attach to products
    const userMap = new Map(users.map(u => [u.id, u]));
    const reviewsByProduct = new Map<number, any[]>();
    
    for (const review of reviews) {
      if (!reviewsByProduct.has(review.productId)) {
        reviewsByProduct.set(review.productId, []);
      }
      reviewsByProduct.get(review.productId)!.push({
        ...review,
        user: userMap.get(review.userId) || null
      });
    }

    return products.map(product => ({
      ...product,
      reviews: reviewsByProduct.get(product.id) || []
    }));
  }

  /**
   * Get a single product by ID
   */
  async getProductById(id: number, userRoles?: RoleName[]) {
    const product = await prisma.productItem.findUnique({
      where: { id }
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Check if product is hidden and user is not admin/management
    if (product.hidden && !hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT'])) {
      throw new AppError('Product not found', 404);
    }

    // Fetch reviews with users
    const reviews = await prisma.review.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' }
    });

    const userIds = [...new Set(reviews.map(r => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });

    const userMap = new Map(users.map(u => [u.id, u]));
    const reviewsWithUsers = reviews.map(review => ({
      ...review,
      user: userMap.get(review.userId) || null
    }));

    return {
      ...product,
      reviews: reviewsWithUsers
    };
  }

  /**
   * Create a new product (Management/Admin only)
   */
  async createProduct(data: CreateProductData) {
    return await prisma.productItem.create({
      data: {
        ...data,
        images: data.images || []
      }
    });
  }

  /**
   * Update a product (Management/Admin only)
   */
  async updateProduct(id: number, data: UpdateProductData) {
    const product = await prisma.productItem.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Filter out non-updatable fields (reviews, id, createdAt, updatedAt, etc.)
    const allowedFields: (keyof UpdateProductData)[] = [
      'name', 'category', 'price', 'description', 
      'image', 'images', 'stock', 'stockEnabled', 'hidden'
    ];
    
    const filteredData: Partial<UpdateProductData> = {};
    for (const key of allowedFields) {
      if (key in data && data[key] !== undefined) {
        (filteredData as any)[key] = data[key];
      }
    }

    return await prisma.productItem.update({
      where: { id },
      data: filteredData
    });
  }

  /**
   * Delete a product (Admin only)
   */
  async deleteProduct(id: number) {
    const product = await prisma.productItem.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    await prisma.productItem.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }
}

export default new ProductService();
