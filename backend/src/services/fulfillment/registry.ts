import { DeliveryMethodEnum } from '../../../generated/prisma';
import { FulfillmentStrategy } from './FulfillmentStrategy';
import { DeliveryFulfillmentStrategy } from './delivery.strategy';
import { PickupFulfillmentStrategy } from './pickup.strategy';
import { CurbsideFulfillmentStrategy } from './curbside.strategy';
import { AppError } from '../../middleware/error.middleware';

const strategies = new Map<DeliveryMethodEnum, FulfillmentStrategy>([
  [DeliveryMethodEnum.DELIVERY, new DeliveryFulfillmentStrategy()],
  [DeliveryMethodEnum.PICKUP,   new PickupFulfillmentStrategy()],
  [DeliveryMethodEnum.CURBSIDE, new CurbsideFulfillmentStrategy()],
]);

export function getFulfillmentStrategy(method: DeliveryMethodEnum): FulfillmentStrategy {
  const strategy = strategies.get(method);
  if (!strategy) throw new AppError(`Unknown delivery method: ${method}`, 400);
  return strategy;
}
