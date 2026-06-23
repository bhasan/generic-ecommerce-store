import { GUEST_USER, ROLES } from '../utils/roles';

export const users = {
  guest: GUEST_USER,
  customer: { id: 1, username: 'customer-one', roles: [ROLES.CUSTOMER], cashapp: '$customer-one' },
  employee: { id: 2, username: 'employee-one', roles: [ROLES.EMPLOYEE] },
  management: { id: 3, username: 'manager-one', roles: [ROLES.MANAGEMENT] },
  admin: { id: 4, username: 'admin-one', roles: [ROLES.ADMIN] },
  driver: { id: 5, username: 'driver-one', roles: [ROLES.DELIVERY_DRIVER] },
};

export const sampleProducts = [
  {
    id: 101,
    name: 'Blue Dream',
    images: [],
    variants: [
      {
        id: 1001,
        label: 'Default',
        basePrice: 12.5,
        stock: 10,
        stockEnabled: true,
        isDefault: true,
        active: true,
        pricingMode: 'UNIT',
        quantityOptions: [{ quantity: 1, sortOrder: 0 }, { quantity: 2, sortOrder: 1 }],
        priceBreaks: [],
      },
    ],
    category: { name: 'Flower' },
    reviews: [],
  },
];

export const sampleCategories = [
  { id: 201, name: 'Flower' },
];

export const sampleOrders = [
  {
    id: 301,
    status: 'PENDING',
    items: [{ id: 1, variantId: 1001, productId: 101, productName: 'Blue Dream', variantLabel: 'Default', quantity: 1 }],
  },
];

export const sampleConfig = {
  taxRate: 0.0825,
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  deliveryRadiusMiles: 5,
  pickupLocation: '101 Example Ave',
  storeCashappUsername: '$SmokeStationHQ',
  paymentSettings: {
    cashapp: { enabled: true, handle: '$SmokeStationHQ' },
    zelle: { enabled: false, handle: '' },
    venmo: { enabled: false, handle: '' },
  },
  storeSettings: {
    name: 'Smoke Station',
    address: '101 Example Ave',
    phoneNumber: '555-0100',
  },
  featuredProductIds: [101],
  promotions: [{ url: '/api/uploads/promo.webp', description: 'Summer sale' }],
};
