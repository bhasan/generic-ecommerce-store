import { PaymentMethod } from '../../../constants/orderMethods';

/**
 * Payment method registry — each entry drives selector visibility, detail rendering,
 * validation, and post-order behavior. Replaces the four scattered isCCPayment/isExternalPayment/…
 * booleans that were previously spread across selector, detail panel, validation, and submission.
 *
 * isAvailable(ctx) controls whether the radio option appears.
 * validate(ctx, errors) mutates the errors object in-place and returns it.
 * The rest is consumed by PaymentSelector and PaymentDetails components.
 */
export const paymentRegistry = [
  {
    method: PaymentMethod.EXTERNAL,
    label: 'CashApp / Zelle / Venmo',
    iconName: 'Smartphone',
    isAvailable: () => true,
    validate(ctx, errors) {
      if (!ctx.paymentSettings?.cashapp?.enabled) return errors;
      if (!ctx.cashAppUsername.trim()) {
        errors.cashAppUsername = 'CashApp username is required';
      } else if (!ctx.cashAppUsername.startsWith('$')) {
        errors.cashAppUsername = 'CashApp username must start with $';
      } else if (ctx.cashAppUsername.length < 2 || ctx.cashAppUsername.length > 21) {
        errors.cashAppUsername = 'CashApp username must be between 1-20 characters (excluding $)';
      }
      return errors;
    },
    // Determines which machine action to dispatch after order creation.
    flowAction: 'EXTERNAL',
  },
  {
    method: PaymentMethod.STORE_CREDIT,
    label: 'Store Credit',
    iconName: 'Wallet',
    isAvailable: (ctx) => ctx.creditBalance > 0,
    badge: (ctx) => `$${ctx.creditBalance.toFixed(2)} available`,
    validate(ctx, errors) {
      if (ctx.creditBalance < ctx.total) {
        errors.credit = `Insufficient credit balance. You have $${ctx.creditBalance.toFixed(2)} but the order total is $${ctx.total.toFixed(2)}.`;
      }
      return errors;
    },
    flowAction: 'IMMEDIATE',
  },
  {
    method: PaymentMethod.IN_STORE,
    label: 'Pay in Store',
    iconName: 'Store',
    badge: () => 'pickup only',
    isAvailable: (ctx) => ctx.isPickup,
    validate(_ctx, errors) { return errors; },
    flowAction: 'IMMEDIATE',
  },
  {
    method: PaymentMethod.CC,
    label: 'Credit / Debit Card',
    iconName: 'CreditCard',
    badge: () => 'Secure',
    isAvailable: (ctx) => !!ctx.paymentSettings?.cc_payment?.enabled,
    validate(_ctx, errors) { return errors; },
    flowAction: 'CC',
  },
];

export function getPaymentEntry(method) {
  return paymentRegistry.find(e => e.method === method);
}
