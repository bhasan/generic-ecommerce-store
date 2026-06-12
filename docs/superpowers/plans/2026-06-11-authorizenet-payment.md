# Authorize.net CC Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Credit/Debit Card payment via Authorize.net Accept Hosted iFrame as a toggleable option alongside existing payment methods.

**Architecture:** Customer selects CC at checkout → order created as `PENDING_PAYMENT` → frontend fetches a hosted page token from backend → Authorize.net iFrame rendered in a modal → `communicator.html` postMessages result back → backend verifies transaction → order confirmed as `PENDING` and enters existing flow.

**Tech Stack:** `authorizenet` npm SDK (backend), React iFrame modal with `window.AuthorizeNetIFrame` postMessage bridge (frontend), Prisma migration for new enum value + field, Vitest for all tests.

---

## File Map

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `PENDING_PAYMENT` to `OrderStatus`, add `transactionId String?` to `Order` |
| `backend/src/constants/orderMethods.ts` | Add `CC: 'CC'` to `PaymentMethod` |
| `web/src/constants/orderMethods.js` | Add `CC: 'CC'` to `PaymentMethod` |
| `backend/src/services/paymentSettings.service.ts` | Add `CCPaymentSettings` interface, extend `PaymentSettings`, update defaults + validation |
| `backend/src/services/paymentSettings.service.test.ts` | Add cc_payment tests |
| `backend/src/services/authorizenet.service.ts` | **New** — wraps SDK: `getHostedPageToken`, `verifyTransaction` |
| `backend/src/services/authorizenet.service.test.ts` | **New** — unit tests for both service methods |
| `backend/src/services/order.service.ts` | Add `getPaymentToken`, `confirmCardPayment`; modify `createOrder` for CC status + skip notify |
| `backend/src/routes/order.routes.ts` | Add `POST /:id/payment/token` and `POST /:id/payment/verify` |
| `backend/src/controllers/order.controller.ts` | Add `getPaymentToken`, `verifyPayment` handler methods |
| `web/public/communicator.html` | **New** — Authorize.net postMessage bridge static file |
| `web/src/services/ordersApi.js` | Add `getPaymentToken`, `verifyPayment` functions |
| `web/src/features/cart/AuthorizeNetPaymentModal.jsx` | **New** — iFrame modal component |
| `web/src/features/cart/AuthorizeNetPaymentModal.test.jsx` | **New** — modal tests |
| `web/src/features/cart/CheckoutPage.jsx` | Payment-section UX refresh (all methods), then CC option + modal wiring |
| `web/src/features/cart/CheckoutPage.css` | Styles for refreshed payment method cards + detail box |
| `web/src/features/website/components/WebsitePaymentSection.jsx` | Add Authorize.net credentials card |
| `web/src/constants/orderStatuses.js` | Add `PENDING_PAYMENT` status |
| `web/src/features/orders/CustomerOrderList.jsx` | Show `PENDING_PAYMENT` orders with Complete Payment / Cancel actions |
| `web/src/features/orders/OrderHistoryPage.jsx` | Add `PENDING_PAYMENT` to status filter options |

---

## Task 1: Database Migration + Constants

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/constants/orderMethods.ts`
- Modify: `web/src/constants/orderMethods.js`

- [ ] **Step 1: Add `PENDING_PAYMENT` to the `OrderStatus` enum and `transactionId` to `Order`**

In `backend/prisma/schema.prisma`, find the `OrderStatus` enum (currently at line ~270) and add `PENDING_PAYMENT`:

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  PENDING
  APPROVED
  NOT_FULFILLING
  READY_FOR_DELIVERY
  OUT_FOR_DELIVERY
  DELIVERED
  READY_FOR_PICKUP
  ARRIVED
  PICKED_UP
}
```

In the same file, find the `Order` model and add `transactionId` after `paymentMethod`:

```prisma
paymentMethod             String                    @default("EXTERNAL")
transactionId             String?                   @unique
```

`@unique` is required: it prevents the same Authorize.net transaction from confirming two different orders (replay protection). The service layer also checks this explicitly in Task 4 for a clean error message.

- [ ] **Step 2: Run migration**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npm run prisma:migrate
```

When prompted for a migration name, enter: `add_pending_payment_status_and_transaction_id`

Expected output: `The following migration(s) have been applied: .../add_pending_payment_status_and_transaction_id`

- [ ] **Step 3: Add `CC` to PaymentMethod constants in both backend and frontend**

In `backend/src/constants/orderMethods.ts`, update:

```typescript
export const PaymentMethod = {
  EXTERNAL: 'EXTERNAL',
  CREDIT: 'CREDIT',
  IN_STORE: 'IN_STORE',
  CC: 'CC',
} as const;
```

In `web/src/constants/orderMethods.js`, update:

```javascript
export const PaymentMethod = {
  EXTERNAL: 'EXTERNAL',
  CREDIT: 'CREDIT',
  IN_STORE: 'IN_STORE',
  CC: 'CC',
};
```

- [ ] **Step 4: Add `FRONTEND_URL` env var to backend**

In `backend/.env`, add:

```
FRONTEND_URL=http://localhost:3000
```

(In production this will be the actual domain, e.g. `https://smokestation.com`)

> **White-label note:** Authorize.net requires the iFrame communicator page to be same-origin with the page hosting the iFrame. A single static `FRONTEND_URL` is only correct if all white-label tenants are served from one domain. If tenants get their own domains later, derive the communicator origin from the request's `Origin` header validated against an allowlist. For now, single domain is assumed — this is a documented constraint, not a blocker.

