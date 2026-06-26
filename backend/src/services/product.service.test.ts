import { describe, it, expect, beforeEach, vi } from 'vitest';

const prismaMock = {
  product: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  productImage: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  productVariant: {
    update: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
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
  $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock)),
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
    slug: 'test-product',
    categoryId: 1,
    hidden: false,
    vipOnly: false,
    category: { id: 1, sortOrder: 0, parent: null },
    images: [],
    variants: [],
    ...overrides,
  });

  describe('getAllProducts', () => {
    it('excludes vipOnly products for users with no roles', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts([]);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false, vipOnly: false } })
      );
    });

    it('excludes vipOnly products for CUSTOMER role', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['CUSTOMER']);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false, vipOnly: false } })
      );
    });

    it('includes vipOnly products but excludes hidden for VIP role', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['VIP']);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hidden: false } })
      );
    });

    it('includes all products (hidden + vipOnly) for ADMIN role', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['ADMIN']);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('includes all products for MANAGEMENT role', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts(['MANAGEMENT']);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('does not query reviews (feature disabled)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts([]);

      expect(prismaMock.review.findMany).not.toHaveBeenCalled();
    });

    it('returns empty reviews array per product while feature is disabled', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        { id: 1, name: 'Cola', categoryId: 1, category: { id: 1, sortOrder: 0, parent: null } },
      ]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      const products = await service.getAllProducts([]);

      expect(products[0].reviews).toEqual([]);
    });

    it('passes limit and offset to Prisma when provided', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts([], 10, 20);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 })
      );
    });

    it('omits take/skip from Prisma query when limit and offset are not provided', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.getAllProducts([]);

      const call = prismaMock.product.findMany.mock.calls[0][0];
      expect(call).not.toHaveProperty('take');
      expect(call).not.toHaveProperty('skip');
    });
  });

  describe('getProductById', () => {
    it('throws 404 for vipOnly product when user has no roles', async () => {
      prismaMock.product.findUnique.mockResolvedValue(makeProduct({ vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, [])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 404 for vipOnly product when user is CUSTOMER', async () => {
      prismaMock.product.findUnique.mockResolvedValue(makeProduct({ vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, ['CUSTOMER'])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns vipOnly product for VIP user', async () => {
      const product = makeProduct({ vipOnly: true });
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.review.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      const result = await service.getProductById(1, ['VIP']);
      expect(result.id).toBe(1);
    });

    it('throws 404 for hidden+vipOnly product even for VIP user', async () => {
      prismaMock.product.findUnique.mockResolvedValue(makeProduct({ hidden: true, vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await expect(service.getProductById(1, ['VIP'])).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns hidden+vipOnly product for ADMIN', async () => {
      const product = makeProduct({ hidden: true, vipOnly: true });
      prismaMock.product.findUnique.mockResolvedValue(product);
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
      prismaMock.product.findUnique
        .mockResolvedValueOnce(makeProduct())                       // initial load
        .mockResolvedValueOnce(makeProduct({ vipOnly: true }));     // final include in tx
      prismaMock.product.update.mockResolvedValue(makeProduct({ vipOnly: true }));
      const { ProductService } = await import('./product.service');
      const service = new ProductService();

      await service.updateProduct(1, { vipOnly: true });

      expect(prismaMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vipOnly: true }) })
      );
    });
  });
});

describe('searchProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('translates guest roles to visibility filter and delegates to SearchService', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    vi.doMock('./search/postgres.search.service', () => ({
      PostgresSearchService: vi.fn(() => ({ searchProducts: mockSearch })),
    }));

    const { ProductService } = await import('./product.service');
    const service = new ProductService();
    await service.searchProducts(undefined, 'kush', { limit: 25, offset: 0 });

    expect(mockSearch).toHaveBeenCalledWith(
      { includeHidden: false, includeVipOnly: false },
      'kush',
      { limit: 25, offset: 0 },
    );
  });

  it('translates ADMIN roles to full visibility (includeHidden: true, includeVipOnly: true)', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    vi.doMock('./search/postgres.search.service', () => ({
      PostgresSearchService: vi.fn(() => ({ searchProducts: mockSearch })),
    }));

    const { ProductService } = await import('./product.service');
    const service = new ProductService();
    await service.searchProducts(['ADMIN'], 'kush', { limit: 10, offset: 0 });

    expect(mockSearch).toHaveBeenCalledWith(
      { includeHidden: true, includeVipOnly: true },
      'kush',
      { limit: 10, offset: 0 },
    );
  });

  it('translates VIP roles to includeHidden: false, includeVipOnly: true', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    vi.doMock('./search/postgres.search.service', () => ({
      PostgresSearchService: vi.fn(() => ({ searchProducts: mockSearch })),
    }));

    const { ProductService } = await import('./product.service');
    const service = new ProductService();
    await service.searchProducts(['VIP'], 'kush', { limit: 10, offset: 0 });

    expect(mockSearch).toHaveBeenCalledWith(
      { includeHidden: false, includeVipOnly: true },
      'kush',
      { limit: 10, offset: 0 },
    );
  });
});

describe('product service logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs createProduct start and completion', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 2 });
    prismaMock.product.findUnique.mockResolvedValue(null); // slug uniqueness check
    prismaMock.product.create.mockResolvedValue({
      id: 10,
      categoryId: 2,
      hidden: false,
      variants: [{ id: 1 }],
    });
    const { ProductService } = await import('./product.service');
    const service = new ProductService();

    const result = await service.createProduct({
      name: 'Test Product',
      categoryId: 2,
      variants: [{ label: 'Default', basePrice: 9.99 }],
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
    prismaMock.product.findUnique.mockResolvedValue({
      id: 10,
      name: 'Test Product',
      categoryId: 2,
      images: [],
    });
    prismaMock.product.delete.mockResolvedValue({});
    prismaMock.productImage.findMany.mockResolvedValue([]);
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
