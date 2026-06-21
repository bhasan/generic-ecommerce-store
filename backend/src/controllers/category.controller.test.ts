import { describe, it, expect, beforeEach, vi } from 'vitest';
import categoryController from './category.controller';
import categoryService from '../services/category.service';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}));

vi.mock('../services/category.service', () => ({
  default: {
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
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

describe('category controller logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on createCategory validation failure', async () => {
    (validationResult as any).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'name required' }],
    });
    const req: any = { user: { userId: 5 }, requestId: 'req-1' };
    const res = createResponse();

    await categoryController.createCategory(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs delete request and preserves response shape', async () => {
    (categoryService.deleteCategory as any).mockResolvedValue({ message: 'Category deleted successfully' });
    const req: any = { params: { id: '8' }, user: { userId: 5 }, requestId: 'req-2' };
    const res = createResponse();

    await categoryController.deleteCategory(req, res as any, vi.fn());

    expect(logger.info).toHaveBeenCalledWith('Category delete requested', expect.objectContaining({
      actorUserId: 5,
      targetCategoryId: 8,
    }));
    expect(res.json).toHaveBeenCalledWith({ message: 'Category deleted successfully' });
  });
});
