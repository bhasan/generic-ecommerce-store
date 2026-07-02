import { get, post, patch, del } from './api';

// Platform (super-admin) tenant management API. Mounted at /api/admin/tenants on
// the backend (requires authenticate + SUPER_ADMIN). The reportingToken /
// printAgentKey returned by createTenant and regenerateTokens are PLAINTEXT and
// shown ONCE.

export const listTenants = (status) =>
  get(`/admin/tenants${status ? `?status=${encodeURIComponent(status)}` : ''}`);

export const createTenant = (body) => post('/admin/tenants', body);

export const updateTenant = (id, body) => patch(`/admin/tenants/${id}`, body);

export const setTenantStatus = (id, status) =>
  patch(`/admin/tenants/${id}/status`, { status });

export const deleteTenant = (id) => del(`/admin/tenants/${id}`);

export const regenerateTokens = (id) =>
  post(`/admin/tenants/${id}/regenerate-tokens`);

export const getTenantAudit = ({ tenantId, action } = {}) => {
  const qs = new URLSearchParams();
  if (tenantId != null) qs.set('tenantId', String(tenantId));
  if (action) qs.set('action', action);
  const q = qs.toString();
  return get(`/admin/tenants/audit${q ? `?${q}` : ''}`);
};
