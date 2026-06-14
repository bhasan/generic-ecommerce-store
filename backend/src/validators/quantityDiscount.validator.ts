import { body, ValidationChain } from 'express-validator';

export function quantityDiscountValidators(fieldPath: string): ValidationChain[] {
  return [
    body(`${fieldPath}.*.quantity`).optional().isFloat({ min: 0.0000001 }),
    body(`${fieldPath}.*.type`).optional().isIn(['percent', 'fixed']),
    body(`${fieldPath}.*.value`).optional().isFloat({ min: 0 }),
    body(fieldPath).optional().custom((value) => {
      if (!Array.isArray(value)) return true;
      for (const rule of value) {
        if (rule?.type === 'percent' && typeof rule.value === 'number' && rule.value > 100) {
          throw new Error('Percent discounts cannot exceed 100');
        }
      }
      return true;
    }),
  ];
}
