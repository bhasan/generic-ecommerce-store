import productController from './product.controller';
import productService from '../services/product.service';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}));

vi.mock('../services/product.service', () => ({
  default: {
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const createResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

describe('product controller logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on createProduct validation failure', async () => {
    (validationResult as any).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'name required' }],
    });
    const req: any = { user: { userId: 3 }, requestId: 'req-1' };
    const res = createResponse();

    await productController.createProduct(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs delete request and preserves response shape', async () => {
    (productService.deleteProduct as any).mockResolvedValue({ message: 'Product deleted successfully' });
    const req: any = { params: { id: '4' }, user: { userId: 3 }, requestId: 'req-2' };
    const res = createResponse();

    await productController.deleteProduct(req, res as any, vi.fn());

    expect(logger.info).toHaveBeenCalledWith('Product delete requested', expect.objectContaining({
      actorUserId: 3,
      targetProductId: 4,
    }));
    expect(res.json).toHaveBeenCalledWith({ message: 'Product deleted successfully' });
  });
});
