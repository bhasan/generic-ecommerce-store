import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebsitePaymentSection from './WebsitePaymentSection';
import * as paymentSettingsApi from '../../../services/paymentSettingsApi';

vi.mock('../../../context/AppContext', () => ({
  useApp: () => ({
    paymentSettings: {
      cashapp: { enabled: true, handle: '$Test' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: false, loginId: 'myLoginId', transactionKey: 'myTxnKey', sandboxMode: true },
    },
    loadConfig: vi.fn().mockResolvedValue(undefined),
    showNotification: vi.fn(),
  }),
}));

vi.mock('../../../services/paymentSettingsApi', () => ({
  updatePaymentSettings: vi.fn(),
}));

// PaymentSettingsSection renders CashApp/Zelle/Venmo controls — stub it to keep tests focused
vi.mock('../../dashboard/components/PaymentSettingsSection', () => ({
  default: () => <div data-testid="payment-settings-section" />,
}));

describe('WebsitePaymentSection – AuthorizeNetCredentialsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentSettingsApi.updatePaymentSettings).mockResolvedValue(undefined);
  });

  it('renders the Authorize.Net card with a heading and toggle', () => {
    render(<WebsitePaymentSection />);
    expect(screen.getByText(/Credit \/ Debit Card/i)).toBeInTheDocument();
    expect(screen.getByText(/Disabled/i)).toBeInTheDocument();
  });

  it('credentials section is collapsed by default', () => {
    render(<WebsitePaymentSection />);
    expect(screen.queryByLabelText(/API Login ID/i)).not.toBeInTheDocument();
  });

  it('expanding the credentials section reveals Login ID and masked Transaction Key inputs', () => {
    render(<WebsitePaymentSection />);
    fireEvent.click(screen.getByText(/API Credentials/i));
    expect(screen.getByLabelText(/API Login ID/i)).toBeInTheDocument();
    const txnInput = document.getElementById('authnet-txn-key');
    expect(txnInput).toBeTruthy();
    expect(txnInput.type).toBe('password');
  });

  it('eye toggle reveals and re-masks the transaction key', () => {
    render(<WebsitePaymentSection />);
    fireEvent.click(screen.getByText(/API Credentials/i));
    const txnInput = document.getElementById('authnet-txn-key');
    const eyeBtn = screen.getByRole('button', { name: /show transaction key/i });
    fireEvent.click(eyeBtn);
    expect(txnInput.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /hide transaction key/i }));
    expect(txnInput.type).toBe('password');
  });

  it('saves credentials when Save Credentials is clicked', async () => {
    render(<WebsitePaymentSection />);
    fireEvent.click(screen.getByText(/API Credentials/i));
    fireEvent.click(screen.getByRole('button', { name: /save credentials/i }));
    await waitFor(() => expect(paymentSettingsApi.updatePaymentSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        cc_payment: expect.objectContaining({ loginId: 'myLoginId', transactionKey: 'myTxnKey' }),
      })
    ));
  });
});
