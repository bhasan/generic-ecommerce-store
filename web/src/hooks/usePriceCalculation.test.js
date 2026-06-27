import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import usePriceCalculation from './usePriceCalculation';

vi.mock('../features/products/productsHelpers', () => ({
  getDiscountedUnitPrice: vi.fn((v, q) => Number(v.priceBreaks?.[0]?.unitPrice ?? v.basePrice)),
}));

describe('usePriceCalculation', () => {
  it('returns zeros when variant is null', () => {
    const { result } = renderHook(() => usePriceCalculation(null, 1));
    expect(result.current).toEqual({
      basePrice: 0,
      unitPrice: 0,
      totalPrice: 0,
      originalTotal: 0,
      hasDiscount: false,
      savings: 0,
    });
  });

  it('returns no discount when priceBreaks is empty', () => {
    const variant = { basePrice: '10', priceBreaks: [] };
    const { result } = renderHook(() => usePriceCalculation(variant, 1));
    expect(result.current.hasDiscount).toBe(false);
    expect(result.current.unitPrice).toBe(result.current.basePrice);
  });

  it('returns discount when priceBreak applies', () => {
    const variant = { basePrice: '10', priceBreaks: [{ minQty: 1, unitPrice: '8' }] };
    const { result } = renderHook(() => usePriceCalculation(variant, 2));
    expect(result.current.hasDiscount).toBe(true);
    expect(result.current.unitPrice).toBeLessThan(result.current.basePrice);
  });
});
