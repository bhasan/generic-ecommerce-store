import { DeliveryMethodEnum, DeliveryZoneStatus, DeliveryEligibilitySource } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { FulfillmentStrategy, FulfillmentContext, FulfillmentOrderFields } from './FulfillmentStrategy';
import { validateDeliveryAddressShape } from '../../validators/deliveryAddress';
import { DeliveryEligibilityService } from '../deliveryEligibility.service';
import { OrderingConstraintsService } from '../orderingConstraints.service';
import { StructuredDeliveryAddress } from '../../utils/address.util';

const deliveryEligibilityService = new DeliveryEligibilityService();
const orderingConstraintsService = new OrderingConstraintsService();

export class DeliveryFulfillmentStrategy implements FulfillmentStrategy {
  readonly method = DeliveryMethodEnum.DELIVERY;

  // Cache eligibility result between validate() and buildOrderFields() within one request.
  private lastEligibility: Awaited<ReturnType<typeof deliveryEligibilityService.checkDeliveryEligibility>> | null = null;

  async validate(ctx: FulfillmentContext): Promise<void> {
    validateDeliveryAddressShape(ctx.deliveryAddress);

    const { minimumDeliveryOrder, minimumDeliveryOrderEnabled } = await orderingConstraintsService.getOrderingConstraints();
    if (minimumDeliveryOrderEnabled && ctx.subtotal < minimumDeliveryOrder) {
      throw new AppError(`Minimum order of $${minimumDeliveryOrder.toFixed(2)} required for delivery`, 400);
    }

    const eligibility = await deliveryEligibilityService.checkDeliveryEligibility(
      ctx.deliveryAddress as StructuredDeliveryAddress,
    );
    this.lastEligibility = eligibility;

    if (!eligibility.deliverable) {
      throw new AppError(
        eligibility.message,
        400,
        eligibility.deliveryStatus === 'OUT_OF_ZONE' ? 'DELIVERY_OUT_OF_ZONE' : 'DELIVERY_UNVERIFIED',
      );
    }
  }

  async buildOrderFields(_ctx: FulfillmentContext): Promise<FulfillmentOrderFields> {
    if (!this.lastEligibility) return {};
    return {
      deliveryAddress: this.lastEligibility.canonicalAddress ?? undefined,
      deliveryStatus: (this.lastEligibility.deliveryStatus as DeliveryZoneStatus) ?? null,
      deliverySource: (this.lastEligibility.deliverySource as DeliveryEligibilitySource) ?? null,
      deliveryDistanceMiles: this.lastEligibility.distanceMiles ?? null,
      deliveryThresholdMiles: this.lastEligibility.thresholdMiles ?? null,
      deliveryCheckedAt: this.lastEligibility.checkedAt ?? null,
    };
  }

  async applyInTransaction(tx: any, _orderId: number, userId: number, _ctx: FulfillmentContext): Promise<void> {
    if (!this.lastEligibility?.canonicalAddress) return;
    await tx.user.update({
      where: { id: userId },
      data: {
        address: this.lastEligibility.canonicalAddress,
        deliveryStatus: this.lastEligibility.deliveryStatus,
        deliverySource: this.lastEligibility.deliverySource,
        deliveryDistanceMiles: this.lastEligibility.distanceMiles,
        deliveryCheckedAt: this.lastEligibility.checkedAt,
      },
    });
  }
}
