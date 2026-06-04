export const DeliveryMethod = {
  DELIVERY: 'DELIVERY',
  PICKUP: 'PICKUP',
  CURBSIDE: 'CURBSIDE',
} as const;

export type DeliveryMethodValue = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

export const PaymentMethod = {
  EXTERNAL: 'EXTERNAL',
  CREDIT: 'CREDIT',
  IN_STORE: 'IN_STORE',
} as const;

export type PaymentMethodValue = (typeof PaymentMethod)[keyof typeof PaymentMethod];
