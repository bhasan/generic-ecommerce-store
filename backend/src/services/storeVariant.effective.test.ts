import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { resolveVariantEffective } from './storeVariant.effective';

const D = (n: number) => new Prisma.Decimal(n);
const base = { basePrice: D(10), stock: D(5), stockEnabled: true, active: true };

describe('resolveVariantEffective', () => {
  const cases: Array<[string, any, any, boolean, { price: number; stock: number; active: boolean; available: boolean }]> = [
    ['default store, no override → variant values', base, undefined, true,  { price: 10, stock: 5, active: true, available: true }],
    ['non-default store, no override → out of stock', base, undefined, false, { price: 10, stock: 0, active: true, available: false }],
    ['override stock only', base, { stock: D(3), priceOverride: null, activeOverride: null }, false, { price: 10, stock: 3, active: true, available: true }],
    ['override price', base, { stock: D(3), priceOverride: D(8), activeOverride: null }, false, { price: 8, stock: 3, active: true, available: true }],
    ['override hides variant', base, { stock: D(3), priceOverride: null, activeOverride: false }, false, { price: 10, stock: 3, active: false, available: false }],
    ['stock disabled → available regardless of stock', { ...base, stockEnabled: false }, undefined, false, { price: 10, stock: 0, active: true, available: true }],
  ];

  it.each(cases)('%s', (_n, v, o, isDef, expected) => {
    expect(resolveVariantEffective(v, o, isDef)).toEqual(expected);
  });
});
