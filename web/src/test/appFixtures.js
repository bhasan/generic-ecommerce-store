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
  { id: 101, name: 'Blue Dream', price: 12.5, category: { allowedQuantities: [1, 2] }, reviews: [] },
];

export const sampleCategories = [
  { id: 201, name: 'Flower', allowedQuantities: [1, 2] },
];

export const sampleOrders = [
  { id: 301, status: 'PENDING', items: [{ id: 1, productId: 101, quantity: 1 }] },
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
