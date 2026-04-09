import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

const checkoutMock = vi.fn();
const checkDeliveryEligibilityMock = vi.fn();
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
  checkDeliveryEligibility: checkDeliveryEligibilityMock,
  deleteOrder: deleteOrderMock,
  restoreCart: restoreCartMock,
  taxRate: 0.1,
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  deliveryRadiusMiles: 5,
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
    vi.useRealTimers();
    useAppMock.mockReturnValue(baseAppState);
    checkoutMock.mockResolvedValue({ id: 401, status: 'PLACED' });
    checkDeliveryEligibilityMock.mockResolvedValue({
      deliverable: true,
      deliveryZoneStatus: 'IN_ZONE',
      deliveryZoneSource: 'GOOGLE_GEOCODING',
      distanceMiles: 2.4,
      thresholdMiles: 5,
      message: 'Delivery available. This address is 2.40 miles from the store.',
    });
  });

  it('places credit orders immediately and navigates to the success page', async () => {
    renderCheckout();

    fireEvent.click(screen.getByLabelText(/store credit/i));
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', 'PICKUP', 'CREDIT', undefined));
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

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', 'PICKUP', 'EXTERNAL', undefined));
    expect(await screen.findByText(/order placed successfully/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$SmokeStationHQ/).length).toBeGreaterThan(0);
  });
  it('closes the send-payment modal even when deleteOrder throws on cancel', async () => {
    deleteOrderMock.mockRejectedValue(new Error('server error'));
    useAppMock.mockReturnValue({
      ...baseAppState,
      creditBalance: 0,
    });

    renderCheckout();

    fireEvent.change(screen.getByLabelText(/payment will be received from/i), {
      target: { value: '$customer-one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    // Wait for the send-payment modal to appear
    expect(await screen.findByText(/order placed successfully/i)).toBeInTheDocument();

    // Cancel — deleteOrder will throw but the modal must still close
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByText(/order placed successfully/i)).not.toBeInTheDocument()
    );
  });

  it('immediately prechecks a saved profile address when delivery is already selected', async () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      currentUser: {
        id: 1,
        username: 'customer-one',
        cashapp: '$customer-one',
        roles: ['CUSTOMER'],
        address: '123 Main St, Houston, TX 77083',
      },
      creditBalance: 0,
    });

    renderCheckout({}, { deliveryMethod: 'DELIVERY' });

    await waitFor(() => expect(checkDeliveryEligibilityMock).toHaveBeenCalledWith({
      street: '123 Main St',
      apartment: '',
      city: 'Houston',
      state: 'TX',
      zipCode: '77083',
    }));
  });

  it('blocks place-order when the delivery precheck returns out of zone', async () => {
    checkDeliveryEligibilityMock.mockResolvedValue({
      deliverable: false,
      deliveryZoneStatus: 'OUT_OF_ZONE',
      deliveryZoneSource: 'GOOGLE_GEOCODING',
      distanceMiles: 7.1,
      thresholdMiles: 5,
      message: 'This address is 7.10 miles away, outside the 5.00 mile delivery radius.',
    });

    useAppMock.mockReturnValue({
      ...baseAppState,
      currentUser: {
        id: 1,
        username: 'customer-one',
        cashapp: '$customer-one',
        roles: ['CUSTOMER'],
        address: '123 Main St, Houston, TX 77083',
      },
      minimumDeliveryOrder: 0,
      minimumDeliveryOrderEnabled: false,
      creditBalance: 0,
    });

    renderCheckout({}, { deliveryMethod: 'DELIVERY' });

    expect(await screen.findByText(/outside the 5\.00 mile delivery radius/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled();
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});
