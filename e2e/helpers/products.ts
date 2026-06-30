import { APIRequestContext } from '@playwright/test';
import { mintBearerToken } from './auth';
import { ACCOUNTS } from './accounts';

// Authenticated fetch of the product catalog (the endpoint now requires login).
export async function fetchProducts(request: APIRequestContext): Promise<any[]> {
  const token = await mintBearerToken(request, ACCOUNTS.customer);
  const res = await request.get('http://localhost:3000/api/products', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`GET /api/products failed: HTTP ${res.status()}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : body.data) ?? [];
}