- [ ] **Step 5: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/constants/orderMethods.ts web/src/constants/orderMethods.js
git commit -m "feat: add PENDING_PAYMENT order status, transactionId field, and CC payment method constant"
```

---

## Task 2: Extend PaymentSettings Service

**Files:**
- Modify: `backend/src/services/paymentSettings.service.ts`
- Modify: `backend/src/services/paymentSettings.service.test.ts`

- [ ] **Step 1: Write the failing tests for cc_payment settings**

Add to the end of `backend/src/services/paymentSettings.service.test.ts`:

```typescript
  it('returns cc_payment defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().getPaymentSettings();

    expect(result.cc_payment).toEqual({
      enabled: false,
      loginId: '',
      transactionKey: '',
      sandboxMode: true,
    });
  });

  it('saves and returns cc_payment credentials', async () => {
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: 'abc123', transactionKey: 'xyz789', sandboxMode: false },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().updatePaymentSettings(settings);

    expect(result.cc_payment).toEqual({ enabled: true, loginId: 'abc123', transactionKey: 'xyz789', sandboxMode: false });
  });

  it('throws when cc_payment is enabled but loginId is missing', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    const settings = {
      cashapp: { enabled: true, handle: '$x' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: '', transactionKey: 'xyz', sandboxMode: true },
    };

    await expect(new PaymentSettingsService().updatePaymentSettings(settings)).rejects.toThrow(
      'cc_payment.loginId is required when card payments are enabled'
    );
  });

  it('throws when cc_payment is enabled but transactionKey is missing', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    const settings = {
      cashapp: { enabled: true, handle: '$x' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: 'abc', transactionKey: '', sandboxMode: true },
    };

    await expect(new PaymentSettingsService().updatePaymentSettings(settings)).rejects.toThrow(
      'cc_payment.transactionKey is required when card payments are enabled'
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx vitest run src/services/paymentSettings.service.test.ts
```

Expected: 4 new tests fail.

- [ ] **Step 3: Update `paymentSettings.service.ts`**

Replace the full file content:

```typescript
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface PaymentMethodSettings {
  enabled: boolean;
  handle: string;
}

export interface CCPaymentSettings {
  enabled: boolean;
  loginId: string;
  transactionKey: string;
  sandboxMode: boolean;
}

export interface PaymentSettings {
  cashapp: PaymentMethodSettings;
  zelle: PaymentMethodSettings;
  venmo: PaymentMethodSettings;
  cc_payment: CCPaymentSettings;
}

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  cashapp: { enabled: true, handle: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
  cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
};

export class PaymentSettingsService {
  async getPaymentSettings(): Promise<PaymentSettings> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'payment_settings' },
    });

    if (!row) {
      return DEFAULT_PAYMENT_SETTINGS;
    }

    const stored = row.value as unknown as Partial<PaymentSettings>;
    return {
      ...DEFAULT_PAYMENT_SETTINGS,
      ...stored,
      cc_payment: {
        ...DEFAULT_PAYMENT_SETTINGS.cc_payment,
        ...(stored.cc_payment || {}),
      },
    };
  }

  async updatePaymentSettings(data: PaymentSettings): Promise<PaymentSettings> {
    this.validate(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'payment_settings' },
      update: { value: data as object },
      create: { key: 'payment_settings', value: data as object },
    });

    return row.value as unknown as PaymentSettings;
  }

  private validate(data: PaymentSettings): void {
    const methods = ['cashapp', 'zelle', 'venmo'] as const;

    for (const method of methods) {
      const entry = data[method];
      if (!entry || typeof entry.enabled !== 'boolean') {
        throw new AppError(`Invalid payment settings: ${method}.enabled must be a boolean`, 400);
      }
      if (typeof entry.handle !== 'string') {
        throw new AppError(`Invalid payment settings: ${method}.handle must be a string`, 400);
      }
      if (entry.handle.length > 64) {
        throw new AppError(`Invalid payment settings: ${method}.handle must be 64 characters or fewer`, 400);
      }
      if (method === 'cashapp' && entry.enabled && entry.handle && !entry.handle.startsWith('$')) {
        throw new AppError('CashApp handle must start with $', 400);
      }
    }

    const cc = data.cc_payment;
    if (!cc || typeof cc.enabled !== 'boolean') {
      throw new AppError('Invalid payment settings: cc_payment.enabled must be a boolean', 400);
    }
    if (cc.enabled) {
      if (!cc.loginId || cc.loginId.trim().length === 0) {
        throw new AppError('cc_payment.loginId is required when card payments are enabled', 400);
      }
      if (!cc.transactionKey || cc.transactionKey.trim().length === 0) {
        throw new AppError('cc_payment.transactionKey is required when card payments are enabled', 400);
      }
    }
    if (typeof cc.loginId !== 'string' || cc.loginId.length > 64) {
      throw new AppError('cc_payment.loginId must be a string of 64 characters or fewer', 400);
    }
    if (typeof cc.transactionKey !== 'string' || cc.transactionKey.length > 64) {
      throw new AppError('cc_payment.transactionKey must be a string of 64 characters or fewer', 400);
    }
  }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx vitest run src/services/paymentSettings.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add backend/src/services/paymentSettings.service.ts backend/src/services/paymentSettings.service.test.ts
git commit -m "feat: extend PaymentSettings with cc_payment credentials and validation"
```

---

## Task 3: AuthorizeNet Service

**Files:**
- Create: `backend/src/services/authorizenet.service.ts`
- Create: `backend/src/services/authorizenet.service.test.ts`

- [ ] **Step 1: Install the authorizenet SDK**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npm install authorizenet
```

Expected: `authorizenet` added to `backend/package.json` dependencies.

- [ ] **Step 2: Write the failing tests**

