import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

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
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent category not found', 400);
      }
    }

    const normalizedAllowedQuantities = this.normalizeAllowedQuantities(data.allowedQuantities);
    const normalizedQuantityDiscounts = this.normalizeQuantityDiscounts(data.quantityDiscounts);

    return prisma.category.create({
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
  }

  async updateCategory(id: number, data: UpdateCategoryData) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found', 404);
    }

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

    return prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        parent: true,
        children: true
      }
    });
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

    await prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }
}

export default new CategoryService();
