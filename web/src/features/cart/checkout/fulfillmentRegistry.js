import { DeliveryMethod } from '../../../constants/orderMethods';
import { formatPrice } from '../../../utils/currencyUtils';

/**
 * Fulfillment method registry — drives validation and payload building for each method.
 * Replaces the isDelivery/isPickup/isCurbside branching in validateForm and handlePlaceOrder.
 */
export const fulfillmentRegistry = [
  {
    method: DeliveryMethod.DELIVERY,
    validate(ctx, errors) {
      if (!ctx.normalizedAddress.street) errors.street = 'Street address is required';
      if (!ctx.normalizedAddress.city)   errors.city   = 'City is required';
      if (!ctx.normalizedAddress.state)  errors.state  = 'State is required';
      if (!ctx.normalizedAddress.zipCode) {
        errors.zipCode = 'ZIP code is required';
      } else if (!/^\d{5}$/.test(ctx.normalizedAddress.zipCode)) {
        errors.zipCode = 'ZIP code must contain 5 digits';
      }
      if (ctx.deliveryMinimumBlocked) {
        errors.deliveryEligibility = `Delivery requires a ${formatPrice(ctx.minimumDeliveryOrder)} minimum subtotal.`;
      } else if (!ctx.deliveryAddressComplete) {
        errors.deliveryEligibility = 'Complete the delivery address so we can verify eligibility.';
      } else if (ctx.deliveryEligibility.status === 'checking') {
        errors.deliveryEligibility = 'Delivery eligibility is still being checked.';
      } else if (ctx.deliveryEligibility.status === 'error') {
        errors.deliveryEligibility = ctx.deliveryEligibility.error;
      } else if (!ctx.deliveryEligibility.result?.deliverable) {
        errors.deliveryEligibility = ctx.deliveryEligibility.result?.message || 'Delivery is not available for this address.';
      }
      return errors;
    },
    buildPayload(ctx) {
      // Delivery sends the structured address; curbside-specific fields are not used.
      return { deliveryAddress: ctx.normalizedAddress };
    },
  },
  {
    method: DeliveryMethod.PICKUP,
    validate(_ctx, errors) { return errors; },
    buildPayload() { return {}; },
  },
  {
    method: DeliveryMethod.CURBSIDE,
    validate(ctx, errors) {
      if (!ctx.vehicleDetails.makeModel.trim()) errors.makeModel = 'Vehicle make and model is required';
      if (!ctx.vehicleDetails.color.trim())     errors.color     = 'Vehicle color is required';
      return errors;
    },
    buildPayload(ctx) {
      const { makeModel, color } = ctx.vehicleDetails;
      return { vehicleDescription: `${color.trim()} ${makeModel.trim()}` };
    },
  },
];

export function getFulfillmentEntry(method) {
  return fulfillmentRegistry.find(e => e.method === method);
}
