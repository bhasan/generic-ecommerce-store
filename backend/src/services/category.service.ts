import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface CreateCategoryData {
  name: string;
  description?: string;
  parentId?: number | null;
  sortOrder?: number;
  allowedQuantities?: number[];
  quantityDiscounts?: Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
}

interface UpdateCategoryData {
  name?: string;
  description?: string;
  parentId?: number | null;
  sortOrder?: number;
  allowedQuantities?: number[];
  quantityDiscounts?: Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
}

export class CategoryService {
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

  async getAllCategories() {
    return prisma.category.findMany({
      include: {
        parent: true,
        children: true
      },
      orderBy: [
        { parentId: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });
  }

  async createCategory(data: CreateCategoryData) {
    // Category logs intentionally capture hierarchy/sort metadata because those
    // are the fields most likely to cause "catalog looks wrong" reports later.
    logger.info('Creating category', {
      name: data.name,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
    });
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent category not found', 400);
      }
    }

    const normalizedAllowedQuantities = this.normalizeAllowedQuantities(data.allowedQuantities);
    const normalizedQuantityDiscounts = this.normalizeQuantityDiscounts(data.quantityDiscounts);

    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
        ...(normalizedAllowedQuantities !== undefined
          ? { allowedQuantities: normalizedAllowedQuantities }
          : {}),
        ...(normalizedQuantityDiscounts !== undefined
          ? { quantityDiscounts: normalizedQuantityDiscounts }
          : {})
      },
      include: {
        parent: true,
        children: true
      }
    });
    logger.info('Category created', {
      categoryId: category.id,
      parentId: category.parentId ?? null,
      name: category.name,
    });
    return category;
  }

  async updateCategory(id: number, data: UpdateCategoryData) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    // Parent/sort snapshots are logged before validation so failures can still
    // be explained when a malformed admin request never reaches prisma.update.
    logger.info('Updating category', {
      categoryId: id,
      previousParentId: existing.parentId ?? null,
      previousSortOrder: existing.sortOrder,
      fields: Object.keys(data),
    });

    if (data.parentId === id) {
      throw new AppError('Category cannot be its own parent', 400);
    }

    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent category not found', 400);
      }
    }

    const normalizedAllowedQuantities = this.normalizeAllowedQuantities(data.allowedQuantities);
    const normalizedQuantityDiscounts = this.normalizeQuantityDiscounts(data.quantityDiscounts);
    const updateData = {
      ...data,
      parentId: data.parentId ?? null,
      ...(data.allowedQuantities !== undefined
        ? { allowedQuantities: normalizedAllowedQuantities ?? [] }
        : {}),
      ...(data.quantityDiscounts !== undefined
        ? { quantityDiscounts: normalizedQuantityDiscounts ?? [] }
        : {})
    };

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        parent: true,
        children: true
      }
    });
    logger.info('Category updated', {
      categoryId: id,
      parentId: category.parentId ?? null,
      sortOrder: category.sortOrder,
      name: category.name,
    });
    return category;
  }

  async deleteCategory(id: number) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    const childCount = await prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new AppError('Cannot delete category with subcategories', 400);
    }

    const productCount = await prisma.productItem.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new AppError('Cannot delete category with assigned products', 400);
    }

    // Deletion logs are especially useful here because categories can be blocked
    // by child/product references and those constraints are not obvious from UI.
    logger.info('Deleting category', {
      categoryId: id,
      name: existing.name,
      parentId: existing.parentId ?? null,
    });
    await prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }
}

export default new CategoryService();
