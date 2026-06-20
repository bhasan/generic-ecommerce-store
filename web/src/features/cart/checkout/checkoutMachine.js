/**
 * Checkout flow state machine (useReducer-based).
 *
 * States: EDITING -> SUBMITTING -> AWAITING_PAYMENT -> SUCCESS | RETRY | CANCELLED
 *
 * Replaces the 7 overlapping flags (isSubmitting, showSendPaymentModal, ccPaymentModal,
 * paymentRetryOrder, orderCancelled, orderCompleted, pendingOrderState) that previously
 * drove CheckoutPage.
 */

export const CheckoutFlowState = {
  EDITING:          'EDITING',
  SUBMITTING:       'SUBMITTING',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  CC_PAYMENT:       'CC_PAYMENT',
  SUCCESS:          'SUCCESS',
  RETRY:            'RETRY',
  CANCELLED:        'CANCELLED',
};

export const initialCheckoutFlow = {
  state: CheckoutFlowState.EDITING,
  orderState: null,    // populated after order created; passed to OrderSuccessPage
  ccModal: null,       // { orderId, token, paymentFormUrl, amount, items }
  retryOrder: null,    // { orderId, amount, items }
};

export function checkoutFlowReducer(flow, action) {
  switch (action.type) {
    case 'SUBMIT':
      return { ...flow, state: CheckoutFlowState.SUBMITTING };

    case 'ORDER_CREATED_EXTERNAL':
      // External payment: show SendPaymentModal
      return {
        ...flow,
        state: CheckoutFlowState.AWAITING_PAYMENT,
        orderState: action.orderState,
      };

    case 'ORDER_CREATED_CC':
      // CC: show AuthorizeNetPaymentModal
      return {
        ...flow,
        state: CheckoutFlowState.CC_PAYMENT,
        orderState: action.orderState,
        ccModal: action.ccModal,
      };

    case 'ORDER_CREATED_IMMEDIATE':
      // Credit / in-store: go straight to success
      return {
        ...flow,
        state: CheckoutFlowState.SUCCESS,
        orderState: action.orderState,
      };

    case 'PAYMENT_CONFIRMED':
      return { ...flow, state: CheckoutFlowState.SUCCESS, ccModal: null };

    case 'PAYMENT_FAILED':
      return {
        ...flow,
        state: CheckoutFlowState.RETRY,
        ccModal: null,
        retryOrder: action.retryOrder,
      };

    case 'EXTERNAL_PAYMENT_CONFIRMED':
      return { ...flow, state: CheckoutFlowState.SUCCESS };

    case 'CANCEL':
      return { ...flow, state: CheckoutFlowState.CANCELLED };

    case 'SUBMIT_ERROR':
      return { ...flow, state: CheckoutFlowState.EDITING };

    default:
      return flow;
  }
}
