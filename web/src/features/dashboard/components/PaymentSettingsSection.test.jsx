import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentSettingsSection from './PaymentSettingsSection';

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
});
