import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock react-router-dom navigate
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// HeaderDivider has no meaningful output to assert on
vi.mock('../../components/common/HeaderDivider', () => ({ default: () => null }));

const mockNotifyArrival = vi.hoisted(() => vi.fn());
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    notifyArrival: mockNotifyArrival
  })
}));

const PRODUCTS = [
  { id: 1, name: 'Blue Dream', price: 15 },
  { id: 2, name: 'OG Kush', price: 20 },
  { id: 3, name: 'Sour Diesel', price: 18 },
  { id: 4, name: 'Purple Haze', price: 22 },
];

const formatOrderDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

function makeOrder(overrides = {}) {
  return {
    id: 1,
    userId: 42,
    status: 'PENDING',
    deliveryMethod: 'DELIVERY',
    paymentMethod: 'EXTERNAL',
    total: 35.0,
    createdAt: '2026-04-11T12:00:00Z',
    updatedAt: '2026-04-11T12:05:00Z',
    items: [
      { id: 10, productId: 1, variantId: 101, productName: 'Blue Dream', variantLabel: 'Default', quantity: 2, voided: false },
      { id: 11, productId: 2, variantId: 102, productName: 'OG Kush', variantLabel: 'Default', quantity: 1, voided: false },
    ],
    user: { id: 42, username: 'testuser', cashapp: 'testuser' },
    ...overrides,
  };
}

async function CustomerOrderList(props) {
  const { default: CL } = await import('./CustomerOrderList');
  return CL(props);
}

// Helper — renders the component after dynamic import resolves
async function renderList(props = {}) {
  const { default: CL } = await import('./CustomerOrderList');
  const defaults = {
    orders: [],
    isLoadingOrders: false,
    loadOrders: vi.fn(),
    onSelectOrder: vi.fn(),
    products: PRODUCTS,
    formatOrderDate,
  };
  return render(<CL {...defaults} {...props} />);
}

