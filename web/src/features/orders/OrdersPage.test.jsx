import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from './OrdersPage';
import { ROLES } from '../../utils/roles';

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

vi.mock('../../components/common/HeaderDivider', () => ({
  default: () => <div data-testid="header-divider" />,
}));

vi.mock('./OrderDetailPanel', () => ({
  default: ({ order, onClose, onQuickAction }) => (
    <div>
      <div>Order Detail Panel #{order.id}</div>
      <button onClick={() => onQuickAction(order.id, 'APPROVED')}>Approve from Panel</button>
      <button onClick={onClose}>Close Panel</button>
    </div>
  ),
}));

const baseAppState = {
  currentUser: { id: 1, username: 'manager-one', roles: [ROLES.MANAGEMENT] },
  orders: [
    {
      id: 701,
      userId: 9,
      status: 'PENDING',
      total: 42.5,
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:00.000Z',
      user: { username: 'customer-one', cashapp: '$customer-one', phoneNumber: '555-0100', address: '101 Example Ave' },
      items: [{ id: 1, productId: 101, quantity: 2, price: 21.25, voided: false }],
    },
    {
      id: 702,
      userId: 11,
      status: 'APPROVED',
      total: 20,
      createdAt: '2026-04-01T11:00:00.000Z',
      updatedAt: '2026-04-01T11:00:00.000Z',
      user: { username: 'customer-two', cashapp: '$customer-two' },
      items: [{ id: 2, productId: 102, quantity: 1, price: 20, voided: false }],
    },
  ],
  products: [
    { id: 101, name: 'Blue Dream', price: 21.25 },
    { id: 102, name: 'Sour Diesel', price: 20 },
  ],
  isLoadingOrders: false,
  loadOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  deleteOrder: vi.fn(),
  addItemToOrder: vi.fn(),
  voidOrderItem: vi.fn(),
  deleteOrderItem: vi.fn(),
  restoreOrder: vi.fn(),
};

const renderOrdersPage = () =>
  render(
    <MemoryRouter initialEntries={['/orders']}>
      <OrdersPage />
    </MemoryRouter>
  );

describe('OrdersPage integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
  });

  it('renders kanban columns and refreshes orders on load', async () => {
    renderOrdersPage();

    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Pending (1)')).toBeInTheDocument();
    expect(screen.getByText('Approved (1)')).toBeInTheDocument();
    await waitFor(() => expect(baseAppState.loadOrders).toHaveBeenCalled());
  });

  it('updates selected status filters and hides unchecked columns', () => {
    renderOrdersPage();

    fireEvent.click(screen.getByLabelText(/approved \(1\)/i));

    expect(screen.getAllByText('Approved (1)')).toHaveLength(1);
    expect(screen.getByText('Pending (1)')).toBeInTheDocument();
  });

  it('opens the detail panel and routes quick actions back through updateOrderStatus', async () => {
    renderOrdersPage();

    fireEvent.click(screen.getAllByRole('button', { name: /view details/i })[0]);
    expect(screen.getByText('Order Detail Panel #701')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Approve from Panel'));

    await waitFor(() => expect(baseAppState.updateOrderStatus).toHaveBeenCalledWith(701, 'APPROVED'));
  });
});
