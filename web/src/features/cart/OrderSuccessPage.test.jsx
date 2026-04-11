import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderSuccessPage from './OrderSuccessPage';
import { PaymentMethod } from '../../constants/orderMethods';

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
    expect(screen.getByText('$22.00')).toBeInTheDocument();
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

  it('calls setCart to clear cart on mount', () => {
    const setCart = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, setCart });
    renderSuccessPage();
    expect(setCart).toHaveBeenCalledWith([]);
  });
});
