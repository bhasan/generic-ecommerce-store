export const DeliveryMethod = {
  DELIVERY: 'DELIVERY',
  PICKUP: 'PICKUP',
  CURBSIDE: 'CURBSIDE',
} as const;

export const PaymentMethod = {
  EXTERNAL: 'EXTERNAL',
  STORE_CREDIT: 'STORE_CREDIT',
  IN_STORE: 'IN_STORE',
  CC: 'CC',
} as const;
