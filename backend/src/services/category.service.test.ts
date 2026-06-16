import { describe, it, expect, beforeEach, vi } from 'vitest';
const prismaMock = {
  category: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  productItem: {
    count: vi.fn(),
  },
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('category service logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs category creation start and completion', async () => {
    prismaMock.category.create.mockResolvedValue({ id: 3, name: 'Cigars', parentId: null });
    const { CategoryService } = await import('./category.service');
    const service = new CategoryService();

    const result = await service.createCategory({ name: 'Cigars' });

    expect(logger.info).toHaveBeenCalledWith('Creating category', expect.objectContaining({ name: 'Cigars' }));
    expect(logger.info).toHaveBeenCalledWith('Category created', expect.objectContaining({ categoryId: 3 }));
    expect(result.id).toBe(3);
  });

  it('logs category deletion without changing message', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 3, name: 'Cigars', parentId: null });
    prismaMock.category.count.mockResolvedValue(0);
    prismaMock.productItem.count.mockResolvedValue(0);
    prismaMock.category.delete.mockResolvedValue({});
    const { CategoryService } = await import('./category.service');
    const service = new CategoryService();

    const result = await service.deleteCategory(3);

    expect(logger.info).toHaveBeenCalledWith('Deleting category', expect.objectContaining({ categoryId: 3 }));
    expect(result).toEqual({ message: 'Category deleted successfully' });
  });
});
