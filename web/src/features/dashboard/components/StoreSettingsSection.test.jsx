import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoreSettingsSection from './StoreSettingsSection';

describe('StoreSettingsSection', () => {
  it('saves edited store name and pickup location values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <StoreSettingsSection
        isLoading={false}
        storeSettings={{
          name: 'Smoke Station',
          address: '101 Example Ave',
          phoneNumber: '555-0100',
        }}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/store name/i), {
      target: { value: 'Smoke Station West' },
    });
    fireEvent.change(screen.getByLabelText(/address \/ pickup location/i), {
      target: { value: '202 Updated Ave' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      name: 'Smoke Station West',
      address: '202 Updated Ave',
      phoneNumber: '555-0100',
      notificationEmails: {
        adminEmail: '',
        managementEmail: '',
        employeeEmail: '',
      },
    }));
  });
});
