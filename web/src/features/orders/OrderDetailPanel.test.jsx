import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import OrderDetailPanel from './OrderDetailPanel';
import { OrderStatus } from '../../constants/orderStatuses';

const notifyArrivalMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    notifyArrival: notifyArrivalMock,
  }),
}));

const baseOrder = {
  id: 123,
  userId: 5,
  status: OrderStatus.READY_FOR_PICKUP,
  deliveryMethod: 'CURBSIDE',
  paymentMethod: 'IN_STORE',
  total: 45.0,
  createdAt: '2026-06-03T12:00:00Z',
  deliveryAddress: 'CURBSIDE: Silver Camry',
  items: [
    { id: 1, productId: 101, quantity: 2, price: 22.5, voided: false }
  ],
  user: {
    id: 5,
    username: 'customer-one',
    phoneNumber: '555-111-2222'
  }
};

const defaultProps = {
  order: baseOrder,
  onClose: vi.fn(),
  canDeleteOrder: false,
  products: [{ id: 101, name: 'Sour Diesel', price: 22.5 }],
  canModifyOrders: false,
  isEditing: false,
  onToggleEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  addingItemToOrderId: null,
  newItemProductId: '',
  setNewItemProductId: vi.fn(),
  newItemQuantity: 1,
  setNewItemQuantity: vi.fn(),
  onAddItem: vi.fn(),
  onCancelAddItem: vi.fn(),
  onStartAddItem: vi.fn(),
  editingStatusId: null,
  onStartEditStatus: vi.fn(),
  onStatusChange: vi.fn(),
  onCancelStatusEdit: vi.fn(),
  updateOrderStatus: vi.fn(),
  onQuickAction: vi.fn(),
  onVoidItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onDeleteOrder: vi.fn(),
  onPrintReceipt: vi.fn(),
  showConfirmDialog: vi.fn(),
  getProductName: (id) => 'Sour Diesel',
  getStatusIcon: () => null,
  getStatusClass: () => 'status-pickup',
  getStatusLabel: (s) => s,
  formatOrderDate: (d) => new Date(d).toLocaleDateString(),
  getNextStatusActions: () => [],
  navigate: vi.fn()
};

describe('OrderDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders curbside pickup header and vehicle details', () => {
    render(<OrderDetailPanel {...defaultProps} canModifyOrders={true} />);

    expect(screen.getByText('Curbside Pickup')).toBeInTheDocument();
    expect(screen.getByText('Vehicle Info:')).toBeInTheDocument();
    expect(screen.getByText('Silver Camry')).toBeInTheDocument();
  });

  it('renders standard pickup address when method is PICKUP', () => {
    const pickupOrder = {
      ...baseOrder,
      deliveryMethod: 'PICKUP',
      deliveryAddress: 'Store Pickup'
    };
    render(<OrderDetailPanel {...defaultProps} order={pickupOrder} canModifyOrders={true} />);

    expect(screen.getByText('Pickup')).toBeInTheDocument();
    expect(screen.queryByText('Vehicle Info:')).not.toBeInTheDocument();
  });

  it('renders and allows clicking the "I\'m Here" button for customer curbside pickup order when ready', async () => {
    render(<OrderDetailPanel {...defaultProps} canModifyOrders={false} />);

    const arriveButton = screen.getByRole('button', { name: /i'm here/i });
    expect(arriveButton).toBeInTheDocument();

    fireEvent.click(arriveButton);
    expect(notifyArrivalMock).toHaveBeenCalledWith(123, 'Arrived');

    await waitFor(() => {
      expect(arriveButton).not.toBeDisabled();
    });
  });

  it('renders check-in confirmed banner for customer curbside order when status is ARRIVED', () => {
    const arrivedOrder = {
      ...baseOrder,
      status: OrderStatus.ARRIVED
    };
    render(<OrderDetailPanel {...defaultProps} order={arrivedOrder} canModifyOrders={false} />);

    expect(screen.queryByRole('button', { name: /i'm here/i })).not.toBeInTheDocument();
    expect(screen.getByText(/check-in confirmed/i)).toBeInTheDocument();
  });

});
