import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderSuccessPage from './OrderSuccessPage';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../products/ProductImage', () => ({
  default: ({ alt }) => <img alt={alt} />,
}));

vi.mock('../products/productsHelpers', () => ({
  getProductImageSrc: () => '/placeholder.png',
}));

const baseOrderData = {
  items: [{ id: 1, name: 'Blue Dream', price: 20, quantity: 1 }],
  subtotal: 20,
  tax: 2,
  total: 22,
  deliveryMethod: DeliveryMethod.DELIVERY,
  deliveryAddress: '123 Main St',
  cashAppUsername: '$customer',
  paymentMethod: PaymentMethod.EXTERNAL,
  specialInstructions: '',
  paymentSnapshot: {
    methods: [{ type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' }],
    senderHandle: '$customer',
  },
};

const baseAppState = {
  currentUser: { id: 1, username: 'customer-one' },
  orders: [],
  setOrders: vi.fn(),
  setCart: vi.fn(),
};

const renderSuccessPage = (orderData = baseOrderData, appState = {}) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/order-success', state: orderData }]}>
      <Routes>
        <Route path="/order-success" element={<OrderSuccessPage />} />
        <Route path="/products" element={<div data-testid="products-page">Products</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('OrderSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
  });

  it('redirects to /products when location.state is null', () => {
    renderSuccessPage(null);
    expect(screen.getByTestId('products-page')).toBeInTheDocument();
  });

  it('renders the success title when order data is present', () => {
    renderSuccessPage();
    expect(screen.getByText(/order placed successfully/i)).toBeInTheDocument();
  });

  it('shows item names in the order summary', () => {
    renderSuccessPage();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
  });

  it('displays the total correctly', () => {
    renderSuccessPage();
    expect(screen.getAllByText('$22.00').length).toBeGreaterThan(0);
  });

  describe('Payment Information block — EXTERNAL payment', () => {
    it('shows method names joined on one line for a single method', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [{ type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' }],
          senderHandle: '$customer',
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).toHaveTextContent('CashApp');
    });

    it('shows method names joined with "/" when multiple methods are enabled', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [
            { type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' },
            { type: 'zelle', label: 'Zelle', handle: 'store@email.com' },
          ],
          senderHandle: '$customer',
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).toHaveTextContent('CashApp / Zelle');
    });

    it('shows total amount in the payment card', () => {
      renderSuccessPage({ ...baseOrderData });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).toHaveTextContent('$22.00');
    });

    it('does not show receiver handles', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [
            { type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' },
            { type: 'zelle', label: 'Zelle', handle: 'store@email.com' },
          ],
          senderHandle: '$customer',
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).not.toHaveTextContent('$StoreHandle');
      expect(paymentCard).not.toHaveTextContent('store@email.com');
      expect(paymentCard).not.toHaveTextContent(/receiver/i);
    });

    it('shows sender handle when present', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [{ type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' }],
          senderHandle: '$customer',
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).toHaveTextContent('$customer');
    });

    it('does not show a sender row when senderHandle is absent', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [{ type: 'zelle', label: 'Zelle', handle: 'store@email.com' }],
          senderHandle: null,
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).not.toHaveTextContent(/sender/i);
    });

    it('does not show "payment will be sent to CashApp" hardcoded sentence', () => {
      renderSuccessPage({ ...baseOrderData });
      expect(screen.queryByText(/payment will be sent to cashapp/i)).not.toBeInTheDocument();
    });
  });

  it('shows "Paid with store credit" for CREDIT payment', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.CREDIT });
    expect(screen.getByText(/paid with store credit/i)).toBeInTheDocument();
  });

  it('shows in-store pay info for IN_STORE payment', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.IN_STORE });
    expect(screen.getAllByText(/pay.*when you arrive/i).length).toBeGreaterThan(0);
  });

  it('shows "What\'s Next" section with in-store steps for IN_STORE', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.IN_STORE });
    expect(screen.getByText(/pay at the store/i)).toBeInTheDocument();
  });

  it('shows "Send Payment" step in What\'s Next for EXTERNAL', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.EXTERNAL });
    expect(screen.getByText(/send payment/i)).toBeInTheDocument();
  });

  it('shows special instructions when present', () => {
    renderSuccessPage({ ...baseOrderData, specialInstructions: 'Leave at door' });
    expect(screen.getByText('Leave at door')).toBeInTheDocument();
  });

  it('does not show special instructions section when empty', () => {
    renderSuccessPage({ ...baseOrderData, specialInstructions: '' });
    expect(screen.queryByText(/special instructions/i)).not.toBeInTheDocument();
  });

  it('shows "Pickup Location" heading for pickup orders', () => {
    renderSuccessPage({ ...baseOrderData, deliveryMethod: DeliveryMethod.PICKUP, deliveryAddress: 'Store Pickup' });
    expect(screen.getByText('Pickup Location')).toBeInTheDocument();
    expect(screen.queryByText('Delivery Address')).not.toBeInTheDocument();
  });

  it('shows "Delivery Address" heading for delivery orders', () => {
    renderSuccessPage();
    expect(screen.getByText('Delivery Address')).toBeInTheDocument();
  });

  it('shows pickup "What\'s Next" steps for PICKUP with EXTERNAL payment', () => {
    renderSuccessPage({
      ...baseOrderData,
      deliveryMethod: DeliveryMethod.PICKUP,
      deliveryAddress: 'Store Pickup',
      pickupLocation: '101 Example Ave',
      paymentMethod: PaymentMethod.EXTERNAL,
    });
    expect(screen.getByText(/send payment/i)).toBeInTheDocument();
    expect(screen.getByText(/wait for pickup notification/i)).toBeInTheDocument();
    expect(screen.getByText(/come pick up your order/i)).toBeInTheDocument();
  });

  it('shows pickup "What\'s Next" steps for PICKUP with CREDIT payment', () => {
    renderSuccessPage({
      ...baseOrderData,
      deliveryMethod: DeliveryMethod.PICKUP,
      deliveryAddress: 'Store Pickup',
      pickupLocation: '101 Example Ave',
      paymentMethod: PaymentMethod.CREDIT,
    });
    expect(screen.queryByText(/send payment/i)).not.toBeInTheDocument();
    expect(screen.getByText(/wait for pickup notification/i)).toBeInTheDocument();
    expect(screen.getByText(/come pick up your order/i)).toBeInTheDocument();
  });

  it('shows delivery "What\'s Next" steps for DELIVERY with EXTERNAL payment', () => {
    renderSuccessPage();
    expect(screen.getByText(/send payment/i)).toBeInTheDocument();
    expect(screen.getByText(/check your orders page/i)).toBeInTheDocument();
    expect(screen.getByText(/track your delivery/i)).toBeInTheDocument();
    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
  });

  it('shows delivery "What\'s Next" steps for DELIVERY with CREDIT payment', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.CREDIT });
    expect(screen.queryByText(/send payment/i)).not.toBeInTheDocument();
    expect(screen.getByText(/check your orders page/i)).toBeInTheDocument();
    expect(screen.getByText(/track your delivery/i)).toBeInTheDocument();
  });

  describe("What's Next — Send Payment step method names", () => {
    it('mentions Zelle in the Send Payment step when Zelle is the payment method', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [{ type: 'zelle', label: 'Zelle', handle: 'store@email.com' }],
          senderHandle: null,
        },
      });
      expect(screen.getAllByText(/zelle/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('store@email.com').length).toBeGreaterThan(0);
    });

    it('mentions Venmo in the Send Payment step when Venmo is the payment method', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentSnapshot: {
          methods: [{ type: 'venmo', label: 'Venmo', handle: '@StoreVenmo' }],
          senderHandle: null,
        },
      });
      expect(screen.getAllByText(/venmo/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('@StoreVenmo').length).toBeGreaterThan(0);
    });
  });

  describe('Pickup Location card', () => {
    it('shows actual pickupLocation address for PICKUP orders instead of "Store Pickup"', () => {
      renderSuccessPage({
        ...baseOrderData,
        deliveryMethod: DeliveryMethod.PICKUP,
        deliveryAddress: 'Store Pickup',
        pickupLocation: '101 Example Ave, Springfield',
        paymentMethod: PaymentMethod.CREDIT,
      });
      expect(screen.getAllByText('101 Example Ave, Springfield').length).toBeGreaterThan(0);
      expect(screen.queryByText('Store Pickup')).not.toBeInTheDocument();
    });

    it('shows "Curbside Pickup" heading for CURBSIDE orders', () => {
      renderSuccessPage({
        ...baseOrderData,
        deliveryMethod: DeliveryMethod.CURBSIDE,
        deliveryAddress: 'Red Honda Civic',
        paymentMethod: PaymentMethod.CREDIT,
      });
      expect(screen.getByText('Curbside Pickup')).toBeInTheDocument();
    });

    it('shows vehicle description for CURBSIDE orders', () => {
      renderSuccessPage({
        ...baseOrderData,
        deliveryMethod: DeliveryMethod.CURBSIDE,
        deliveryAddress: 'Red Honda Civic',
        paymentMethod: PaymentMethod.CREDIT,
      });
      expect(screen.getAllByText('Red Honda Civic').length).toBeGreaterThan(0);
    });
  });

  describe('Payment Information — edge cases', () => {
    it('shows "Paid by card" for CC payment instead of blank', () => {
      renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.CC, paymentSnapshot: null });
      expect(screen.getByText(/paid by card/i)).toBeInTheDocument();
    });

    it('does not show memo instruction in the Payment Information card', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentMethod: PaymentMethod.EXTERNAL,
        order: { id: 42, createdAt: new Date().toISOString() },
        paymentSnapshot: {
          methods: [{ type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' }],
          senderHandle: '$customer',
        },
      });
      const paymentCard = screen.getByText('Payment Information').closest('.detail-card');
      expect(paymentCard).not.toHaveTextContent(/memo/i);
    });
  });

  describe("What's Next — CURBSIDE", () => {
    it('shows curbside steps (not delivery steps) for CURBSIDE orders', () => {
      renderSuccessPage({
        ...baseOrderData,
        deliveryMethod: DeliveryMethod.CURBSIDE,
        deliveryAddress: 'Red Honda Civic',
        paymentMethod: PaymentMethod.EXTERNAL,
        paymentSnapshot: {
          methods: [{ type: 'cashapp', label: 'CashApp', handle: '$StoreHandle' }],
          senderHandle: '$customer',
        },
      });
      expect(screen.queryByText(/track your delivery/i)).not.toBeInTheDocument();
      expect(screen.getByText(/curbside/i)).toBeInTheDocument();
    });
  });

  describe("What's Next — IN_STORE location", () => {
    it('shows pickup location address in IN_STORE steps', () => {
      renderSuccessPage({
        ...baseOrderData,
        deliveryMethod: DeliveryMethod.PICKUP,
        deliveryAddress: 'Store Pickup',
        pickupLocation: '101 Example Ave',
        paymentMethod: PaymentMethod.IN_STORE,
      });
      expect(screen.getAllByText('101 Example Ave').length).toBeGreaterThan(0);
    });
  });

  it('calls setCart to clear cart on mount', () => {
    const setCart = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, setCart });
    renderSuccessPage();
    expect(setCart).toHaveBeenCalledWith([]);
  });

  describe('CC payment — transaction ID from payments[]', () => {
    it('shows transaction ID from payments[0].transactionId for CC orders', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentMethod: PaymentMethod.CC,
        paymentSnapshot: null,
        order: {
          id: 99,
          createdAt: new Date().toISOString(),
          payments: [{ id: 1, method: 'CC', status: 'SETTLED', amount: 22, transactionId: 'txn_xyz789' }],
        },
      });
      expect(screen.getByText(/txn_xyz789/)).toBeInTheDocument();
    });

    it('shows nothing for transaction ID when payments is empty for CC orders', () => {
      renderSuccessPage({
        ...baseOrderData,
        paymentMethod: PaymentMethod.CC,
        paymentSnapshot: null,
        order: {
          id: 99,
          createdAt: new Date().toISOString(),
          payments: [],
        },
      });
      expect(screen.queryByText(/txn_/)).not.toBeInTheDocument();
    });
  });
});
