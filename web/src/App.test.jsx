import React from 'react';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { renderWithProviders } from './test/renderWithProviders';
import { GUEST_USER, ROLES } from './utils/roles';

let appState;

vi.mock('./context/AppContext', () => ({
  AppProvider: ({ children }) => <>{children}</>,
  useApp: () => appState,
}));

vi.mock('./components/common/AnnouncementBanner', () => ({ default: () => <div>AnnouncementBanner</div> }));
vi.mock('./components/common/OrderPickupNotice', () => ({ default: () => <div>OrderPickupNotice</div> }));
vi.mock('./components/layout/Navbar', () => ({ default: () => <div>Navbar</div> }));
vi.mock('./components/common/Notification', () => ({ default: () => <div>Notification</div> }));
vi.mock('./components/common/ErrorBoundary', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('./components/common/TawkToWidget', () => ({ default: () => null }));
vi.mock('./features/auth/LoginPage', () => ({ default: () => <div>LoginPage</div> }));
vi.mock('./features/auth/RegisterPage', () => ({ default: () => <div>RegisterPage</div> }));
vi.mock('./features/products/ProductsPage', () => ({ default: ({ mode }) => <div>{mode === 'manage' ? 'ManageProductsPage' : 'ProductsPage'}</div> }));
vi.mock('./features/products/ProductItemPage', () => ({ default: () => <div>ProductItemPage</div> }));
vi.mock('./features/cart/CartPage', () => ({ default: () => <div>CartPage</div> }));
vi.mock('./features/cart/CheckoutPage', () => ({ default: () => <div>CheckoutPage</div> }));
vi.mock('./features/cart/OrderSuccessPage', () => ({ default: () => <div>OrderSuccessPage</div> }));
vi.mock('./features/orders/OrdersPage', () => ({ default: () => <div>OrdersPage</div> }));
vi.mock('./features/profile/ProfilePage', () => ({ default: () => <div>ProfilePage</div> }));
vi.mock('./features/dashboard/DashboardPage', () => ({ default: () => <div>DashboardPage</div> }));
vi.mock('./features/credits/StoreCreditPage', () => ({ default: () => <div>StoreCreditPage</div> }));
vi.mock('./features/delivery/DeliveryDriverDashboard', () => ({ default: () => <div>DeliveryDriverDashboard</div> }));
vi.mock('./features/orders/OrderHistoryPage', () => ({ default: () => <div>OrderHistoryPage</div> }));
vi.mock('./features/help/HelpPage', () => ({ default: () => <div>HelpPage</div> }));

describe('App routing and global behaviors', () => {
  let scrollToSpy;

  beforeEach(() => {
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    appState = {
      currentUser: GUEST_USER,
      setReturnPath: vi.fn(),
      notification: null,
      closeNotification: vi.fn(),
    };
  });

  afterEach(() => {
    scrollToSpy.mockRestore();
  });

  it('scrolls to the top on initial render', () => {
    renderWithProviders(<App />, { route: '/dashboard' });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('renders the order pickup notice globally', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('OrderPickupNotice')).toBeInTheDocument();
  });

  it('redirects guests to login for protected routes and stores the return path', () => {
    renderWithProviders(<App />, { route: '/products' });
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(appState.setReturnPath).toHaveBeenCalledWith('/products');
  });

  it('allows management users to access the dashboard route', () => {
    appState.currentUser = { id: 3, username: 'manager-one', roles: [ROLES.MANAGEMENT] };
    renderWithProviders(<App />, { route: '/dashboard' });
    expect(screen.getByText('DashboardPage')).toBeInTheDocument();
  });

  it('redirects unauthorized staff from admin-only dashboard routes back to products', () => {
    appState.currentUser = { id: 2, username: 'employee-one', roles: [ROLES.EMPLOYEE] };
    renderWithProviders(<App />, { route: '/dashboard' });
    expect(screen.getByText('ProductsPage')).toBeInTheDocument();
  });
});
