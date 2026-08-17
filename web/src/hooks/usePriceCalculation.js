import { getDiscountedUnitPrice } from '../features/products/productsHelpers';

function usePriceCalculation(variant, quantity) {
  const basePrice = Number(variant?.basePrice ?? 0);
  const unitPrice = variant ? getDiscountedUnitPrice(variant, quantity) : basePrice;
  const totalPrice = unitPrice * quantity;
  const originalTotal = basePrice * quantity;
  const hasDiscount = unitPrice < basePrice;
  const savings = originalTotal - totalPrice;

  return { basePrice, unitPrice, totalPrice, originalTotal, hasDiscount, savings };
}

export default usePriceCalculation;
