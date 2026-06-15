import { describe, it, expect } from 'vitest';
import { checkoutFlowReducer, initialCheckoutFlow, CheckoutFlowState } from './checkoutMachine';

const orderState = { order: { id: 1 }, total: 10 };
const ccModal = { orderId: 1, token: 'tok', paymentFormUrl: 'url', amount: 10, items: [] };
const retryOrder = { orderId: 1, amount: 10, items: [], reason: 'Card declined' };

describe('checkoutFlowReducer', () => {
  it('starts in EDITING', () => {
    expect(initialCheckoutFlow.state).toBe(CheckoutFlowState.EDITING);
  });

  it('SUBMIT -> SUBMITTING', () => {
    const next = checkoutFlowReducer(initialCheckoutFlow, { type: 'SUBMIT' });
    expect(next.state).toBe(CheckoutFlowState.SUBMITTING);
  });

  it('ORDER_CREATED_EXTERNAL -> AWAITING_PAYMENT with orderState', () => {
    const submitting = { ...initialCheckoutFlow, state: CheckoutFlowState.SUBMITTING };
    const next = checkoutFlowReducer(submitting, { type: 'ORDER_CREATED_EXTERNAL', orderState });
    expect(next.state).toBe(CheckoutFlowState.AWAITING_PAYMENT);
    expect(next.orderState).toBe(orderState);
  });

  it('ORDER_CREATED_CC -> CC_PAYMENT with ccModal', () => {
    const submitting = { ...initialCheckoutFlow, state: CheckoutFlowState.SUBMITTING };
    const next = checkoutFlowReducer(submitting, { type: 'ORDER_CREATED_CC', orderState, ccModal });
    expect(next.state).toBe(CheckoutFlowState.CC_PAYMENT);
    expect(next.ccModal).toBe(ccModal);
    expect(next.orderState).toBe(orderState);
  });

  it('ORDER_CREATED_IMMEDIATE -> SUCCESS', () => {
    const submitting = { ...initialCheckoutFlow, state: CheckoutFlowState.SUBMITTING };
    const next = checkoutFlowReducer(submitting, { type: 'ORDER_CREATED_IMMEDIATE', orderState });
    expect(next.state).toBe(CheckoutFlowState.SUCCESS);
    expect(next.orderState).toBe(orderState);
  });

  it('PAYMENT_CONFIRMED -> SUCCESS, clears ccModal', () => {
    const cc = { ...initialCheckoutFlow, state: CheckoutFlowState.CC_PAYMENT, ccModal, orderState };
    const next = checkoutFlowReducer(cc, { type: 'PAYMENT_CONFIRMED' });
    expect(next.state).toBe(CheckoutFlowState.SUCCESS);
    expect(next.ccModal).toBeNull();
  });

  it('PAYMENT_FAILED -> RETRY with retryOrder, clears ccModal', () => {
    const cc = { ...initialCheckoutFlow, state: CheckoutFlowState.CC_PAYMENT, ccModal };
    const next = checkoutFlowReducer(cc, { type: 'PAYMENT_FAILED', retryOrder });
    expect(next.state).toBe(CheckoutFlowState.RETRY);
    expect(next.retryOrder).toBe(retryOrder);
    expect(next.ccModal).toBeNull();
  });

  it('EXTERNAL_PAYMENT_CONFIRMED -> SUCCESS', () => {
    const awaiting = { ...initialCheckoutFlow, state: CheckoutFlowState.AWAITING_PAYMENT, orderState };
    const next = checkoutFlowReducer(awaiting, { type: 'EXTERNAL_PAYMENT_CONFIRMED' });
    expect(next.state).toBe(CheckoutFlowState.SUCCESS);
  });

  it('CANCEL -> CANCELLED', () => {
    const awaiting = { ...initialCheckoutFlow, state: CheckoutFlowState.AWAITING_PAYMENT };
    const next = checkoutFlowReducer(awaiting, { type: 'CANCEL' });
    expect(next.state).toBe(CheckoutFlowState.CANCELLED);
  });

  it('SUBMIT_ERROR -> EDITING', () => {
    const submitting = { ...initialCheckoutFlow, state: CheckoutFlowState.SUBMITTING };
    const next = checkoutFlowReducer(submitting, { type: 'SUBMIT_ERROR' });
    expect(next.state).toBe(CheckoutFlowState.EDITING);
  });

  it('unknown action returns state unchanged', () => {
    const next = checkoutFlowReducer(initialCheckoutFlow, { type: 'BOGUS' });
    expect(next).toBe(initialCheckoutFlow);
  });
});