Create `backend/src/services/authorizenet.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error.middleware';

const mockSetEnvironment = vi.fn();
const mockGetHostedPageExecute = vi.fn();
const mockGetTransactionExecute = vi.fn();
let mockGetHostedPageResponse: unknown;
let mockGetTransactionResponse: unknown;

vi.mock('authorizenet', () => ({
  APIContracts: {
    MerchantAuthenticationType: vi.fn(() => ({ setName: vi.fn(), setTransactionKey: vi.fn() })),
    TransactionRequestType: vi.fn(() => ({ setTransactionType: vi.fn(), setAmount: vi.fn(), setOrder: vi.fn() })),
    OrderType: vi.fn(() => ({ setInvoiceNumber: vi.fn() })),
    TransactionTypeEnum: { AUTHCAPTURETRANSACTION: 'authCaptureTransaction' },
    SettingType: vi.fn(() => ({ setSettingName: vi.fn(), setSettingValue: vi.fn() })),
    ArrayOfSetting: vi.fn(() => ({ setSetting: vi.fn() })),
    GetHostedPaymentPageRequest: vi.fn(() => ({
      setMerchantAuthentication: vi.fn(),
      setTransactionRequest: vi.fn(),
      setHostedPaymentSettings: vi.fn(),
      getJSON: vi.fn(() => ({})),
    })),
    GetHostedPaymentPageResponse: vi.fn((r: unknown) => r),
    GetTransactionDetailsRequest: vi.fn(() => ({
      setMerchantAuthentication: vi.fn(),
      setTransId: vi.fn(),
      getJSON: vi.fn(() => ({})),
    })),
    GetTransactionDetailsResponse: vi.fn((r: unknown) => r),
    MessageTypeEnum: { OK: 'Ok' },
  },
  APIControllers: {
    GetHostedPaymentPageController: vi.fn(() => ({
      setEnvironment: mockSetEnvironment,
      execute: (cb: () => void) => { mockGetHostedPageExecute(); cb(); },
      getResponse: () => mockGetHostedPageResponse,
    })),
    GetTransactionDetailsController: vi.fn(() => ({
      setEnvironment: mockSetEnvironment,
      execute: (cb: () => void) => { mockGetTransactionExecute(); cb(); },
      getResponse: () => mockGetTransactionResponse,
    })),
  },
  SDKConstants: {
    endpoint: { sandbox: 'https://apitest.authorize.net', production: 'https://api2.authorize.net' },
  },
}));

const sandboxSettings = {
  enabled: true,
  loginId: 'testLogin',
  transactionKey: 'testKey',
  sandboxMode: true,
};

describe('AuthorizeNetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHostedPageToken', () => {
    it('returns token when SDK responds OK', async () => {
      mockGetHostedPageResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getToken: () => 'abc-token-123',
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      const token = await new AuthorizeNetService().getHostedPageToken(42, 41.14, 'https://example.com/communicator.html', sandboxSettings);

      expect(token).toBe('abc-token-123');
    });

    it('throws AppError when SDK returns non-OK result', async () => {
      mockGetHostedPageResponse = {
        getMessages: () => ({
          getResultCode: () => 'Error',
          getMessage: () => [{ getText: () => 'Invalid credentials' }],
        }),
        getToken: () => null,
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().getHostedPageToken(42, 41.14, 'https://example.com/communicator.html', sandboxSettings)
      ).rejects.toThrow(AppError);
    });

    it('uses sandbox endpoint when sandboxMode is true', async () => {
      mockGetHostedPageResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getToken: () => 'token',
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await new AuthorizeNetService().getHostedPageToken(1, 10, 'https://x.com/c.html', sandboxSettings);

      expect(mockSetEnvironment).toHaveBeenCalledWith('https://apitest.authorize.net');
    });
  });

  describe('verifyTransaction', () => {
    it('resolves when transaction is capturedPendingSettlement and amount matches', async () => {
      mockGetTransactionResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getTransaction: () => ({
          getTransactionStatus: () => 'capturedPendingSettlement',
          getAuthAmount: () => '41.14',
          getSettleAmount: () => null,
          getOrder: () => ({ getInvoiceNumber: () => '42' }),
        }),
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).resolves.toBeUndefined();
    });

    it('resolves when transaction is settledSuccessfully', async () => {
      mockGetTransactionResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getTransaction: () => ({
          getTransactionStatus: () => 'settledSuccessfully',
          getSettleAmount: () => '41.14',
          getAuthAmount: () => null,
          getOrder: () => ({ getInvoiceNumber: () => '42' }),
        }),
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).resolves.toBeUndefined();
    });

    it('throws AppError when transaction status is declined', async () => {
      mockGetTransactionResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getTransaction: () => ({
          getTransactionStatus: () => 'declined',
          getAuthAmount: () => '41.14',
          getSettleAmount: () => null,
          getOrder: () => ({ getInvoiceNumber: () => '42' }),
        }),
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).rejects.toThrow(AppError);
    });

    it('throws AppError when amount does not match', async () => {
      mockGetTransactionResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getTransaction: () => ({
          getTransactionStatus: () => 'capturedPendingSettlement',
          getAuthAmount: () => '10.00',
          getSettleAmount: () => null,
          getOrder: () => ({ getInvoiceNumber: () => '42' }),
        }),
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).rejects.toThrow('Payment amount mismatch');
    });

    it('throws AppError when transaction invoice does not match the order', async () => {
      mockGetTransactionResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getTransaction: () => ({
          getTransactionStatus: () => 'capturedPendingSettlement',
          getAuthAmount: () => '41.14',
          getSettleAmount: () => null,
          getOrder: () => ({ getInvoiceNumber: () => '999' }),
        }),
      };
      const { AuthorizeNetService } = await import('./authorizenet.service');

      await expect(
        new AuthorizeNetService().verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).rejects.toThrow('Payment is not associated with this order');
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx vitest run src/services/authorizenet.service.test.ts
```

