import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentSettingsSection from './PaymentSettingsSection';

const validSettings = {
  cashapp: { enabled: true, handle: '$StoreHandle' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
};

const renderSection = (overrides = {}) =>
  render(
    <PaymentSettingsSection
      isLoading={false}
      paymentSettings={validSettings}
      onSave={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  );

describe('PaymentSettingsSection', () => {
  it('loads existing payment settings into the form and saves edits', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <PaymentSettingsSection
        isLoading={false}
        paymentSettings={{
          cashapp: { enabled: true, handle: '$SmokeStationHQ' },
          zelle: { enabled: true, handle: 'billing@example.com' },
          venmo: { enabled: false, handle: '' },
        }}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/cashapp handle/i), {
      target: { value: '$UpdatedSmokeStation' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      cashapp: { enabled: true, handle: '$UpdatedSmokeStation' },
      zelle: { enabled: true, handle: 'billing@example.com' },
      venmo: { enabled: false, handle: '' },
    }));
  });

  describe('validation', () => {
    it('blocks save and shows error when CashApp is enabled but handle is empty', async () => {
      const onSave = vi.fn();
      renderSection({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(/cashapp handle is required/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('blocks save and shows error when CashApp handle does not start with $', async () => {
      const onSave = vi.fn();
      renderSection({
        paymentSettings: { cashapp: { enabled: true, handle: 'NoPrefix' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(/must start with \$/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('blocks save and shows error when Zelle is enabled but handle is empty', async () => {
      const onSave = vi.fn();
      renderSection({
        paymentSettings: { cashapp: { enabled: false, handle: '' }, zelle: { enabled: true, handle: '' }, venmo: { enabled: false, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(/zelle.*required/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('blocks save and shows error when Venmo is enabled but handle is empty', async () => {
      const onSave = vi.fn();
      renderSection({
        paymentSettings: { cashapp: { enabled: false, handle: '' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: true, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(/venmo.*required/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('clears the error when the user starts typing in the handle field', async () => {
      renderSection({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(await screen.findByText(/cashapp handle is required/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/cashapp handle/i), { target: { value: '$' } });
      expect(screen.queryByText(/cashapp handle is required/i)).not.toBeInTheDocument();
    });

    it('does not show errors for disabled methods even when their handles are empty', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderSection({
        paymentSettings: { cashapp: { enabled: true, handle: '$Valid' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it('shows errors for all invalid enabled methods simultaneously', async () => {
      const onSave = vi.fn();
      renderSection({
        paymentSettings: { cashapp: { enabled: true, handle: '' }, zelle: { enabled: true, handle: '' }, venmo: { enabled: false, handle: '' } },
        onSave,
      });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(/cashapp handle is required/i)).toBeInTheDocument();
      expect(screen.getByText(/zelle.*required/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
