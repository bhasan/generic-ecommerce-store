import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TenantsPage from './TenantsPage';
import * as tenantApi from '../../../services/tenantApi';

vi.mock('../../../services/tenantApi', () => ({
  listTenants: vi.fn(),
  createTenant: vi.fn(),
  setTenantStatus: vi.fn(),
  regenerateTokens: vi.fn(),
}));

const SAMPLE = [
  {
    id: 't1',
    slug: 'acme',
    name: 'Acme Co',
    status: 'ACTIVE',
    plan: 'pro',
    hasReportingToken: true,
    hasPrintKey: false,
  },
];

describe('TenantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantApi.listTenants).mockResolvedValue(SAMPLE);
  });

  it('renders the tenant list from the API on mount', async () => {
    render(<TenantsPage />);
    expect(await screen.findByText('acme')).toBeInTheDocument();
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(tenantApi.listTenants).toHaveBeenCalled();
  });

  it('shows plaintext tokens once after creating a tenant', async () => {
    vi.mocked(tenantApi.createTenant).mockResolvedValue({
      tenant: { id: 't2', slug: 'newco', name: 'New Co', status: 'ACTIVE' },
      reportingToken: 'RPT-PLAINTEXT-123',
      printAgentKey: 'PRINT-PLAINTEXT-456',
    });

    render(<TenantsPage />);
    await screen.findByText('acme');

    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: 'newco' } });
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'New Co' } });
    fireEvent.change(screen.getByLabelText(/Admin username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Admin password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Create tenant/i }));

    await waitFor(() => expect(tenantApi.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'newco', name: 'New Co', adminUsername: 'admin', adminPassword: 'secret' })
    ));
    expect(await screen.findByText('RPT-PLAINTEXT-123')).toBeInTheDocument();
    expect(screen.getByText('PRINT-PLAINTEXT-456')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });

  it('surfaces a visible error when create fails (e.g. duplicate slug)', async () => {
    vi.mocked(tenantApi.createTenant).mockRejectedValue(new Error('slug already exists'));

    render(<TenantsPage />);
    await screen.findByText('acme');

    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: 'acme' } });
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText(/Admin username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Admin password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Create tenant/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/slug already exists/i);
  });

  it('toggles tenant status via the API', async () => {
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});
    render(<TenantsPage />);
    await screen.findByText('acme');

    fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'SUSPENDED'));
  });

  it('reflects SUSPENDED status badge in the table after re-fetch on suspend', async () => {
    const suspendedList = [{ ...SAMPLE[0], status: 'SUSPENDED' }];
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});
    // First call (mount) → ACTIVE; second call (after suspend) → SUSPENDED
    vi.mocked(tenantApi.listTenants)
      .mockResolvedValueOnce(SAMPLE)
      .mockResolvedValueOnce(suspendedList);

    render(<TenantsPage />);
    await screen.findByText('ACTIVE');

    fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'SUSPENDED'));
    expect(await screen.findByText('SUSPENDED')).toBeInTheDocument();
  });

  it('shows Activate button for a SUSPENDED tenant and calls setTenantStatus with ACTIVE', async () => {
    const suspendedList = [{ ...SAMPLE[0], status: 'SUSPENDED' }];
    vi.mocked(tenantApi.listTenants).mockResolvedValue(suspendedList);
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});

    render(<TenantsPage />);
    await screen.findByText('SUSPENDED');

    fireEvent.click(screen.getByRole('button', { name: /Activate/i }));
    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'ACTIVE'));
  });

  it('shows regenerated tokens in the panel after clicking Regenerate tokens', async () => {
    vi.mocked(tenantApi.regenerateTokens).mockResolvedValue({
      reportingToken: 'RPT-REGEN-789',
      printAgentKey: 'PRINT-REGEN-012',
    });

    render(<TenantsPage />);
    await screen.findByText('acme');

    fireEvent.click(screen.getByRole('button', { name: /Regenerate tokens/i }));
    await waitFor(() => expect(tenantApi.regenerateTokens).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('RPT-REGEN-789')).toBeInTheDocument();
    expect(screen.getByText('PRINT-REGEN-012')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });
});
