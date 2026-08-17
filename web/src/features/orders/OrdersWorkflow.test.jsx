import React from 'react';
import { act, fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from './OrdersPage';
import { ROLES } from '../../utils/roles';
import { OrderStatus } from '../../constants/orderStatuses';

const useAppMock = vi.hoisted(() => vi.fn());

// Mock window.scrollTo since it's not implemented in JSDOM
window.scrollTo = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../components/common/HeaderDivider', () => ({
  default: () => <div data-testid="header-divider" />,
}));

const makeAppState = (orders = []) => ({
  currentUser: { id: 1, username: 'manager-one', roles: [ROLES.MANAGEMENT] },
  orders,
  products: [{ id: 101, name: 'Test Product', price: 10 }],
  isLoadingOrders: false,
  loadOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
});

const renderOrdersPage = () =>
  render(
    <MemoryRouter initialEntries={['/orders']}>
      <OrdersPage />
    </MemoryRouter>
  );

const clickAndFlush = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

describe('Orders Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Delivery Flow', () => {
    it('handles the full delivery lifecycle from Pending to Delivered', async () => {
      const order = {
        id: 1001,
        userId: 5,
        status: OrderStatus.PENDING,
        total: 10,
        deliveryMethod: 'DELIVERY',
        paymentMethod: 'EXTERNAL',
        user: { username: 'delivery-customer' },
        items: [{ id: 1, productId: 101, quantity: 1, price: 10, voided: false }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const appState = makeAppState([order]);
      useAppMock.mockReturnValue(appState);

      renderOrdersPage();

      // 1. Verify Pending state
      const card = screen.getByText('#1001').closest('.kanban-card');
      expect(within(card).getByText('Verify Payment')).toBeInTheDocument();
      expect(within(card).getByText('Delivery')).toBeInTheDocument();
      
      const approveBtn = within(card).getByText('Approve (Payment Verified)');
      await clickAndFlush(approveBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(1001, OrderStatus.APPROVED);

      // 2. Simulate Approved (Prep Order) state
      order.status = OrderStatus.APPROVED;
      cleanup();
      renderOrdersPage();
      
      const prepCard = screen.getByText('#1001').closest('.kanban-card');
      expect(within(prepCard).getByText('Paid')).toBeInTheDocument();
      const readyBtn = within(prepCard).getByText('Ready for Delivery');
      await clickAndFlush(readyBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(1001, OrderStatus.READY_FOR_DELIVERY);

      // 3. Simulate Ready for Delivery state
      order.status = OrderStatus.READY_FOR_DELIVERY;
      cleanup();
      renderOrdersPage();
      
      const readyCard = screen.getByText('#1001').closest('.kanban-card');
      const deliverBtn = within(readyCard).getByText('In Delivery');
      await clickAndFlush(deliverBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(1001, OrderStatus.OUT_FOR_DELIVERY);

      // 4. Simulate Out for Delivery state
      order.status = OrderStatus.OUT_FOR_DELIVERY;
      cleanup();
      renderOrdersPage();
      
      const outCard = screen.getByText('#1001').closest('.kanban-card');
      const completeBtn = within(outCard).getByText('Delivered');
      await clickAndFlush(completeBtn);
      
      // Should show confirmation dialog
      expect(screen.getByText('Mark as Delivered')).toBeInTheDocument();
      await clickAndFlush(screen.getByText('Confirm'));
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(1001, OrderStatus.DELIVERED);
    });
  });

  describe('Pickup Flow', () => {
    it('handles the pickup lifecycle and shows payment reminder', async () => {
      const order = {
        id: 2001,
        userId: 6,
        status: OrderStatus.APPROVED, // Starts at Approved for In-Store Pickup
        total: 20,
        deliveryMethod: 'PICKUP',
        paymentMethod: 'IN_STORE',
        user: { username: 'pickup-customer' },
        items: [{ id: 2, productId: 101, quantity: 2, price: 10, voided: false }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const appState = makeAppState([order]);
      useAppMock.mockReturnValue(appState);

      renderOrdersPage();

      // 1. Verify Prep Order (Approved) state
      const card = screen.getByText('#2001').closest('.kanban-card');
      expect(within(card).getByText('Pay in Store')).toBeInTheDocument();
      expect(within(card).getByText('Pickup')).toBeInTheDocument();
      
      const readyBtn = within(card).getByText('Ready for Pickup');
      await clickAndFlush(readyBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(2001, OrderStatus.READY_FOR_PICKUP);

      // 2. Simulate Ready for Pickup state
      order.status = OrderStatus.READY_FOR_PICKUP;
      cleanup();
      renderOrdersPage();
      
      const readyCard = screen.getByText('#2001').closest('.kanban-card');
      const pickedUpBtn = within(readyCard).getByText('Picked Up');
      await clickAndFlush(pickedUpBtn);

      // 3. Verify Payment Reminder in confirmation dialog
      expect(screen.getByText('Take Payment in Store')).toBeInTheDocument();
      expect(screen.getByText(/Order Total: \$20\.00/i)).toBeInTheDocument();
      expect(screen.getByText(/REMINDER: Please ensure payment has been collected/i)).toBeInTheDocument();
      
      const paidBtn = screen.getByText('Paid');
      expect(paidBtn).toHaveClass('variant-success');
      await clickAndFlush(paidBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(2001, OrderStatus.PICKED_UP);
    });

    it('handles the curbside pickup lifecycle including check-in status (Arrived)', async () => {
      const order = {
        id: 2002,
        userId: 7,
        status: OrderStatus.APPROVED,
        total: 15,
        deliveryMethod: 'CURBSIDE',
        paymentMethod: 'IN_STORE',
        deliveryAddress: 'CURBSIDE: Silver Toyota Camry',
        user: { username: 'curbside-customer' },
        items: [{ id: 3, productId: 101, quantity: 1, price: 15, voided: false }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const appState = makeAppState([order]);
      useAppMock.mockReturnValue(appState);

      renderOrdersPage();

      // 1. Verify Prep Order (Approved) state with curbside details
      const card = screen.getByText('#2002').closest('.kanban-card');
      expect(within(card).getByText('Curbside')).toBeInTheDocument();
      expect(within(card).getByText('Silver Toyota Camry')).toBeInTheDocument();
      
      const readyBtn = within(card).getByText('Ready for Pickup');
      await clickAndFlush(readyBtn);
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(2002, OrderStatus.READY_FOR_PICKUP);

      // 2. Simulate customer arrival (Transitions to ARRIVED and appends spot)
      order.status = OrderStatus.ARRIVED;
      order.deliveryAddress = 'CURBSIDE: Silver Toyota Camry | SPOT: Space 4';
      cleanup();
      renderOrdersPage();

      const arrivedCard = screen.getByText('#2002').closest('.kanban-card');
      expect(arrivedCard).toHaveClass('kanban-card-arrived');
      expect(within(arrivedCard).getByText('Silver Toyota Camry | SPOT: Space 4')).toBeInTheDocument();

      // Verify next quick action to complete order is Picked Up
      const pickedUpBtn = within(arrivedCard).getByText('Picked Up');
      await clickAndFlush(pickedUpBtn);

      // Confirm in dialog
      expect(screen.getByText('Take Payment in Store')).toBeInTheDocument();
      await clickAndFlush(screen.getByText('Paid'));
      expect(appState.updateOrderStatus).toHaveBeenCalledWith(2002, OrderStatus.PICKED_UP);
    });
  });

  describe('Badge Logic', () => {
    it('shows Verify Payment for pending external payments', () => {
      const order = {
        id: 3001,
        status: OrderStatus.PENDING,
        paymentMethod: 'EXTERNAL',
        deliveryMethod: 'DELIVERY',
        user: { username: 'test' },
        total: 10,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      useAppMock.mockReturnValue(makeAppState([order]));
      renderOrdersPage();
      expect(screen.getByText('Verify Payment')).toBeInTheDocument();
    });

    it('shows Paid for Store Credit even when pending', () => {
      const order = {
        id: 3002,
        status: OrderStatus.PENDING,
        paymentMethod: 'STORE_CREDIT',
        deliveryMethod: 'DELIVERY',
        user: { username: 'test' },
        total: 10,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      useAppMock.mockReturnValue(makeAppState([order]));
      renderOrdersPage();
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });
  });
});
