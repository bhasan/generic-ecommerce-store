import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminActivityPage from './AdminActivityPage';

vi.mock('../../../services/tenantApi');

import { getTenantAudit } from '../../../services/tenantApi';

beforeEach(() => vi.clearAllMocks());

describe('AdminActivityPage', () => {
  it('loads the audit feed and passes the ?tenant= filter through', async () => {
    getTenantAudit.mockResolvedValue([
      { id: 1, action: 'TENANT_DELETED', targetTenantId: 5, actorUsername: 'root', detail: { from: 'ACTIVE', to: 'DELETED' }, createdAt: '2026-07-01T00:00:00Z' },
    ]);

    const { findByText } = render(
      <MemoryRouter initialEntries={['/admin/activity?tenant=5']}>
        <AdminActivityPage />
      </MemoryRouter>,
    );

    await findByText('TENANT_DELETED');
    await waitFor(() => expect(getTenantAudit).toHaveBeenCalledWith({ tenantId: '5', action: undefined }));
    await findByText('root');
  });
});
