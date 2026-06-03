import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from './OrdersPage';

// Mock window.scrollTo since it's not implemented in JSDOM
window.scrollTo = vi.fn();
import { ROLES } from '../../utils/roles';

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
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

const makeAppState = (overrides = {}) => ({
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
  ...overrides,
});

const baseAppState = makeAppState();

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
    expect(screen.getByText('Prep Orders (1)')).toBeInTheDocument();
    await waitFor(() => expect(baseAppState.loadOrders).toHaveBeenCalled());
  });

  it('does not create an extra OrdersPage polling interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    renderOrdersPage();
    const orderPollingIntervals = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 60000);
    expect(orderPollingIntervals).toHaveLength(0);
    setIntervalSpy.mockRestore();
  });

  it('updates selected status filters and hides unchecked columns', () => {
    renderOrdersPage();

    fireEvent.click(screen.getByLabelText(/prep orders \(1\)/i));

    expect(screen.getAllByText('Prep Orders (1)')).toHaveLength(1);
    expect(screen.getByText('Pending (1)')).toBeInTheDocument();
  });

  it('opens the detail panel and routes quick actions back through updateOrderStatus', async () => {
    renderOrdersPage();

    fireEvent.click(screen.getAllByRole('button', { name: /view details/i })[0]);
    expect(screen.getByText('Order Detail Panel #701')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Approve from Panel'));

    await waitFor(() => expect(baseAppState.updateOrderStatus).toHaveBeenCalledWith(701, 'APPROVED'));
  });

  it('shows the specialized "Take Payment in Store" dialog for in-store pickup orders', async () => {
    const pickupOrder = {
      id: 801,
      userId: 12,
      status: 'READY_FOR_PICKUP',
      total: 55.5,
      deliveryMethod: 'PICKUP',
      paymentMethod: 'IN_STORE',
      user: { username: 'test-user' },
      items: [{ id: 3, productId: 101, quantity: 1, price: 55.5, voided: false }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    useAppMock.mockReturnValue(makeAppState({ orders: [pickupOrder] }));
    renderOrdersPage();

    const card = screen.getByText('#801').closest('.kanban-card');
    fireEvent.click(within(card).getByText('Picked Up'));

    expect(screen.getByText('Take Payment in Store')).toBeInTheDocument();
    expect(screen.getByText(/Order Total: \$55\.50/i)).toBeInTheDocument();
    expect(screen.getByText('Paid')).toHaveClass('variant-success');
  });

  it('filters orders by fuzzy search query across multiple fields', async () => {
    const searchAppState = makeAppState({
      orders: [
        { id: 901, user: { username: 'Alice', cashapp: '$alice123' }, status: 'PENDING', total: 10, items: [], createdAt: new Date().toISOString() },
        { id: 902, user: { username: 'Bob', phoneNumber: '555-9999' }, status: 'PENDING', total: 20, items: [], createdAt: new Date().toISOString() }
      ]
    });
    useAppMock.mockReturnValue(searchAppState);
    renderOrdersPage();

    const searchInput = screen.getByPlaceholderText(/search id, customer, phone/i);
    
    // Search by username
    fireEvent.change(searchInput, { target: { value: 'Alice' } });
    expect(screen.getByText('#901')).toBeInTheDocument();
    expect(screen.queryByText('#902')).not.toBeInTheDocument();

    // Search by phone partial
    fireEvent.change(searchInput, { target: { value: '9999' } });
    expect(screen.queryByText('#901')).not.toBeInTheDocument();
    expect(screen.getByText('#902')).toBeInTheDocument();

    // Search by ID
    fireEvent.change(searchInput, { target: { value: '901' } });
    expect(screen.getByText('#901')).toBeInTheDocument();
    expect(screen.queryByText('#902')).not.toBeInTheDocument();
  });

  it('correctly handles search query with address and case-insensitivity', async () => {
    const addressAppState = makeAppState({
      orders: [
        { id: 1001, user: { username: 'Charlie', address: '123 Main St' }, status: 'PENDING', total: 10, items: [], createdAt: new Date().toISOString() },
        { id: 1002, user: { username: 'Delta', address: '456 Oak Ave' }, status: 'PENDING', total: 20, items: [], createdAt: new Date().toISOString() }
      ]
    });
    useAppMock.mockReturnValue(addressAppState);
    renderOrdersPage();

    const searchInput = screen.getByPlaceholderText(/search id, customer, phone/i);
    
    // Search by partial address (lowercase)
    fireEvent.change(searchInput, { target: { value: 'main' } });
    expect(screen.getByText('#1001')).toBeInTheDocument();
    expect(screen.queryByText('#1002')).not.toBeInTheDocument();

    // Verify search works across active status filters
    // Initially both Charlie and Delta are shown. Search "Delta".
    fireEvent.change(searchInput, { target: { value: 'DELTA' } });
    expect(screen.queryByText('#1001')).not.toBeInTheDocument();
    expect(screen.getByText('#1002')).toBeInTheDocument();
  });

  it('shows empty state message when search returns no results', async () => {
    renderOrdersPage();
    const searchInput = screen.getByPlaceholderText(/search id, customer, phone/i);
    
    fireEvent.change(searchInput, { target: { value: 'nonexistent_order_search' } });
    
    expect(screen.getByText(/no orders found/i)).toBeInTheDocument();
    expect(screen.queryByText('#701')).not.toBeInTheDocument();
    expect(screen.queryByText('#702')).not.toBeInTheDocument();
  });
});

describe('OrdersPage — DOM structure (CSS mobile targets)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
  });

  it('page root has .orders-page-container class', () => {
    const { container } = renderOrdersPage();
    expect(container.querySelector('.orders-page-container')).toBeTruthy();
  });

  it('header has .orders-header class with a title and an actions section', () => {
    const { container } = renderOrdersPage();
    const header = container.querySelector('.orders-header');
    expect(header).toBeTruthy();
    expect(header.querySelector('.orders-header-actions')).toBeTruthy();
  });

  it('refresh button has .btn-refresh-orders class', () => {
    const { container } = renderOrdersPage();
    expect(container.querySelector('.btn-refresh-orders')).toBeTruthy();
  });

  it('kanban columns container has .kanban-columns class', () => {
    const { container } = renderOrdersPage();
    expect(container.querySelector('.kanban-columns')).toBeTruthy();
  });

  it('status filter bar has .orders-status-filters class', () => {
    const { container } = renderOrdersPage();
    expect(container.querySelector('.orders-status-filters')).toBeTruthy();
  });
});

