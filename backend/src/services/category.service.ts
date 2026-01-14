import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

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
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent category not found', 400);
      }
    }

    return prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0
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

    return prisma.category.update({
      where: { id },
      data: {
        ...data,
        parentId: data.parentId ?? null
      },
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
