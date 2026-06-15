import { DeliveryMethodEnum } from '../../../generated/prisma';
import { FulfillmentStrategy, FulfillmentContext, FulfillmentOrderFields } from './FulfillmentStrategy';

export class PickupFulfillmentStrategy implements FulfillmentStrategy {
  readonly method = DeliveryMethodEnum.PICKUP;

  async validate(_ctx: FulfillmentContext): Promise<void> {
    // No restrictions for pickup.
  }

  async buildOrderFields(_ctx: FulfillmentContext): Promise<FulfillmentOrderFields> {
    return {};
  }
}