describe('OrdersPage — customer role', () => {
  const customerId = 9;
  const customerAppState = makeAppState({
    currentUser: { id: customerId, username: 'customer-one', roles: [ROLES.CUSTOMER] },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(customerAppState);
  });

  it('shows "My Orders" title instead of "Orders"', () => {
    renderOrdersPage();

    expect(screen.getByText('My Orders')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Orders' })).not.toBeInTheDocument();
  });

  it('only shows the order belonging to the logged-in customer', () => {
    renderOrdersPage();

    // Order 701 belongs to userId 9 (this customer) — should appear in the list view
    expect(screen.getByText('Order #701')).toBeInTheDocument();
    // Order 702 belongs to userId 11 (different customer) — should not appear
    expect(screen.queryByText('Order #702')).not.toBeInTheDocument();
  });

  it('does not render any quick-action buttons for customers', () => {
    // Quick-action buttons are only shown when canModifyOrders is true (staff/management).
    // Customers have read-only access to their own orders.
    const { container } = renderOrdersPage();
    expect(container.querySelectorAll('.btn-quick-action-compact')).toHaveLength(0);
  });

  it('renders the "View details" button on the customer order card', () => {
    renderOrdersPage();
    expect(screen.getAllByRole('button', { name: /view details/i }).length).toBeGreaterThan(0);
  });

  it('opens the detail panel when the customer clicks "View details"', () => {
    renderOrdersPage();

    fireEvent.click(screen.getAllByRole('button', { name: /view details/i })[0]);

    expect(screen.getByText('Order Detail Panel #701')).toBeInTheDocument();
  });

  it('closes the detail panel', () => {
    renderOrdersPage();

    fireEvent.click(screen.getAllByRole('button', { name: /view details/i })[0]);
    fireEvent.click(screen.getByText('Close Panel'));

    expect(screen.queryByText('Order Detail Panel #701')).not.toBeInTheDocument();
  });
});
