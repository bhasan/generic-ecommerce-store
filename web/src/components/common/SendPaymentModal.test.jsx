import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SendPaymentModal from './SendPaymentModal';
import { DeliveryMethod } from '../../constants/orderMethods';

const baseOrder = { id: 'ORD-123' };

const basePendingOrderState = {
  order: baseOrder,
  deliveryMethod: DeliveryMethod.PICKUP,
  deliveryAddress: '123 Main St',
  pickupLocation: '101 Store Ave',
  total: 42.5,
};

const basePaymentSettings = {
  cashapp: { enabled: true, handle: '$StoreHandle' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
};

const renderModal = (props = {}) =>
  render(
    <SendPaymentModal
      isOpen={true}
      onDone={vi.fn()}
      onCancel={vi.fn()}
      pendingOrderState={basePendingOrderState}
      storeCashappUsername="$FallbackHandle"
      paymentSettings={basePaymentSettings}
      {...props}
    />
  );

describe('SendPaymentModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when pendingOrderState is null', () => {
    const { container } = renderModal({ pendingOrderState: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('displays the order id', () => {
    renderModal();
    expect(screen.getAllByText('#ORD-123').length).toBeGreaterThan(0);
  });

  it('displays the total amount', () => {
    renderModal();
    expect(screen.getByText('$42.50')).toBeInTheDocument();
  });

  it('shows "Store Pickup Location" when delivery method is PICKUP', () => {
    renderModal({ pendingOrderState: { ...basePendingOrderState, deliveryMethod: DeliveryMethod.PICKUP } });
    expect(screen.getByText('Store Pickup Location')).toBeInTheDocument();
    expect(screen.getByText('101 Store Ave')).toBeInTheDocument();
  });

  it('shows "Delivery Address" when delivery method is DELIVERY', () => {
    renderModal({
      pendingOrderState: { ...basePendingOrderState, deliveryMethod: DeliveryMethod.DELIVERY },
    });
    expect(screen.getByText('Delivery Address')).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
  });

  it('disables "Complete Order" button until checkbox is checked', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: /complete order/i });
    expect(btn).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(btn).not.toBeDisabled();
  });

  it('calls onDone after checking the checkbox and clicking Complete Order', () => {
    const onDone = vi.fn();
    renderModal({ onDone });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /complete order/i }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not call onDone if checkbox is not checked', () => {
    const onDone = vi.fn();
    renderModal({ onDone });

    fireEvent.click(screen.getByRole('button', { name: /complete order/i }));

    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onCancel when the X button is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides the close button and cancel button when onCancel is not provided', () => {
    renderModal({ onCancel: undefined });
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('shows CashApp handle from paymentSettings', () => {
    renderModal();
    expect(screen.getByText('$StoreHandle')).toBeInTheDocument();
  });

  it('falls back to storeCashappUsername when paymentSettings cashapp handle is empty', () => {
    renderModal({
      paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } },
    });
    expect(screen.getByText('$FallbackHandle')).toBeInTheDocument();
  });

  it('hides CashApp when cashapp is disabled', () => {
    renderModal({
      paymentSettings: { cashapp: { enabled: false, handle: '' }, zelle: { enabled: true, handle: '$ZelleHandle' }, venmo: { enabled: false, handle: '' } },
    });
    expect(screen.queryByText(/cashapp/i)).not.toBeInTheDocument();
  });

  it('shows Zelle when zelle is enabled', () => {
    renderModal({
      paymentSettings: { cashapp: { enabled: false, handle: '' }, zelle: { enabled: true, handle: '$ZelleHandle' }, venmo: { enabled: false, handle: '' } },
    });
    expect(screen.getAllByText(/zelle/i).length).toBeGreaterThan(0);
    expect(screen.getByText('$ZelleHandle')).toBeInTheDocument();
  });

  it('shows Venmo when venmo is enabled', () => {
    renderModal({
      paymentSettings: { cashapp: { enabled: false, handle: '' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: true, handle: '@VenmoHandle' } },
    });
    expect(screen.getAllByText(/venmo/i).length).toBeGreaterThan(0);
    expect(screen.getByText('@VenmoHandle')).toBeInTheDocument();
  });

  it('shows generic memo text when multiple payment methods are enabled', () => {
    renderModal({
      paymentSettings: {
        cashapp: { enabled: true, handle: '$Store' },
        zelle: { enabled: true, handle: 'zelle@store.com' },
        venmo: { enabled: false, handle: '' },
      },
    });
    expect(screen.getByText(/one of the methods above/i)).toBeInTheDocument();
  });

  it('shows CashApp-specific memo text when only CashApp is enabled', () => {
    renderModal();
    expect(screen.getByText(/sent the payment on cashapp/i)).toBeInTheDocument();
  });

  describe('CashApp handle visibility', () => {
    it('hides CashApp send-to card when enabled but no handle is configured', () => {
      renderModal({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false }, venmo: { enabled: false } },
        storeCashappUsername: '',
      });
      expect(screen.queryByText(/CashApp.*Send to/i)).not.toBeInTheDocument();
    });

    it('never shows "Loading..." text', () => {
      renderModal({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false }, venmo: { enabled: false } },
        storeCashappUsername: '',
      });
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it('shows CashApp section when enabled and handle comes from storeCashappUsername fallback', () => {
      renderModal({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false }, venmo: { enabled: false } },
        storeCashappUsername: '$FallbackHandle',
      });
      expect(screen.getByText('$FallbackHandle')).toBeInTheDocument();
    });

    it('hides CashApp section when paymentSettings is empty (not yet loaded)', () => {
      renderModal({
        paymentSettings: {},
        storeCashappUsername: '',
      });
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it('prefers paymentSettings handle over storeCashappUsername when both are set', () => {
      renderModal({
        paymentSettings: { cashapp: { enabled: true, handle: '$PrimaryHandle' }, zelle: { enabled: false }, venmo: { enabled: false } },
        storeCashappUsername: '$FallbackHandle',
      });
      expect(screen.getByText('$PrimaryHandle')).toBeInTheDocument();
      expect(screen.queryByText('$FallbackHandle')).not.toBeInTheDocument();
    });
  });
});
