import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

const checkoutMock = vi.fn();
const deleteOrderMock = vi.fn();
const restoreCartMock = vi.fn();

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

const baseAppState = {
  cart: [
    { id: 101, name: 'Blue Dream', price: 15, quantity: 1, category: { name: 'Flower' }, image: '/flower.png' },
  ],
  currentUser: { id: 1, username: 'customer-one', cashapp: '$customer-one', roles: ['CUSTOMER'] },
  checkout: checkoutMock,
  deleteOrder: deleteOrderMock,
  restoreCart: restoreCartMock,
  taxRate: 0.1,
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  pickupLocation: '101 Example Ave',
  storeCashappUsername: '$SmokeStationHQ',
  paymentSettings: {
    cashapp: { enabled: true, handle: '$SmokeStationHQ' },
    zelle: { enabled: false, handle: '' },
    venmo: { enabled: false, handle: '' },
  },
  creditBalance: 50,
};

const renderCheckout = (appState = {}, routeState = {}) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: routeState }]}>
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-success" element={<div>Order success page</div>} />
        <Route path="/cart" element={<div>Cart page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
    checkoutMock.mockResolvedValue({ id: 401, status: 'PLACED' });
  });

  it('places credit orders immediately and navigates to the success page', async () => {
    renderCheckout();

    fireEvent.click(screen.getByLabelText(/store credit/i));
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', 'PICKUP', 'CREDIT'));
    expect(await screen.findByText('Order success page')).toBeInTheDocument();
  });

  it('validates external payments before submitting when cashapp is enabled', async () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      currentUser: { id: 1, username: 'customer-one', cashapp: '', roles: ['CUSTOMER'] },
      creditBalance: 0,
    });

    renderCheckout();

    fireEvent.change(screen.getByLabelText(/payment will be received from/i), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    expect(await screen.findByText('CashApp username is required')).toBeInTheDocument();
    expect(checkoutMock).not.toHaveBeenCalled();
  });

  it('shows the send-payment modal for external payments after checkout succeeds', async () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      creditBalance: 0,
    });

    renderCheckout();

    fireEvent.change(screen.getByLabelText(/payment will be received from/i), {
      target: { value: '$customer-one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', 'PICKUP', 'EXTERNAL'));
    expect(await screen.findByText(/order placed successfully/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$SmokeStationHQ/).length).toBeGreaterThan(0);
  });
});
