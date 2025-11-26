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

    return await prisma.product.findMany({
      where,
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Get a single product by ID
   */
  async getProductById(id: number, userRoles?: RoleName[]) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Check if product is hidden and user is not admin/management
    if (product.hidden && !hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT'])) {
      throw new AppError('Product not found', 404);
    }

    return product;
  }

  /**
   * Create a new product (Management/Admin only)
   */
  async createProduct(data: CreateProductData) {
    return await prisma.product.create({
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
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    return await prisma.product.update({
      where: { id },
      data
    });
  }

  /**
   * Delete a product (Admin only)
   */
  async deleteProduct(id: number) {
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    await prisma.product.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }
}

export default new ProductService();
