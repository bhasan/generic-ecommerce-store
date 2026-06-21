import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface CreateCategoryData {
  name: string;
  description?: string;
  parentId?: number | null;
  sortOrder?: number;
}

interface UpdateCategoryData {
  name?: string;
  description?: string;
  parentId?: number | null;
  sortOrder?: number;
}

export class CategoryService {
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

    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
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

    const updateData = {
      ...data,
      parentId: data.parentId ?? null,
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

    const productCount = await prisma.product.count({ where: { categoryId: id } });
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
