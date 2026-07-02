import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminTenantsPage from './AdminTenantsPage';
import * as tenantApi from '../../../services/tenantApi';

vi.mock('../../../services/tenantApi', () => ({
  listTenants: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  setTenantStatus: vi.fn(),
  deleteTenant: vi.fn(),
  regenerateTokens: vi.fn(),
  getTenantAudit: vi.fn(),
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

const renderPage = () => render(<MemoryRouter><AdminTenantsPage /></MemoryRouter>);

describe('AdminTenantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantApi.listTenants).mockResolvedValue(SAMPLE);
  });

  it('renders the tenant list from the API on mount', async () => {
    renderPage();
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

    renderPage();
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

    renderPage();
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
    renderPage();
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

    renderPage();
    await screen.findByText('ACTIVE');

    fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'SUSPENDED'));
    expect(await screen.findByText('SUSPENDED')).toBeInTheDocument();
  });

  it('shows Activate button for a SUSPENDED tenant and calls setTenantStatus with ACTIVE', async () => {
    const suspendedList = [{ ...SAMPLE[0], status: 'SUSPENDED' }];
    vi.mocked(tenantApi.listTenants).mockResolvedValue(suspendedList);
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});

    renderPage();
    await screen.findByText('SUSPENDED');

    fireEvent.click(screen.getByRole('button', { name: /Activate/i }));
    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'ACTIVE'));
  });

  it('shows regenerated tokens in the panel after clicking Regenerate tokens', async () => {
    vi.mocked(tenantApi.regenerateTokens).mockResolvedValue({
      reportingToken: 'RPT-REGEN-789',
      printAgentKey: 'PRINT-REGEN-012',
    });

    renderPage();
    await screen.findByText('acme');

    fireEvent.click(screen.getByRole('button', { name: /Regenerate tokens/i }));
    await waitFor(() => expect(tenantApi.regenerateTokens).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('RPT-REGEN-789')).toBeInTheDocument();
    expect(screen.getByText('PRINT-REGEN-012')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });

  it('soft-deletes a tenant via the Delete action (after confirm)', async () => {
    vi.mocked(tenantApi.deleteTenant).mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await screen.findByText('acme');
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => expect(tenantApi.deleteTenant).toHaveBeenCalledWith('t1'));
  });

  it('reloads with a status filter when the filter changes', async () => {
    renderPage();
    await waitFor(() => expect(tenantApi.listTenants).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'DELETED' } });

    await waitFor(() => expect(tenantApi.listTenants).toHaveBeenCalledWith('DELETED'));
  });

  it('shows Restore for a DELETED tenant and reactivates it', async () => {
    vi.mocked(tenantApi.listTenants).mockResolvedValue([{ ...SAMPLE[0], status: 'DELETED' }]);
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});

    renderPage();
    await screen.findByText('DELETED');
    fireEvent.click(screen.getByRole('button', { name: /Restore/i }));

    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'ACTIVE'));
  });

  it('edits name/plan via updateTenant', async () => {
    vi.mocked(tenantApi.updateTenant).mockResolvedValue({});
    renderPage();
    await screen.findByText('acme');

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/Edit name/i), { target: { value: 'Acme Renamed' } });
    fireEvent.change(screen.getByLabelText(/Edit plan/i), { target: { value: 'enterprise' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(tenantApi.updateTenant).toHaveBeenCalledWith('t1', { name: 'Acme Renamed', plan: 'enterprise' }));
  });
});
