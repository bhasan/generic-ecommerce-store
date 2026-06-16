// Mirrors the ProtectedRoute roles in web/src/App.jsx.
// Unauthorized-but-authenticated users are redirected to /products (confirmed in ProtectedRoute.jsx).

export type Role = 'admin' | 'manager' | 'employee' | 'customer' | 'driver';

export interface RouteEntry {
  path: string;
  // Roles that should have access (using our seed account role keys)
  allowed: Role[];
  // Stable text/landmark to assert when access is granted
  landmark: string;
}

export const UNAUTHORIZED_REDIRECT = '/products';

export const ROUTES: RouteEntry[] = [
  {
    path: '/',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'Products',
  },
  {
    path: '/products',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'Products',
  },
  {
    path: '/cart',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'Cart',
  },
  {
    path: '/profile',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'Profile',
  },
  {
    path: '/my-orders',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'My Orders',
  },
  {
    path: '/orders',
    allowed: ['admin', 'manager', 'employee', 'customer'],
    landmark: 'Orders',
  },
  {
    path: '/help',
    allowed: ['admin', 'manager', 'employee', 'customer', 'driver'],
    landmark: 'Help',
  },
  {
    path: '/manage-products',
    allowed: ['admin', 'manager'],
    landmark: 'Manage',
  },
  {
    path: '/dashboard',
    allowed: ['admin', 'manager'],
    landmark: 'Dashboard',
  },
  {
    path: '/store-credit',
    allowed: ['admin', 'manager'],
    landmark: 'Store Credit',
  },
  {
    path: '/order-history',
    allowed: ['admin'],
    landmark: 'Order History',
  },
  {
    path: '/website-management',
    allowed: ['admin'],
    landmark: 'Website',
  },
  {
    path: '/delivery-dashboard',
    allowed: ['admin', 'manager', 'driver'],
    landmark: 'Delivery',
  },
];
