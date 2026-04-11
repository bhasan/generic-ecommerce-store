const prismaMock = {
  productItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
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

describe('VIP product filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  const makeProduct = (overrides = {}) => ({
    id: 1,
    name: 'Test Product',
    categoryId: 1,
    price: 9.99,
    hidden: false,
    vipOnly: false,
    category: { id: 1, sortOrder: 0, parent: null },
    ...overrides,
  });

  describe('getAllProducts', () => {
    it('excludes vipOnly products for users with no roles', async () => {
      prismaMock.productItem.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts([]);

      expect(prismaMock.productItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false, vipOnly: false } })
      );
    });

    it('excludes vipOnly products for CUSTOMER role', async () => {
      prismaMock.productItem.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['CUSTOMER']);

      expect(prismaMock.productItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false, vipOnly: false } })
      );
    });

    it('includes vipOnly products but excludes hidden for VIP role', async () => {
      prismaMock.productItem.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['VIP']);

      expect(prismaMock.productItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false } })
      );
    });

    it('includes all products (hidden + vipOnly) for ADMIN role', async () => {
      prismaMock.productItem.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['ADMIN']);

      expect(prismaMock.productItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('includes all products for MANAGEMENT role', async () => {
      prismaMock.productItem.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['MANAGEMENT']);

      expect(prismaMock.productItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('getProductById', () => {
    it('throws 404 for vipOnly product when user has no roles', async () => {
      prismaMock.productItem.findUnique.mockResolvedValue(makeProduct({ vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, [])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 404 for vipOnly product when user is CUSTOMER', async () => {
      prismaMock.productItem.findUnique.mockResolvedValue(makeProduct({ vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, ['CUSTOMER'])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns vipOnly product for VIP user', async () => {
      const product = makeProduct({ vipOnly: true });
      prismaMock.productItem.findUnique.mockResolvedValue(product);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      const result = await service.getProductById(1, ['VIP']);
      expect(result.id).toBe(1);
    });

    it('throws 404 for hidden+vipOnly product even for VIP user', async () => {
      prismaMock.productItem.findUnique.mockResolvedValue(makeProduct({ hidden: true, vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, ['VIP'])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns hidden+vipOnly product for ADMIN', async () => {
      const product = makeProduct({ hidden: true, vipOnly: true });
      prismaMock.productItem.findUnique.mockResolvedValue(product);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      const result = await service.getProductById(1, ['ADMIN']);
      expect(result.id).toBe(1);
    });
  });

  describe('updateProduct', () => {
    it('passes vipOnly field through to Prisma update', async () => {
      prismaMock.productItem.findUnique.mockResolvedValue(makeProduct());
      prismaMock.productItem.update.mockResolvedValue(makeProduct({ vipOnly: true }));
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.updateProduct(1, { vipOnly: true });

      expect(prismaMock.productItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vipOnly: true }) })
      );
    });
  });
});

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
