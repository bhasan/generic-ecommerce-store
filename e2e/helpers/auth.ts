import { Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { Account } from './accounts';

const BACKEND_API = 'http://localhost:3000/api';

/**
 * Mint a short-lived bearer token for the given account via direct API login.
 * Use this in tests that need to make authenticated API calls without a browser
 * context (e.g. seeding data, checking RBAC via raw HTTP).
 */
export async function mintBearerToken(request: APIRequestContext, account: Account): Promise<string> {
  const res = await request.post(`${BACKEND_API}/auth/login`, {
    data: { username: account.username, password: account.password },
  });
  if (!res.ok()) throw new Error(`API login failed for ${account.username}: HTTP ${res.status()}`);
  const body = await res.json();
  return body.data.token as string;
}

export async function loginViaUI(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait until redirected away from /login
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

/**
 * Establish a fresh authenticated session in the given browser context.
 *
 * Performs an API login through the app origin so the context's cookie jar gets
 * its OWN refresh-token family. This replaces a shared `storageState` cookie,
 * which is single-use under refresh-token rotation + reuse-detection: the first
 * test to load it rotates it, and every later test replays the revoked original
 * and gets the family revoked. Seeds `userData` for instant first paint, matching
 * what storageState used to provide.
 */
export async function establishSession(context: BrowserContext, account: Account): Promise<void> {
  const res = await context.request.post('/api/auth/login', {
    data: { username: account.username, password: account.password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${account.username}: HTTP ${res.status()}`);
  }
  const body = await res.json();
  const user = body.data.user;
  await context.addInitScript((u) => {
    if (u) localStorage.setItem('userData', JSON.stringify(u));
  }, user);
}
