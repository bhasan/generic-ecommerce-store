import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderSuccessPage from './OrderSuccessPage';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
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

  it('shows CashApp payment info for EXTERNAL payment', () => {
    renderSuccessPage({ ...baseOrderData, paymentMethod: PaymentMethod.EXTERNAL });
    expect(screen.getByText(/payment will be sent to cashapp/i)).toBeInTheDocument();
    expect(screen.getAllByText('$customer').length).toBeGreaterThan(0);
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

  it('calls setCart to clear cart on mount', () => {
    const setCart = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, setCart });
    renderSuccessPage();
    expect(setCart).toHaveBeenCalledWith([]);
  });
});