Expected: module not found errors (service doesn't exist yet).

- [ ] **Step 4: Create `authorizenet.service.ts`**

Create `backend/src/services/authorizenet.service.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-require-imports */
const authorizenet = require('authorizenet');
const { APIContracts, APIControllers, SDKConstants } = authorizenet;

import { AppError } from '../middleware/error.middleware';
import { CCPaymentSettings } from './paymentSettings.service';

export class AuthorizeNetService {
  private getMerchantAuth(settings: CCPaymentSettings) {
    const auth = new APIContracts.MerchantAuthenticationType();
    auth.setName(settings.loginId);
    auth.setTransactionKey(settings.transactionKey);
    return auth;
  }

  private getEnvironment(sandboxMode: boolean): string {
    return sandboxMode ? SDKConstants.endpoint.sandbox : SDKConstants.endpoint.production;
  }

  async getHostedPageToken(
    orderId: number,
    amount: number,
    communicatorUrl: string,
    settings: CCPaymentSettings
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const transactionRequest = new APIContracts.TransactionRequestType();
      transactionRequest.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
      transactionRequest.setAmount(amount.toFixed(2));

      // Bind the transaction to the order so verifyTransaction can confirm the
      // payment belongs to this specific order, not just any order with the same total.
      const orderType = new APIContracts.OrderType();
      orderType.setInvoiceNumber(String(orderId));
      transactionRequest.setOrder(orderType);

      const communicatorSetting = new APIContracts.SettingType();
      communicatorSetting.setSettingName('hostedPaymentIFrameCommunicatorUrl');
      communicatorSetting.setSettingValue(JSON.stringify({ url: communicatorUrl }));

      const returnSetting = new APIContracts.SettingType();
      returnSetting.setSettingName('hostedPaymentReturnOptions');
      returnSetting.setSettingValue(JSON.stringify({
        showReceipt: false,
        url: communicatorUrl,
        urlText: 'Return',
        cancelUrl: communicatorUrl,
        cancelUrlText: 'Cancel',
      }));

      const settingList = new APIContracts.ArrayOfSetting();
      settingList.setSetting([communicatorSetting, returnSetting]);

      const request = new APIContracts.GetHostedPaymentPageRequest();
      request.setMerchantAuthentication(this.getMerchantAuth(settings));
      request.setTransactionRequest(transactionRequest);
      request.setHostedPaymentSettings(settingList);

      const controller = new APIControllers.GetHostedPaymentPageController(request.getJSON());
      controller.setEnvironment(this.getEnvironment(settings.sandboxMode));

      controller.execute(() => {
        const apiResponse = controller.getResponse();
        const response = new APIContracts.GetHostedPaymentPageResponse(apiResponse);

        if (!response || response.getMessages().getResultCode() !== APIContracts.MessageTypeEnum.OK) {
          const msgs = response?.getMessages()?.getMessage?.();
          return reject(new AppError(msgs?.[0]?.getText?.() ?? 'Failed to initialize payment', 502));
        }

        resolve(response.getToken());
      });
    });
  }

  async verifyTransaction(
    transId: string,
    expectedAmount: number,
    expectedOrderId: number,
    settings: CCPaymentSettings
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new APIContracts.GetTransactionDetailsRequest();
      request.setMerchantAuthentication(this.getMerchantAuth(settings));
      request.setTransId(transId);

      const controller = new APIControllers.GetTransactionDetailsController(request.getJSON());
      controller.setEnvironment(this.getEnvironment(settings.sandboxMode));

      controller.execute(() => {
        const apiResponse = controller.getResponse();
        const response = new APIContracts.GetTransactionDetailsResponse(apiResponse);

        if (!response || response.getMessages().getResultCode() !== APIContracts.MessageTypeEnum.OK) {
          return reject(new AppError('Could not verify payment transaction', 502));
        }

        const txn = response.getTransaction();
        const status: string = txn.getTransactionStatus();
        const validStatuses = ['settledSuccessfully', 'capturedPendingSettlement'];

        if (!validStatuses.includes(status)) {
          return reject(new AppError(`Payment not confirmed (status: ${status})`, 400));
        }

        const invoiceNumber = txn.getOrder?.()?.getInvoiceNumber?.();
        if (invoiceNumber !== String(expectedOrderId)) {
          return reject(new AppError('Payment is not associated with this order', 400));
        }

        const rawAmount = txn.getSettleAmount() ?? txn.getAuthAmount() ?? '0';
        const settledAmount = parseFloat(rawAmount);
        if (Math.abs(settledAmount - expectedAmount) > 0.01) {
          return reject(new AppError('Payment amount mismatch', 400));
        }

        resolve();
      });
    });
  }
}

export const authorizeNetService = new AuthorizeNetService();
```

- [ ] **Step 5: Run tests — all should pass**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx vitest run src/services/authorizenet.service.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add backend/src/services/authorizenet.service.ts backend/src/services/authorizenet.service.test.ts backend/package.json backend/package-lock.json
git commit -m "feat: add AuthorizeNet service wrapping Accept Hosted token and transaction verify"
```

---

## Task 4: Order Service — CC Payment Methods

**Files:**
- Modify: `backend/src/services/order.service.ts`

- [ ] **Step 1: Add the `PaymentSettingsService` and `authorizeNetService` imports**

In `backend/src/services/order.service.ts`, add these two imports after the existing imports:

```typescript
import { PaymentSettingsService } from './paymentSettings.service';
import { authorizeNetService } from './authorizenet.service';
```

Add a module-level instance after the existing service instantiations:

```typescript
const paymentSettingsService = new PaymentSettingsService();
```

- [ ] **Step 2: Modify `createOrder` to use `PENDING_PAYMENT` for CC and skip notifications**

In `order.service.ts`, find the `prisma.$transaction` block where `newOrder` is created. The line currently reads:

```typescript
status: OrderStatus.PENDING,
```

Change it to:

```typescript
status: effectivePaymentMethod === PaymentMethod.CC ? OrderStatus.PENDING_PAYMENT : OrderStatus.PENDING,
```

Then find the notification/printer block after `Order creation completed successfully` log (~line 733):

```typescript
await notificationEventsService.notifyOrderCreated(order.id, userId);
try {
  await thermalPrinterService.dispatchReceipt(order.id, 'ORDER_CREATED', {
    userId,
  });
} catch (printerError) {
```

Wrap it so CC orders skip this until payment is confirmed:

```typescript
if (effectivePaymentMethod !== PaymentMethod.CC) {
  await notificationEventsService.notifyOrderCreated(order.id, userId);
  try {
    await thermalPrinterService.dispatchReceipt(order.id, 'ORDER_CREATED', {
      userId,
    });
  } catch (printerError) {
    logger.error('Thermal printer dispatch threw unexpectedly after order creation', printerError, {
      orderId: order.id,
      userId,
    });
  }
}
```

- [ ] **Step 3: Add `getPaymentToken` and `confirmCardPayment` methods to `OrderService`**

Add these two methods to the `OrderService` class (at the end, before the closing brace):

```typescript
async getPaymentToken(orderId: number, userId: number): Promise<{ token: string; iframeUrl: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw new AppError('Order not found', 404);
  if (order.userId !== userId) throw new AppError('Not authorized', 403);
  if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
  if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

  const settings = await paymentSettingsService.getPaymentSettings();
  if (!settings.cc_payment?.enabled) throw new AppError('Card payments are not enabled', 400);

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const communicatorUrl = `${frontendUrl}/communicator.html`;

  const token = await authorizeNetService.getHostedPageToken(
    orderId,
    order.total,
    communicatorUrl,
    settings.cc_payment
  );

  const iframeUrl = settings.cc_payment.sandboxMode
    ? `https://test.authorize.net/payment/payment?token=${token}`
    : `https://accept.authorize.net/payment/payment?token=${token}`;

  return { token, iframeUrl };
}

async confirmCardPayment(orderId: number, userId: number, transId: string): Promise<{ id: number; status: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw new AppError('Order not found', 404);
  if (order.userId !== userId) throw new AppError('Not authorized', 403);
  if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
  if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

  // Replay protection: the same transaction must not confirm two orders.
  // The @unique constraint on transactionId is the hard backstop; this check gives a clean error.
  const duplicate = await prisma.order.findFirst({
    where: { transactionId: transId, NOT: { id: orderId } },
  });
  if (duplicate) throw new AppError('This payment has already been applied to another order', 400);

  const settings = await paymentSettingsService.getPaymentSettings();
  await authorizeNetService.verifyTransaction(transId, order.total, orderId, settings.cc_payment);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.PENDING, transactionId: transId },
  });

  await notificationEventsService.notifyOrderCreated(orderId, userId);
  try {
    await thermalPrinterService.dispatchReceipt(orderId, 'ORDER_CREATED', { userId });
  } catch (printerError) {
    logger.error('Thermal printer dispatch threw unexpectedly after CC payment confirmation', printerError, {
      orderId,
      userId,
    });
  }

  return { id: updated.id, status: updated.status };
}
```

- [ ] **Step 4: Run the existing order service tests to confirm nothing is broken**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx vitest run src/services/order.service.test.ts
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add backend/src/services/order.service.ts
git commit -m "feat: add CC payment methods to OrderService (getPaymentToken, confirmCardPayment)"
```

---

## Task 5: Order Payment Routes + Controller

**Files:**
- Modify: `backend/src/routes/order.routes.ts`
- Modify: `backend/src/controllers/order.controller.ts`

- [ ] **Step 1: Add the two route handlers to `order.controller.ts`**

In `backend/src/controllers/order.controller.ts`, find the `OrderController` class (or the exported controller object) and add:

```typescript
async getPaymentToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = parseInt(req.params.id, 10);
    const userId = (req as any).user.id;
    const result = await orderService.getPaymentToken(orderId, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = parseInt(req.params.id, 10);
    const userId = (req as any).user.id;
    const { transId } = req.body;
    const result = await orderService.confirmCardPayment(orderId, userId, transId);
    res.status(200).json({ message: 'Payment confirmed', order: result });
  } catch (error) {
    next(error);
  }
}
```

- [ ] **Step 2: Add the two routes to `order.routes.ts`**

In `backend/src/routes/order.routes.ts`, add these routes after the existing `POST /` (create order) route and before `PATCH /:id/status`:

```typescript
/**
 * @route   POST /api/orders/:id/payment/token
 * @desc    Get Authorize.net hosted payment page token for a PENDING_PAYMENT order
 * @access  Private (order owner only)
 */
router.post('/:id/payment/token', authenticate, orderController.getPaymentToken);

/**
 * @route   POST /api/orders/:id/payment/verify
 * @desc    Verify Authorize.net transaction and confirm order
 * @access  Private (order owner only)
 */
router.post(
  '/:id/payment/verify',
  authenticate,
  [body('transId').isString().notEmpty().withMessage('transId is required')],
  orderController.verifyPayment
);
```

