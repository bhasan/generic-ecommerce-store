import { describe, it, expect } from 'vitest';
import { successResponse, listResponse } from './responseEnvelope';

describe('successResponse', () => {
  it('wraps data without a message key when message is omitted', () => {
    const result = successResponse({ id: 1 });
    expect(result).toEqual({ success: true, data: { id: 1 } });
    expect('message' in result).toBe(false);
  });

  it('includes message when provided', () => {
    const result = successResponse({ id: 1 }, 'Created');
    expect(result).toEqual({ success: true, message: 'Created', data: { id: 1 } });
  });
});

describe('listResponse', () => {
  it('wraps an array with meta', () => {
    const result = listResponse([1, 2], { count: 2, limit: 10, offset: 0 });
    expect(result).toEqual({ success: true, data: [1, 2], meta: { count: 2, limit: 10, offset: 0 } });
  });
});
