import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OrdersPage from './OrdersPage';
import { ROLES } from '../../utils/roles';

// Mock sub-views
vi.mock('./AdminOrdersView', () => ({
  default: () => <div data-testid="admin-orders-view" />,
}));

vi.mock('./CustomerOrdersView', () => ({
  default: () => <div data-testid="customer-orders-view" />,
}));

const useAppMock = vi.hoisted(() => vi.fn());
vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

const makeAppState = (overrides = {}) => ({
  currentUser: { id: 1, username: 'customer-user', roles: [ROLES.CUSTOMER] },
  ...overrides,
});

describe('OrdersPage Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders CustomerOrdersView when user has only CUSTOMER role', () => {
    useAppMock.mockReturnValue(makeAppState({
      currentUser: { id: 1, username: 'cust', roles: [ROLES.CUSTOMER] }
    }));

    render(<OrdersPage />);
    expect(screen.getByTestId('customer-orders-view')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-orders-view')).not.toBeInTheDocument();
  });

  it('renders AdminOrdersView when user has EMPLOYEE role', () => {
    useAppMock.mockReturnValue(makeAppState({
      currentUser: { id: 1, username: 'emp', roles: [ROLES.EMPLOYEE, ROLES.CUSTOMER] }
    }));

    render(<OrdersPage />);
    expect(screen.getByTestId('admin-orders-view')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-orders-view')).not.toBeInTheDocument();
  });

  it('renders CustomerOrdersView when forceCustomerView prop is true even if user is ADMIN', () => {
    useAppMock.mockReturnValue(makeAppState({
      currentUser: { id: 1, username: 'admin', roles: [ROLES.ADMIN] }
    }));

    render(<OrdersPage forceCustomerView={true} />);
    expect(screen.getByTestId('customer-orders-view')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-orders-view')).not.toBeInTheDocument();
  });
});