- [ ] **Step 3: Verify the backend compiles**

```bash
cd /home/bilal/projects/smoke-station-delivery/backend && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add backend/src/routes/order.routes.ts backend/src/controllers/order.controller.ts
git commit -m "feat: add POST /orders/:id/payment/token and /payment/verify routes"
```

---

## Task 6: communicator.html + ordersApi Payment Functions

**Files:**
- Create: `web/public/communicator.html`
- Modify: `web/src/services/ordersApi.js`

- [ ] **Step 1: Create `communicator.html`**

Create `web/public/communicator.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <script type="text/javascript">
    function callParentFunction(str) {
      if (str && str.length > 0 && window.parent && window.parent.AuthorizeNetIFrame) {
        window.parent.AuthorizeNetIFrame.onReceiveCommunication(str);
      }
    }
    function receiveParams(urlParams) {
      callParentFunction(urlParams);
    }
  </script>
</head>
<body onload="receiveParams(window.location.search.substring(1))">
</body>
</html>
```

- [ ] **Step 2: Add `getPaymentToken` and `verifyPayment` to `ordersApi.js`**

In `web/src/services/ordersApi.js`, add after the existing `createOrder` function:

```javascript
/**
 * Get Authorize.net hosted payment page token for a PENDING_PAYMENT order
 * @param {number} orderId
 * @returns {Promise<{ token: string, iframeUrl: string }>}
 */
export const getPaymentToken = async (orderId) => {
  return post(`/orders/${orderId}/payment/token`, {});
};

/**
 * Verify Authorize.net transaction and confirm order
 * @param {number} orderId
 * @param {string} transId - Authorize.net transaction ID
 * @returns {Promise<{ message: string, order: object }>}
 */
export const verifyPayment = async (orderId, transId) => {
  return post(`/orders/${orderId}/payment/verify`, { transId });
};
```

- [ ] **Step 3: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/public/communicator.html web/src/services/ordersApi.js
git commit -m "feat: add communicator.html postMessage bridge and ordersApi payment functions"
```

---

## Task 7: AuthorizeNetPaymentModal Component

**Files:**
- Create: `web/src/features/cart/AuthorizeNetPaymentModal.jsx`
- Create: `web/src/features/cart/AuthorizeNetPaymentModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/features/cart/AuthorizeNetPaymentModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthorizeNetPaymentModal from './AuthorizeNetPaymentModal';

const defaultProps = {
  orderId: 42,
  iframeUrl: 'https://test.authorize.net/payment/payment?token=abc',
  amount: 41.14,
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onClose: vi.fn(),
};

describe('AuthorizeNetPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete window.AuthorizeNetIFrame;
  });

  it('renders the modal with order total', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    expect(screen.getByText(/Complete Payment/i)).toBeInTheDocument();
    expect(screen.getByText(/\$41\.14/i)).toBeInTheDocument();
  });

  it('renders an iframe with the provided iframeUrl', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.src).toBe(defaultProps.iframeUrl);
  });

  it('registers window.AuthorizeNetIFrame on mount and cleans up on unmount', () => {
    const { unmount } = render(<AuthorizeNetPaymentModal {...defaultProps} />);
    expect(window.AuthorizeNetIFrame).toBeDefined();
    unmount();
    expect(window.AuthorizeNetIFrame).toBeUndefined();
  });

  it('calls onClose when the X button is clicked', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when Authorize.net sends a cancel action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    window.AuthorizeNetIFrame.onReceiveCommunication('action=cancel');
    expect(defaultProps.onFailure).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when transactResponse has non-1 responseCode', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const response = JSON.stringify({ responseCode: '2', transId: '', responseReasonText: 'Declined' });
    window.AuthorizeNetIFrame.onReceiveCommunication(`action=transactResponse&response=${encodeURIComponent(response)}`);
    expect(defaultProps.onFailure).toHaveBeenCalledWith('Declined');
  });

  it('resizes the iframe when Authorize.net sends a resizeWindow action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    window.AuthorizeNetIFrame.onReceiveCommunication('action=resizeWindow&width=600&height=900');
    const iframe = document.querySelector('iframe');
    expect(iframe.height).toBe('900');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/cart/AuthorizeNetPaymentModal.test.jsx
```

Expected: module not found.

- [ ] **Step 3: Create `AuthorizeNetPaymentModal.jsx`**

Create `web/src/features/cart/AuthorizeNetPaymentModal.jsx`:

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { verifyPayment } from '../../services/ordersApi';

export default function AuthorizeNetPaymentModal({ orderId, iframeUrl, amount, onSuccess, onFailure, onClose }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [iframeHeight, setIframeHeight] = useState(500);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  });

  useEffect(() => {
    window.AuthorizeNetIFrame = {
      onReceiveCommunication: (querystr) => {
        const params = new URLSearchParams(querystr);
        const action = params.get('action');

        if (action === 'resizeWindow') {
          // Accept Hosted grows past its initial height on validation errors.
          const height = parseInt(params.get('height'), 10);
          if (!Number.isNaN(height)) setIframeHeight(Math.max(height, 400));
          return;
        }

        if (action === 'cancel') {
          onFailureRef.current('Payment cancelled');
          return;
        }

        if (action === 'transactResponse') {
          let response;
          try {
            response = JSON.parse(params.get('response'));
          } catch {
            onFailureRef.current('Invalid payment response');
            return;
          }

          if (response.responseCode !== '1') {
            onFailureRef.current(response.responseReasonText || 'Payment declined');
            return;
          }

          setVerifying(true);
          setVerifyError('');
          verifyPayment(orderId, response.transId)
            .then(() => onSuccessRef.current())
            .catch(() => {
              setVerifying(false);
              setVerifyError(
                `Payment may have gone through — contact support with order #${orderId} if your card was charged.`
              );
            });
        }
      },
    };

    return () => {
      delete window.AuthorizeNetIFrame;
    };
  }, [orderId]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="send-payment-modal">
        <div className="modal-header">
          <h3>Complete Payment · Order #{orderId}</h3>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="close"
            disabled={verifying}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {verifying ? (
            <div className="modal-verifying">
              <div className="spinner" />
              <p>Confirming your payment…</p>
            </div>
          ) : verifyError ? (
            <div className="modal-verify-error">
              <p>{verifyError}</p>
            </div>
          ) : (
            <iframe
              src={iframeUrl}
              title="Secure Card Payment"
              width="100%"
              height={iframeHeight}
              frameBorder="0"
              scrolling="no"
            />
          )}
        </div>

        <div className="modal-footer">
          <p>🔒 Total: <strong>${amount.toFixed(2)}</strong> — Card details processed by Authorize.Net</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/cart/AuthorizeNetPaymentModal.test.jsx
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/src/features/cart/AuthorizeNetPaymentModal.jsx web/src/features/cart/AuthorizeNetPaymentModal.test.jsx
git commit -m "feat: add AuthorizeNetPaymentModal iFrame component with postMessage bridge"
```

---

## Task 8: Checkout Payment Section UX Refresh (All Methods)

**Files:**
- Modify: `web/src/features/cart/CheckoutPage.jsx`
- Modify: `web/src/features/cart/CheckoutPage.css`

**Why this comes before the CC task:** the CC option (Task 9) and this refresh touch the same payment-method section of `CheckoutPage.jsx`. Building CC onto the old structure and restyling afterward would mean rewriting the CC markup within days. Refresh first, then add CC as one more card. This is a markup/CSS restructure only — all existing state, validation, and handlers stay unchanged.

**Target design (approved):**

```
Payment Method
┌─────────────────────────────────────┐
│ ◉ 📱 CashApp / Zelle / Venmo        │
│ ○ 🏦 Store Credit  ($25.00 avail)   │
│ ○ 🏬 Pay in Store  (pickup only)    │
└─────────────────────────────────────┘
┌─ Selected method detail ────────────┐
│ Send payment to: $SmokeStationHQ    │
│ Your CashApp username: [$______ ]   │
│ ℹ Put your order # in the memo      │
└─────────────────────────────────────┘
```

- Each payment method is a radio card row: icon + name + right-aligned meta badge.
  - **EXTERNAL** → `📱 CashApp / Zelle / Venmo` (no badge)
  - **CREDIT** → `🏦 Store Credit` with badge showing `$${creditBalance.toFixed(2)} available`
  - **IN_STORE** → `🏬 Pay in Store` with badge `pickup only` — rendered only when `isPickup`, exactly as today
- Below the card list, a single contextual detail box renders content for the *selected* method only:
  - **EXTERNAL**: the enabled handle lines (CashApp/Zelle/Venmo "Send payment to …"), the CashApp username input with its validation error, and the memo hint — i.e., relocate the existing blocks currently at `CheckoutPage.jsx:526-585` into the detail box unchanged
  - **CREDIT**: the existing `payment-credit-confirm` balance copy
  - **IN_STORE**: the existing "You'll pay $X when you arrive" copy

- [ ] **Step 1: Restructure the payment-method JSX in `CheckoutPage.jsx`**

Convert the existing radio `<label className="payment-method-option">` elements into the card pattern above (`payment-method-card` wrapper class alongside the existing `payment-method-option` class so existing selected-state logic keeps working). Move the per-method conditional blocks (`isExternalPayment`, `isCreditPayment`, `isInStorePayment`) into a single `payment-method-detail` container below the card group. Do not change any state variables, validation logic (`validateForm`), or the submit handler.

- [ ] **Step 2: Add card + detail box styles to `CheckoutPage.css`**

Style: card rows with border, hover state, `.selected` accent border/background, right-aligned `.payment-method-badge`, and the `.payment-method-detail` box with a subtle background. Reuse existing CSS variables/theme tokens used elsewhere in this file (the white-label theming work means colors must come from theme variables, not hardcoded hex).

- [ ] **Step 3: Run existing checkout tests and update selectors only**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/cart/CheckoutPage.test.jsx
```

