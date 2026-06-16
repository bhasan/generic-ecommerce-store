import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma';
import {
  resolveUnitPrice,
  resolveLineTotal,
  getAllowedQuantities,
  isQuantityAllowed,
} from './pricing';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('pricing', () => {
  describe('resolveUnitPrice', () => {
    it('returns basePrice when there are no price breaks', () => {
      expect(resolveUnitPrice({ basePrice: D(10) }, 5).toNumber()).toBe(10);
    });

    it('picks the break with the largest minQuantity <= quantity', () => {
      const variant = {
        basePrice: D(10),
        priceBreaks: [
          { minQuantity: D(3), unitPrice: D(9) },
          { minQuantity: D(7), unitPrice: D(8) },
          { minQuantity: D(14), unitPrice: D(7) },
        ],
      };
      expect(resolveUnitPrice(variant, 1).toNumber()).toBe(10); // below all breaks -> base
      expect(resolveUnitPrice(variant, 3).toNumber()).toBe(9);
      expect(resolveUnitPrice(variant, 6).toNumber()).toBe(9);
      expect(resolveUnitPrice(variant, 7).toNumber()).toBe(8);
      expect(resolveUnitPrice(variant, 20).toNumber()).toBe(7);
    });

    it('handles fractional (weight) quantities at the boundary', () => {
      const variant = { basePrice: D(40), priceBreaks: [{ minQuantity: D(3.5), unitPrice: D(35) }] };
      expect(resolveUnitPrice(variant, 3.5).toNumber()).toBe(35);
      expect(resolveUnitPrice(variant, 3.49).toNumber()).toBe(40);
    });

    it('keeps money exact (no float drift)', () => {
      expect(resolveLineTotal({ basePrice: D('19.99') }, 3).toString()).toBe('59.97');
    });
  });

  describe('isQuantityAllowed', () => {
    it('allows any positive quantity for UNIT variants (no options)', () => {
      expect(isQuantityAllowed({ basePrice: D(5) }, 1)).toBe(true);
      expect(isQuantityAllowed({ basePrice: D(5) }, 4)).toBe(true);
      expect(isQuantityAllowed({ basePrice: D(5) }, 0)).toBe(false);
      expect(isQuantityAllowed({ basePrice: D(5) }, -2)).toBe(false);
    });

    it('restricts to the option set for WEIGHT variants', () => {
      const variant = {
        basePrice: D(40),
        quantityOptions: [{ quantity: D(1) }, { quantity: D(3.5) }, { quantity: D(7) }],
      };
      expect(isQuantityAllowed(variant, 3.5)).toBe(true);
      expect(isQuantityAllowed(variant, 2)).toBe(false);
      expect(getAllowedQuantities(variant)).toEqual([1, 3.5, 7]);
    });
  });
});

