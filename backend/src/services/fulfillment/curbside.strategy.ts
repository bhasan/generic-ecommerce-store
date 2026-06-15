import { DeliveryMethodEnum } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { FulfillmentStrategy, FulfillmentContext, FulfillmentOrderFields } from './FulfillmentStrategy';
import { parseCurbsideAddress } from '../../utils/curbside';

export class CurbsideFulfillmentStrategy implements FulfillmentStrategy {
  readonly method = DeliveryMethodEnum.CURBSIDE;

  async validate(ctx: FulfillmentContext): Promise<void> {
    // During the transition (Steps 1-6), vehicle info arrives as a legacy string ("CURBSIDE: <vehicle>").
    // After Step 7, the frontend sends structured { makeModel, color }.
    if (!ctx.deliveryAddress) {
      throw new AppError('Vehicle details are required for curbside orders', 400);
    }
  }

  async buildOrderFields(ctx: FulfillmentContext): Promise<FulfillmentOrderFields> {
    const raw = ctx.deliveryAddress as string;
    const parsed = parseCurbsideAddress(raw);
    return {
      // Dual-write: legacy string stays for existing readers; structured columns for the new path.
      deliveryAddress: raw,
      vehicleDescription: parsed.vehicleDescription ?? undefined,
    };
  }

  async onCheckIn(_orderId: number, parkingSpot: string): Promise<FulfillmentOrderFields> {
    // parkingSpot is stored in the structured column; the legacy string is built by the caller
    // (order.service.ts customerArrive) until reader cut-over in Step 8.
    return { parkingSpot: parkingSpot.trim() };
  }
}