Update test queries only where markup moved (e.g., text now inside the detail box). Behavior assertions must not change — if a behavior test fails, the refactor broke something; fix the refactor, not the test.

- [ ] **Step 4: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/src/features/cart/CheckoutPage.jsx web/src/features/cart/CheckoutPage.css web/src/features/cart/CheckoutPage.test.jsx
git commit -m "refactor: restructure checkout payment selection into radio cards with contextual detail box"
```

---

## Task 9: Add CC Payment to the Refreshed Checkout

**Files:**
- Modify: `web/src/features/cart/CheckoutPage.jsx`

- [ ] **Step 1: Add `CC` import to checkout constants**

In `web/src/features/cart/CheckoutPage.jsx`, find the import line:

```javascript
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';
```

No change needed — `CC` is already in `PaymentMethod` after Task 1.

- [ ] **Step 2: Add `AuthorizeNetPaymentModal` import**

Add this import at the top of `CheckoutPage.jsx`, after the `SendPaymentModal` import:

```javascript
import AuthorizeNetPaymentModal from './AuthorizeNetPaymentModal';
```

- [ ] **Step 3: Add state for the CC payment modal**

In `CheckoutPage.jsx`, find the existing `useState` declarations and add:

```javascript
const [ccPaymentModal, setCcPaymentModal] = useState(null); // { iframeUrl, orderId, amount, items, orderState } | null
const [paymentRetryOrder, setPaymentRetryOrder] = useState(null); // { orderId, amount, items, reason } | null
```

`items` is the pre-checkout cart snapshot — `checkout()` clears the cart, so the snapshot is required to restore it if the user abandons the CC payment (mirrors how `pendingOrderState.items` works for the EXTERNAL flow).

- [ ] **Step 3b: Extend the empty-cart redirect guard**

`CheckoutPage.jsx` redirects away when the cart is empty (currently the conditions at ~lines 200 and 205 check `!showSendPaymentModal` etc.). Because `checkout()` empties the cart, the page would redirect away *while the CC modal is open*. Add `&& !ccPaymentModal && !paymentRetryOrder` to both conditions (the `useEffect` and the early-return), and add both to the effect's dependency array.

- [ ] **Step 4: Add CC-specific derived state**

After the existing `isCreditPayment`, `isExternalPayment`, `isInStorePayment` derived values, add:

```javascript
const isCCPayment = selectedPaymentMethod === PaymentMethod.CC;
```

Also add the CC option to the `useEffect` that resets to EXTERNAL when delivery is selected and IN_STORE is active (find the effect that calls `setSelectedPaymentMethod(PaymentMethod.EXTERNAL)` and add a similar guard for CC if needed — CC is valid for delivery, so no change required there).

- [ ] **Step 5: Update the submit handler to handle CC flow**

In `CheckoutPage.jsx`, find the `handlePlaceOrder` function (or similar submit handler). After the existing order is created via `checkout(...)`, add a branch for CC:

Find the block that calls `checkout` and handles the response. Currently for EXTERNAL it opens `SendPaymentModal`. Add the CC branch alongside:

```javascript
// After checkout() returns the new order and orderState is built:
if (isCCPayment) {
  try {
    const { iframeUrl } = await ordersApi.getPaymentToken(newOrder.id);
    setCcPaymentModal({ iframeUrl, orderId: newOrder.id, amount: total, items: itemsForSuccess, orderState });
  } catch {
    // Token failed — delete the order and restore the cart (itemsForSuccess is the
    // existing pre-checkout snapshot already captured at the top of handlePlaceOrder)
    try {
      await deleteOrder(newOrder.id, { silent: true });
    } finally {
      restoreCart(itemsForSuccess);
      setErrors((prev) => ({ ...prev, payment: 'Could not initialize card payment. Please try again.' }));
    }
  }
  return;
}
```

Render `errors.payment` near the submit button using the existing `error-message` pattern.

Add the `ordersApi` import at the top of the file:

```javascript
import * as ordersApi from '../../services/ordersApi';
```

- [ ] **Step 6: Add the CC radio option to the payment method UI**

In `CheckoutPage.jsx`, add the CC option as one more card in the refreshed card group from Task 8, after the EXTERNAL card:

```jsx
{paymentSettings?.cc_payment?.enabled && (
  <label className={`payment-method-option payment-method-card ${isCCPayment ? 'selected' : ''}`}>
    <input
      type="radio"
      name="paymentMethod"
      value={PaymentMethod.CC}
      checked={isCCPayment}
      onChange={() => setSelectedPaymentMethod(PaymentMethod.CC)}
    />
    💳 Credit / Debit Card
    <span className="payment-method-badge">Secure</span>
  </label>
)}
```

And add the CC content to the contextual detail box (rendered when CC is selected, same place the EXTERNAL/CREDIT/IN_STORE detail content lives):

```jsx
{isCCPayment && (
  <div className="payment-cc-info">
    <p>You'll be taken to a secure payment form. Your order is placed first, then confirmed automatically once payment is complete.</p>
    <p className="payment-secure-note">🔒 Secured by Authorize.Net — card data never touches our servers</p>
  </div>
)}
```

- [ ] **Step 7: Render the `AuthorizeNetPaymentModal` and handle success/failure**

In `CheckoutPage.jsx`, in the JSX return, add the modal alongside the existing `SendPaymentModal`:

```jsx
{ccPaymentModal && (
  <AuthorizeNetPaymentModal
    orderId={ccPaymentModal.orderId}
    iframeUrl={ccPaymentModal.iframeUrl}
    amount={ccPaymentModal.amount}
    onSuccess={() => {
      setOrderCompleted(true);
      setCcPaymentModal(null);
      navigate('/order-success', { state: ccPaymentModal.orderState });
    }}
    onFailure={(reason) => {
      setCcPaymentModal(null);
      setPaymentRetryOrder({
        orderId: ccPaymentModal.orderId,
        amount: ccPaymentModal.amount,
        items: ccPaymentModal.items,
        orderState: ccPaymentModal.orderState,
        reason,
      });
    }}
    onClose={() => {
      setCcPaymentModal(null);
      setPaymentRetryOrder({
        orderId: ccPaymentModal.orderId,
        amount: ccPaymentModal.amount,
        items: ccPaymentModal.items,
        orderState: ccPaymentModal.orderState,
        reason: 'Payment not completed — you can retry below.',
      });
    }}
  />
)}
```

Notes: `checkout()` already cleared the cart, so there is no `clearCart()` call here; success navigates with the full `orderState` (same shape the EXTERNAL flow passes to `/order-success`); closing the modal shows the retry card rather than silently stranding the `PENDING_PAYMENT` order (per the design spec's error table).

In the JSX, when `paymentRetryOrder` is set, render (`paymentRetryOrder` state was added in Step 3):

```jsx
{paymentRetryOrder && (
  <div className="payment-retry-card">
    <div className="payment-retry-icon">⚠️</div>
    <h3>Payment Unsuccessful</h3>
    <p>{paymentRetryOrder.reason || 'Your card could not be processed. Your order has been saved.'}</p>
    <div className="payment-retry-order-info">
      <span>Order #{paymentRetryOrder.orderId}</span>
      <span>Total: ${paymentRetryOrder.amount?.toFixed(2)}</span>
    </div>
    <button
      className="btn-primary"
      onClick={async () => {
        try {
          const { iframeUrl } = await ordersApi.getPaymentToken(paymentRetryOrder.orderId);
          setCcPaymentModal({
            iframeUrl,
            orderId: paymentRetryOrder.orderId,
            amount: paymentRetryOrder.amount,
            items: paymentRetryOrder.items,
            orderState: paymentRetryOrder.orderState,
          });
          setPaymentRetryOrder(null);
        } catch {
          setErrors((prev) => ({ ...prev, payment: 'Could not retry payment. Please contact support.' }));
        }
      }}
    >
      🔄 Retry Card Payment
    </button>
    <button
      className="btn-secondary"
      onClick={async () => {
        // Abandoning the CC order: delete it (backend restores reserved stock)
        // and restore the cart so the user can re-checkout with another method.
        try {
          await deleteOrder(paymentRetryOrder.orderId, { silent: true });
        } catch {
          // Restore the cart even if cleanup fails — matches handleSendPaymentCancel.
        } finally {
          if (paymentRetryOrder.items?.length) {
            restoreCart(paymentRetryOrder.items);
          }
          setPaymentRetryOrder(null);
          setSelectedPaymentMethod(PaymentMethod.EXTERNAL);
        }
      }}
    >
      Switch to CashApp / Zelle / Venmo
    </button>
  </div>
)}
```


- [ ] **Step 8: Update the submit button label for CC**

Find the checkout submit button label. Add the CC case:

```jsx
{isCCPayment ? 'Place Order & Pay →' : isInStorePayment ? 'Place Order' : 'Place Order'}
```

- [ ] **Step 9: Run existing checkout tests**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/cart/CheckoutPage.test.jsx
```

