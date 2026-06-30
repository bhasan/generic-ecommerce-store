import { get, post, patch } from './api';

// Admin-only tenant management API. Mounted at /api/admin/tenants on the backend
// (requires authenticate + ADMIN role). The reportingToken / printAgentKey
// returned by createTenant and regenerateTokens are PLAINTEXT and shown ONCE.

export const listTenants = () => get('/admin/tenants');

export const createTenant = (body) => post('/admin/tenants', body);

export const setTenantStatus = (id, status) =>
  patch(`/admin/tenants/${id}/status`, { status });

export const regenerateTokens = (id) =>
  post(`/admin/tenants/${id}/regenerate-tokens`);
