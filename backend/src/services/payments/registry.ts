import { PaymentMethodEnum } from '../../../generated/prisma';
import { PaymentStrategy } from './PaymentStrategy';
import { ExternalPaymentStrategy } from './external.strategy';
import { StoreCreditPaymentStrategy } from './store-credit.strategy';
import { InStorePaymentStrategy } from './inStore.strategy';
import { CcPaymentStrategy } from './cc.strategy';
import { AppError } from '../../middleware/error.middleware';

const strategies = new Map<PaymentMethodEnum, PaymentStrategy>([
  [PaymentMethodEnum.EXTERNAL, new ExternalPaymentStrategy()],
  [PaymentMethodEnum.STORE_CREDIT, new StoreCreditPaymentStrategy()],
  [PaymentMethodEnum.IN_STORE, new InStorePaymentStrategy()],
  [PaymentMethodEnum.CC,       new CcPaymentStrategy()],
]);

export function getPaymentStrategy(method: PaymentMethodEnum): PaymentStrategy {
  const strategy = strategies.get(method);
  if (!strategy) throw new AppError(`Unknown payment method: ${method}`, 400);
  return strategy;
}
