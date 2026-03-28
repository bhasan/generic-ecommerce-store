import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { RoleName, hasAnyRole } from '../constants/roles';
import { deleteUploadedFile, collectProductImageUrls } from '../utils/fileUtils';

interface CreateProductData {
  name: string;
  categoryId: number;
  price: number;
  description?: string;
  thumbnail?: string;
  image?: string;
  images?: string[];
  stock?: number;
  stockEnabled?: boolean;
  hidden?: boolean;
  sortOrder?: number;
  cardSize?: string;
  allowedQuantitiesOverride?: number[];
  quantityDiscountsOverride?: Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
}

interface UpdateProductData {
  name?: string;
  categoryId?: number;
  price?: number;
  description?: string;
  thumbnail?: string;
  image?: string;
  images?: string[];
  stock?: number;
  stockEnabled?: boolean;
  hidden?: boolean;
  sortOrder?: number;
  cardSize?: string;
  allowedQuantitiesOverride?: number[];
  quantityDiscountsOverride?: Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
}

export class ProductService {
  private normalizeCategoryId(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return Number.isFinite(parsed as number) ? (parsed as number) : undefined;
  }

  private normalizeAllowedQuantities(value: unknown): number[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? parseFloat(entry) : entry))
      .filter((entry) => Number.isFinite(entry as number))
      .map((entry) => Number(entry));
    return Array.from(new Set(normalized)).sort((a, b) => a - b);
  }

  private normalizeQuantityDiscounts(
    value: unknown
  ): Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }> | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const quantity = Number((entry as any).quantity);
        const type = (entry as any).type;
        const discountValue = Number((entry as any).value);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        if (type !== 'percent' && type !== 'fixed') return null;
        if (!Number.isFinite(discountValue) || discountValue < 0) return null;
        if (type === 'percent' && discountValue > 100) return null;
        return { quantity, type, value: discountValue };
      })
      .filter(Boolean) as Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
    const deduped = Array.from(
      new Map(normalized.map((rule) => [`${rule.quantity}:${rule.type}`, rule])).values()
    );
    return deduped.sort((a, b) => a.quantity - b.quantity);
  }

  /**
   * Get all products (filters hidden products for non-admin users)
   */
  async getAllProducts(userRoles?: RoleName[]) {
    const canViewHidden = hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT']);
    const where = canViewHidden ? {} : { hidden: false };

    const products = await prisma.productItem.findMany({
      where,
      include: {
        category: {
          include: { parent: true }
        }
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ]
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
      select: { id: true, username: true }
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
      where: { id },
      include: {
        category: {
          include: { parent: true }
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

    // Fetch reviews with users
    const reviews = await prisma.review.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' }
    });

    const userIds = [...new Set(reviews.map(r => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true }
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
    const categoryId = this.normalizeCategoryId(data.categoryId);
    if (!categoryId) {
      throw new AppError('Category is required', 400);
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new AppError('Category not found', 400);
    }

    const normalizedAllowedQuantities = this.normalizeAllowedQuantities(data.allowedQuantitiesOverride);
    const normalizedQuantityDiscounts = this.normalizeQuantityDiscounts(data.quantityDiscountsOverride);

    return await prisma.productItem.create({
      data: {
        ...data,
        categoryId,
        images: data.images || [],
        ...(normalizedAllowedQuantities !== undefined
          ? { allowedQuantitiesOverride: normalizedAllowedQuantities }
          : {}),
        ...(normalizedQuantityDiscounts !== undefined
          ? { quantityDiscountsOverride: normalizedQuantityDiscounts }
          : {})
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
      'name', 'categoryId', 'price', 'description',
      'thumbnail', 'image', 'images', 'stock', 'stockEnabled', 'hidden',
      'sortOrder', 'cardSize', 'allowedQuantitiesOverride', 'quantityDiscountsOverride'
    ];

    const normalizedCategoryId = this.normalizeCategoryId(data.categoryId);
    if (data.categoryId !== undefined) {
      if (!normalizedCategoryId) {
        throw new AppError('Category is invalid', 400);
      }
      const category = await prisma.category.findUnique({ where: { id: normalizedCategoryId } });
      if (!category) {
        throw new AppError('Category not found', 400);
      }
    }

    const filteredData: Partial<UpdateProductData> = {};
    for (const key of allowedFields) {
      if (key in data && data[key] !== undefined) {
        if (key === 'categoryId') {
          (filteredData as any)[key] = normalizedCategoryId;
        } else if (key === 'allowedQuantitiesOverride') {
          (filteredData as any)[key] = this.normalizeAllowedQuantities(data[key]) ?? [];
        } else if (key === 'quantityDiscountsOverride') {
          (filteredData as any)[key] = this.normalizeQuantityDiscounts(data[key]) ?? [];
        } else {
          (filteredData as any)[key] = data[key];
        }
      }
    }

    const updated = await prisma.productItem.update({
      where: { id },
      data: filteredData
    });

    // Clean up any upload URLs that were removed from this product
    const oldUrls = collectProductImageUrls(product);
    const newUrls = collectProductImageUrls(updated);
    const removedUrls = oldUrls.filter((u) => !newUrls.includes(u));
    if (removedUrls.length > 0) {
      const orphaned = await this.getOrphanedUrls(id, removedUrls);
      await Promise.all(orphaned.map((url) => deleteUploadedFile(url)));
    }

    return updated;
  }

  /**
   * Returns upload URLs from a product that are not referenced by any other product.
   */
  private async getOrphanedUrls(excludeId: number, urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];

    const others = await prisma.productItem.findMany({
      where: { id: { not: excludeId } },
      select: { thumbnail: true, image: true, images: true }
    });

    const usedElsewhere = new Set<string>();
    for (const p of others) {
      for (const u of collectProductImageUrls(p)) {
        usedElsewhere.add(u);
      }
    }

    return urls.filter((u) => !usedElsewhere.has(u));
  }

  /**
   * Delete a product (Admin only)
   */
  async deleteProduct(id: number) {
    const product = await prisma.productItem.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const urlsToCheck = collectProductImageUrls(product);
    await prisma.productItem.delete({ where: { id } });

    const orphaned = await this.getOrphanedUrls(id, urlsToCheck);
    await Promise.all(orphaned.map((url) => deleteUploadedFile(url)));

    return { message: 'Product deleted successfully' };
  }
}

export default new ProductService();
