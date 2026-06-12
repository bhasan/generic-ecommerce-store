import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import { AuthorizeNetService } from './authorizenet.service';

let mockGetHostedPageResponse: unknown;
let mockGetTransactionResponse: unknown;

const mockSetEnvironment = vi.fn();

function makeMockSDK() {
  return {
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
        execute: (cb: () => void) => { cb(); },
        getResponse: () => mockGetHostedPageResponse,
      })),
      GetTransactionDetailsController: vi.fn(() => ({
        setEnvironment: mockSetEnvironment,
        execute: (cb: () => void) => { cb(); },
        getResponse: () => mockGetTransactionResponse,
      })),
    },
    Constants: {
      endpoint: { sandbox: 'https://apitest.authorize.net', production: 'https://api2.authorize.net' },
    },
  };
}

const sandboxSettings = {
  enabled: true,
  loginId: 'testLogin',
  transactionKey: 'testKey',
  sandboxMode: true,
};

describe('AuthorizeNetService', () => {
  let mockSDK: ReturnType<typeof makeMockSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSDK = makeMockSDK();
  });

  describe('getHostedPageToken', () => {
    it('returns token when SDK responds OK', async () => {
      mockGetHostedPageResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getToken: () => 'abc-token-123',
      };

      const token = await new AuthorizeNetService(mockSDK).getHostedPageToken(42, 41.14, 'https://example.com/communicator.html', sandboxSettings);

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

      await expect(
        new AuthorizeNetService(mockSDK).getHostedPageToken(42, 41.14, 'https://example.com/communicator.html', sandboxSettings)
      ).rejects.toThrow(AppError);
    });

    it('uses sandbox endpoint when sandboxMode is true', async () => {
      mockGetHostedPageResponse = {
        getMessages: () => ({ getResultCode: () => 'Ok' }),
        getToken: () => 'token',
      };

      await new AuthorizeNetService(mockSDK).getHostedPageToken(1, 10, 'https://x.com/c.html', sandboxSettings);

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

      await expect(
        new AuthorizeNetService(mockSDK).verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
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

      await expect(
        new AuthorizeNetService(mockSDK).verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
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

      await expect(
        new AuthorizeNetService(mockSDK).verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
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

      await expect(
        new AuthorizeNetService(mockSDK).verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
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

      await expect(
        new AuthorizeNetService(mockSDK).verifyTransaction('txn-123', 41.14, 42, sandboxSettings)
      ).rejects.toThrow('Payment is not associated with this order');
    });
  });
});
