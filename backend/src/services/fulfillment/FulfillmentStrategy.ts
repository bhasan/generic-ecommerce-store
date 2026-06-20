import { DeliveryMethodEnum, DeliveryZoneStatus, DeliveryEligibilitySource } from '../../../generated/prisma';
import { StructuredDeliveryAddress } from '../../utils/address.util';

export interface FulfillmentContext {
  userId: number;
  deliveryAddress?: StructuredDeliveryAddress | string;
  vehicleDescription?: string;
  subtotal: number;
}

export interface FulfillmentOrderFields {
  deliveryAddress?: string;
  vehicleDescription?: string | null;
  parkingSpot?: string;
  deliveryZoneStatus?: DeliveryZoneStatus | null;
  deliveryEligibilitySource?: DeliveryEligibilitySource | null;
  deliveryDistanceMiles?: number | null;
  deliveryThresholdMiles?: number | null;
  deliveryZoneCheckedAt?: Date | null;
}

export interface FulfillmentStrategy {
  readonly method: DeliveryMethodEnum;

  /** Throws AppError if fulfillment constraints are not met (address required, minimum order, eligibility). */
  validate(ctx: FulfillmentContext): Promise<void>;

  /** Returns the order columns this fulfillment method contributes. */
  buildOrderFields(ctx: FulfillmentContext): Promise<FulfillmentOrderFields>;

  /** Updates the order during a check-in event (curbside only). Returns fields to update. */
  onCheckIn?(orderId: number, parkingSpot: string): Promise<FulfillmentOrderFields>;

  /** Side-effects inside the $transaction after order creation (e.g. update user address cache). */
  applyInTransaction?(tx: any, orderId: number, userId: number, ctx: FulfillmentContext): Promise<void>;
}