Expected: all existing tests pass (new CC option is feature-flagged behind `paymentSettings.cc_payment.enabled` so existing tests are unaffected).

- [ ] **Step 10: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/src/features/cart/CheckoutPage.jsx
git commit -m "feat: add CC payment option to checkout with AuthorizeNet iFrame modal and retry flow"
```

---

## Task 10: Admin Credentials UI

**Files:**
- Modify: `web/src/features/website/components/WebsitePaymentSection.jsx`

- [ ] **Step 1: Update `WebsitePaymentSection.jsx` to add the Authorize.net credentials card**

Replace the full content of `web/src/features/website/components/WebsitePaymentSection.jsx`:

```jsx
import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { updatePaymentSettings } from '../../../services/paymentSettingsApi';
import PaymentSettingsSection from '../../dashboard/components/PaymentSettingsSection';

function AuthorizeNetCredentialsCard({ paymentSettings, onSave }) {
  const cc = paymentSettings?.cc_payment ?? { enabled: false, loginId: '', transactionKey: '', sandboxMode: true };
  const [enabled, setEnabled] = useState(cc.enabled);
  const [loginId, setLoginId] = useState(cc.loginId);
  const [transactionKey, setTransactionKey] = useState(cc.transactionKey);
  const [sandboxMode, setSandboxMode] = useState(cc.sandboxMode);
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...paymentSettings,
        cc_payment: { enabled, loginId, transactionKey, sandboxMode },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payment-method-card authnet-card">
      <div className="payment-method-card-header">
        <span className="payment-method-icon">💳</span>
        <div className="payment-method-info">
          <div className="payment-method-name">Credit / Debit Card (Authorize.Net)</div>
          <div className="payment-method-desc">Accept card payments via hosted payment form</div>
        </div>
        <label className="payment-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="toggle-label">{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div className="payment-credentials-toggle">
        <button
          className={`cred-expand-btn ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          🔑 API Credentials {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="payment-credentials-body">
          <p className="cred-warning">
            ⚠️ Keep these credentials private. Anyone with access can process charges on your account.
          </p>

          <div className="cred-field">
            <label htmlFor="authnet-login-id">API Login ID</label>
            <input
              id="authnet-login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Your Authorize.Net Login ID"
              maxLength={64}
              autoComplete="off"
            />
            <p className="cred-hint">Found in Authorize.Net → Account → Security Settings.</p>
          </div>

          <div className="cred-field">
            <label htmlFor="authnet-txn-key">Transaction Key</label>
            <div className="cred-input-wrap">
              <input
                id="authnet-txn-key"
                type={showKey ? 'text' : 'password'}
                value={transactionKey}
                onChange={(e) => setTransactionKey(e.target.value)}
                placeholder="Your transaction key"
                maxLength={64}
                autoComplete="off"
              />
              <button
                type="button"
                className="cred-eye-btn"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide transaction key' : 'Show transaction key'}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="cred-hint">Generate in Authorize.Net → Account → Security Settings → Transaction Key.</p>
          </div>

          <label className="cred-sandbox-row">
            <input
              type="checkbox"
              checked={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.checked)}
            />
            Sandbox / Test Mode
            <span className="cred-sandbox-hint">(Disable for live transactions)</span>
          </label>

          <button
            className="btn-primary cred-save-btn"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function WebsitePaymentSection() {
  const { paymentSettings, loadConfig, showNotification } = useApp();

  const handleSave = async (data) => {
    try {
      await updatePaymentSettings(data);
      await loadConfig();
      showNotification('Payment settings saved', 'success');
    } catch {
      showNotification('Failed to save payment settings', 'error');
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Payment Methods</h2>
      <AuthorizeNetCredentialsCard paymentSettings={paymentSettings} onSave={handleSave} />
      <PaymentSettingsSection paymentSettings={paymentSettings} onSave={handleSave} isLoading={false} />
    </div>
  );
}
```

- [ ] **Step 2: Add a render test for the credentials card**

Add a `WebsitePaymentSection.test.jsx` (or extend the existing one if present) covering at minimum: the Authorize.Net card renders, the credentials section is collapsed by default, expanding reveals the Login ID and masked Transaction Key inputs, and the eye toggle switches the key input type. Mock `useApp` and `updatePaymentSettings` following the patterns in existing feature tests.

- [ ] **Step 3: Run frontend tests**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/website
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/src/features/website/components/
git commit -m "feat: add Authorize.Net credentials card to Website Management payment settings"
```

---

## Task 11: PENDING_PAYMENT Lifecycle (Customer Retry/Cancel + Status Labels)

**Files:**
- Modify: `web/src/constants/orderStatuses.js`
- Modify: `web/src/features/orders/CustomerOrderList.jsx`
- Modify: `web/src/features/orders/OrderHistoryPage.jsx` (status filter options)

**Why this task exists:** the design spec promises "Retry available from Order History," and abandoned `PENDING_PAYMENT` orders hold reserved stock (`createOrder` decrements stock in its transaction; `deleteOrder` at `order.service.ts:1108` restores it). Without this task, a customer who closes the browser mid-payment leaves an order that is invisible to them (CustomerOrderList's `ACTIVE_STATUSES` allowlist), invisible to staff (by design), and permanently holding inventory.

- [ ] **Step 1: Add the status constant and label**

In `web/src/constants/orderStatuses.js`, add `PENDING_PAYMENT: 'PENDING_PAYMENT'` to `OrderStatus`. Find where status options/labels are defined (e.g., `STATUS_OPTIONS` used by `OrderHistoryPage.jsx:76`) and add `{ value: 'PENDING_PAYMENT', label: 'Awaiting Payment' }`.

- [ ] **Step 2: Surface PENDING_PAYMENT orders to the customer in `CustomerOrderList.jsx`**

- Add `'PENDING_PAYMENT'` to the `ACTIVE_STATUSES` array (`CustomerOrderList.jsx:8`) so the order is visible to its owner.
- For an order with `status === 'PENDING_PAYMENT'`, render an "Awaiting Payment" badge instead of the status stepper (map it to stepper index 0 in `DELIVERY_STATUS_INDEX`/`PICKUP_STATUS_INDEX` as a fallback), plus two actions:
  - **Complete Payment** — calls `ordersApi.getPaymentToken(order.id)` and opens `AuthorizeNetPaymentModal` (reuse the component from Task 7; on success, refresh the order list; on failure/close, just close the modal — the retry button remains).
  - **Cancel Order** — calls the existing `deleteOrder` (restores stock), then refreshes the list. Confirm with the existing confirmation pattern used elsewhere in this component if one exists.

- [ ] **Step 3: Verify staff surfaces exclude or label PENDING_PAYMENT**

Check the staff order workflow (`OrdersPage.jsx` / `OrdersWorkflow`): confirm `PENDING_PAYMENT` orders do not appear in the active fulfillment queue (the spec assumes staff only see `PENDING` and above). If the staff query/filter is status-allowlist based, no change is needed — verify and note the finding. `OrderHistoryPage` (admin, all orders) should show them with the "Awaiting Payment" label from Step 1.

- [ ] **Step 4: Run order feature tests**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npx vitest run src/features/orders
```

Expected: all tests pass (add/update tests for the new badge and actions following the existing patterns in `CustomerOrderList.test.jsx`).

- [ ] **Step 5: Full test suites + final commit**

```bash
cd /home/bilal/projects/smoke-station-delivery/web && npm test
cd /home/bilal/projects/smoke-station-delivery/backend && npm test
```

Expected: all tests pass.

```bash
cd /home/bilal/projects/smoke-station-delivery
git add web/src/constants/orderStatuses.js web/src/features/orders/
git commit -m "feat: surface PENDING_PAYMENT orders to customers with Complete Payment and Cancel actions"
```

---

## Done

All tasks complete. The Authorize.net Accept Hosted iFrame integration is fully wired:

1. ✅ DB: `PENDING_PAYMENT` status + unique `transactionId` field (replay protection)
2. ✅ Backend: credentials stored/validated in `paymentSettings`, SDK-wrapped service with order↔transaction invoice binding, two new order routes
3. ✅ Checkout UX: payment selection refreshed into radio cards + contextual detail box for all methods
4. ✅ Frontend: `communicator.html` postMessage bridge, `AuthorizeNetPaymentModal` (with dynamic resize), CC option in checkout with retry/abandon recovery, credentials UI in admin
5. ✅ Lifecycle: customers can retry or cancel `PENDING_PAYMENT` orders from their order list (cancel restores stock); staff surfaces label/exclude the new status
6. ✅ All existing tests unaffected (CC option is feature-flagged)

To test end-to-end: configure sandbox credentials in Website Management → Payment Methods → API Credentials, enable CC, place a test order, use Authorize.net sandbox card `4111111111111111` expiry `12/26` CVV `123`.
