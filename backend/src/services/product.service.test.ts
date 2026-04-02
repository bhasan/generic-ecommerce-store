const prismaMock = {
  productItem: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  category: {
    findUnique: vi.fn(),
  },
  review: {
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
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

describe('product service logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs createProduct start and completion', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 2 });
    prismaMock.productItem.create.mockResolvedValue({
      id: 10,
      categoryId: 2,
      hidden: false,
    });
    const { ProductService } = await import('./product.service');
    const service = new ProductService();

    const result = await service.createProduct({
      name: 'Test Product',
      categoryId: 2,
      price: 9.99,
    });

    expect(logger.info).toHaveBeenCalledWith('Creating product', expect.objectContaining({
      name: 'Test Product',
      categoryId: 2,
    }));
    expect(logger.info).toHaveBeenCalledWith('Product created', expect.objectContaining({
      productId: 10,
    }));
    expect(result.id).toBe(10);
  });

  it('logs product deletion without changing message', async () => {
    prismaMock.productItem.findUnique.mockResolvedValue({
      id: 10,
      name: 'Test Product',
      categoryId: 2,
    });
    prismaMock.productItem.delete.mockResolvedValue({});
    const { ProductService } = await import('./product.service');
    const service = new ProductService();

    const result = await service.deleteProduct(10);

    expect(logger.info).toHaveBeenCalledWith('Deleting product', expect.objectContaining({
      productId: 10,
      name: 'Test Product',
    }));
    expect(result).toEqual({ message: 'Product deleted successfully' });
  });
});