describe('CustomerOrderList', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // ── Loading state ────────────────────────────────────────────────────────

  it('shows a loading message while orders are being fetched', async () => {
    await renderList({ isLoadingOrders: true });
    expect(screen.getByText(/loading your orders/i)).toBeInTheDocument();
  });

  // ── Empty state ──────────────────────────────────────────────────────────

  it('shows an empty state with a CTA when there are no active orders', async () => {
    await renderList({ orders: [] });
    expect(screen.getByText(/no active orders right now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse the menu/i })).toBeInTheDocument();
  });

  it('navigates to /menu when "Browse the menu" is clicked', async () => {
    await renderList({ orders: [] });
    fireEvent.click(screen.getByRole('button', { name: /browse the menu/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/menu');
  });

  it('shows different empty copy on All Orders tab when there are no orders at all', async () => {
    await renderList({ orders: [] });
    fireEvent.click(screen.getByRole('button', { name: /all orders/i }));
    expect(screen.getByText(/haven't placed any orders yet/i)).toBeInTheDocument();
  });

  // ── Tabs ─────────────────────────────────────────────────────────────────

  it('defaults to the Active tab', async () => {
    await renderList();
    const activeTab = screen.getByRole('button', { name: /^active/i });
    expect(activeTab.className).toContain('active');
  });

  it('Active tab only shows orders with in-progress statuses', async () => {
    const orders = [
      makeOrder({ id: 1, status: 'PENDING' }),
      makeOrder({ id: 2, status: 'DELIVERED' }),
      makeOrder({ id: 3, status: 'PICKED_UP' }),
    ];
    await renderList({ orders });
    // Only order #1 is active
    expect(screen.getByText('Order #1')).toBeInTheDocument();
    expect(screen.queryByText('Order #2')).not.toBeInTheDocument();
    expect(screen.queryByText('Order #3')).not.toBeInTheDocument();
  });

  it('All Orders tab shows every order', async () => {
    const orders = [
      makeOrder({ id: 1, status: 'PENDING' }),
      makeOrder({ id: 2, status: 'DELIVERED' }),
    ];
    await renderList({ orders });
    fireEvent.click(screen.getByRole('button', { name: /all orders/i }));
    expect(screen.getByText('Order #1')).toBeInTheDocument();
    expect(screen.getByText('Order #2')).toBeInTheDocument();
  });

  it('Active tab badge shows the count of active orders', async () => {
    const orders = [
      makeOrder({ id: 1, status: 'PENDING' }),
      makeOrder({ id: 2, status: 'APPROVED' }),
      makeOrder({ id: 3, status: 'DELIVERED' }),
    ];
    await renderList({ orders });
    // 2 active orders; the badge should show "2"
    const badge = screen.getByText('2');
    expect(badge.className).toContain('customer-tab-badge');
  });

  // ── Order card ───────────────────────────────────────────────────────────

  it('displays order id and method badge', async () => {
    await renderList({ orders: [makeOrder({ id: 7, deliveryMethod: 'DELIVERY' })] });
    expect(screen.getByText('Order #7')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
  });

  it('shows Pickup badge for pickup orders', async () => {
    await renderList({ orders: [makeOrder({ deliveryMethod: 'PICKUP', status: 'READY_FOR_PICKUP' })] });
    expect(screen.getByText('Pickup')).toBeInTheDocument();
  });

  it('calls onSelectOrder with the order id when "View details" is clicked', async () => {
    const onSelectOrder = vi.fn();
    await renderList({ orders: [makeOrder({ id: 99 })], onSelectOrder });
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onSelectOrder).toHaveBeenCalledWith(99);
  });

  it('calls loadOrders without silent flag when Refresh button is clicked', async () => {
    const loadOrders = vi.fn();
    await renderList({ loadOrders });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    // User-triggered refresh should show the spinner, so silent must NOT be true
    expect(loadOrders).toHaveBeenCalledWith();
  });

  // ── Item summary ─────────────────────────────────────────────────────────

  it('shows product names in the items summary', async () => {
    await renderList({ orders: [makeOrder()] });
    // makeOrder has Blue Dream x2 and OG Kush x1
    expect(screen.getByText(/blue dream/i)).toBeInTheDocument();
    expect(screen.getByText(/og kush/i)).toBeInTheDocument();
  });

  it('truncates the items summary after 3 products and appends "and N more"', async () => {
    const order = makeOrder({
      items: [
        { id: 1, productId: 1, variantId: 101, productName: 'Blue Dream', variantLabel: 'Default', quantity: 1, voided: false },
        { id: 2, productId: 2, variantId: 102, productName: 'OG Kush', variantLabel: 'Default', quantity: 1, voided: false },
        { id: 3, productId: 3, variantId: 103, productName: 'Sour Diesel', variantLabel: 'Default', quantity: 1, voided: false },
        { id: 4, productId: 4, variantId: 104, productName: 'Purple Haze', variantLabel: 'Default', quantity: 1, voided: false },
      ],
    });
    await renderList({ orders: [order] });
    expect(screen.getByText(/and 1 more/i)).toBeInTheDocument();
  });

  it('excludes voided items from the summary', async () => {
    const order = makeOrder({
      items: [
        { id: 1, productId: 1, variantId: 101, productName: 'Blue Dream', variantLabel: 'Default', quantity: 1, voided: false },
        { id: 2, productId: 2, variantId: 102, productName: 'OG Kush', variantLabel: 'Default', quantity: 1, voided: true },
      ],
    });
    await renderList({ orders: [order] });
    expect(screen.getByText(/blue dream/i)).toBeInTheDocument();
    expect(screen.queryByText(/og kush/i)).not.toBeInTheDocument();
  });

  it('shows "No items" when all items are voided', async () => {
    const order = makeOrder({
      items: [{ id: 1, productId: 1, variantId: 101, productName: 'Blue Dream', variantLabel: 'Default', quantity: 1, voided: true }],
    });
    await renderList({ orders: [order] });
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  // ── Rejected orders ───────────────────────────────────────────────────────

  it('shows a rejected banner for NOT_FULFILLING orders instead of the stepper', async () => {
    const order = makeOrder({ status: 'NOT_FULFILLING' });
    // NOT_FULFILLING is not an active status — switch to All Orders to see it
    await renderList({ orders: [order] });
    fireEvent.click(screen.getByRole('button', { name: /all orders/i }));
    expect(screen.getByText(/could not be fulfilled/i)).toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  // ── Status stepper ───────────────────────────────────────────────────────

  it('renders delivery stepper labels for a delivery order', async () => {
    await renderList({ orders: [makeOrder({ status: 'APPROVED' })] });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('Out for Delivery')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('renders pickup stepper labels for a pickup order', async () => {
    await renderList({ orders: [makeOrder({ deliveryMethod: 'PICKUP', status: 'APPROVED' })] });
    expect(screen.getByText('Ready for Pickup')).toBeInTheDocument();
    expect(screen.getByText('Arrived')).toBeInTheDocument();
    expect(screen.getByText('Picked Up')).toBeInTheDocument();
    // Should NOT show delivery-only steps
    expect(screen.queryByText('Out for Delivery')).not.toBeInTheDocument();
  });

  it('marks the correct stepper step as active when ARRIVED', async () => {
    await renderList({ orders: [makeOrder({ deliveryMethod: 'PICKUP', status: 'ARRIVED' })] });
    const arrivedStep = screen.getByText('Arrived').closest('.stepper-step');
    expect(arrivedStep.className).toContain('active');
  });

  it('marks preceding steps as done when ARRIVED', async () => {
    await renderList({ orders: [makeOrder({ deliveryMethod: 'PICKUP', status: 'ARRIVED' })] });
    const readyStep = screen.getByText('Ready for Pickup').closest('.stepper-step');
    expect(readyStep.className).toContain('done');
  });

  it('marks the correct stepper step as active', async () => {
    await renderList({ orders: [makeOrder({ status: 'APPROVED' })] });
    // The "Preparing" dot's parent step should have the "active" class
    const preparingStep = screen.getByText('Preparing').closest('.stepper-step');
    expect(preparingStep.className).toContain('active');
  });

  it('marks preceding steps as done', async () => {
    await renderList({ orders: [makeOrder({ status: 'APPROVED' })] });
    const pendingStep = screen.getByText('Pending').closest('.stepper-step');
    expect(pendingStep.className).toContain('done');
  });

  // ── Order total ───────────────────────────────────────────────────────────

  it('displays the order total and item count', async () => {
    await renderList({ orders: [makeOrder({ total: 42.5 })] });
    expect(screen.getByText(/\$42\.50/)).toBeInTheDocument();
    expect(screen.getByText(/2 items/i)).toBeInTheDocument();
  });

  // ── Curbside Arrival Check-In ─────────────────────────────────────────────
  describe('Curbside Arrival Check-In', () => {
    beforeEach(() => {
      mockNotifyArrival.mockReset();
    });

    it('shows the "I\'m Here" button for curbside orders when ready for pickup', async () => {
      const order = makeOrder({ deliveryMethod: 'CURBSIDE', status: 'READY_FOR_PICKUP' });
      await renderList({ orders: [order] });
      expect(screen.getByRole('button', { name: /i'm here/i })).toBeInTheDocument();
    });

    it('hides the "I\'m Here" button for in-store pickup orders', async () => {
      const order = makeOrder({ deliveryMethod: 'PICKUP', status: 'READY_FOR_PICKUP' });
      await renderList({ orders: [order] });
      expect(screen.queryByRole('button', { name: /i'm here/i })).not.toBeInTheDocument();
    });

    it('hides the "I\'m Here" button for other statuses', async () => {
      const order = makeOrder({ deliveryMethod: 'CURBSIDE', status: 'PENDING' });
      await renderList({ orders: [order] });
      expect(screen.queryByRole('button', { name: /i'm here/i })).not.toBeInTheDocument();
    });

    it('calls notifyArrival context action immediately when clicked', async () => {
      const order = makeOrder({ id: 123, deliveryMethod: 'CURBSIDE', status: 'READY_FOR_PICKUP' });
      await renderList({ orders: [order] });
      
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /i'm here/i }));
      });
      
      expect(mockNotifyArrival).toHaveBeenCalledWith(123, 'Arrived');
    });

    it('shows the "Check-in confirmed" banner for curbside orders when status is ARRIVED', async () => {
      const order = makeOrder({ deliveryMethod: 'CURBSIDE', status: 'ARRIVED' });
      await renderList({ orders: [order] });
      
      expect(screen.getByText(/check-in confirmed/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /i'm here/i })).not.toBeInTheDocument();
    });

    it('hides the "Check-in confirmed" banner for other status values', async () => {
      const order = makeOrder({ deliveryMethod: 'CURBSIDE', status: 'READY_FOR_PICKUP' });
      await renderList({ orders: [order] });
      
      expect(screen.queryByText(/check-in confirmed/i)).not.toBeInTheDocument();
    });
  });
});
