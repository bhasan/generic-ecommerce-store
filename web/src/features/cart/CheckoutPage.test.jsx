import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';

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

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', DeliveryMethod.PICKUP, PaymentMethod.CREDIT, undefined));
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

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('$customer-one', DeliveryMethod.PICKUP, PaymentMethod.EXTERNAL, undefined));
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

  describe('IN_STORE payment', () => {
    it('shows "Pay in Store" option when delivery method is PICKUP', () => {
      renderCheckout();

      // Default delivery method is PICKUP
      expect(screen.getByRole('radio', { name: /pay in store/i })).toBeInTheDocument();
    });

    it('hides "Pay in Store" option when delivery method switches to DELIVERY', () => {
      useAppMock.mockReturnValue({
        ...baseAppState,
        minimumDeliveryOrderEnabled: false, // unlock delivery so the button is clickable
      });

      renderCheckout();

      fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));

      expect(screen.queryByRole('radio', { name: /pay in store/i })).not.toBeInTheDocument();
    });

    it('hides the CashApp username field when "Pay in Store" is selected', () => {
      renderCheckout();

      fireEvent.click(screen.getByRole('radio', { name: /pay in store/i }));

      expect(screen.queryByPlaceholderText(/\$username/i)).not.toBeInTheDocument();
    });

    it('resets payment method to EXTERNAL when switching from PICKUP to DELIVERY', () => {
      useAppMock.mockReturnValue({
        ...baseAppState,
        minimumDeliveryOrderEnabled: false,
      });

      renderCheckout();

      // Select Pay in Store while on PICKUP
      fireEvent.click(screen.getByRole('radio', { name: /pay in store/i }));
      expect(screen.getByRole('radio', { name: /pay in store/i })).toBeChecked();

      // Switch to Delivery — IN_STORE is no longer available
      fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));

      // CashApp field reappears, confirming payment method reverted to EXTERNAL
      expect(screen.getByPlaceholderText(/\$username/i)).toBeInTheDocument();
    });

    it('navigates directly to order success without showing SendPaymentModal', async () => {
      renderCheckout();

      fireEvent.click(screen.getByRole('radio', { name: /pay in store/i }));
      fireEvent.click(screen.getByRole('button', { name: /place order/i }));

      await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith(
        expect.any(String),
        DeliveryMethod.PICKUP,
        PaymentMethod.IN_STORE
      ));

      // SendPaymentModal should NOT appear — go directly to success page
      expect(screen.queryByText(/payment instructions/i)).not.toBeInTheDocument();
      expect(await screen.findByText('Order success page')).toBeInTheDocument();
    });

    it('skips CashApp validation when IN_STORE is selected', async () => {
      useAppMock.mockReturnValue({
        ...baseAppState,
        currentUser: { id: 1, username: 'customer-one', cashapp: '', roles: ['CUSTOMER'] },
        creditBalance: 0,
      });

      renderCheckout();

      fireEvent.click(screen.getByRole('radio', { name: /pay in store/i }));
      fireEvent.click(screen.getByRole('button', { name: /place order/i }));

      await waitFor(() => expect(checkoutMock).toHaveBeenCalled());

      // No CashApp validation error should appear
      expect(screen.queryByText(/cashapp username is required/i)).not.toBeInTheDocument();
    });
  });
});
