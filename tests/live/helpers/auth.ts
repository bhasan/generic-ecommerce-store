import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { liveEnv } from './env';

export async function loginViaApi(request: APIRequestContext, username: string, password: string) {
  const response = await request.post(`${liveEnv.apiBaseUrl}/auth/login`, {
    data: { username, password },
  });
  expect(response.status(), 'login status').toBe(200);
  const json = await response.json();
  expect(json.token, 'login token presence').toBeTruthy();
  return {
    token: json.token as string,
    user: json.user,
  };
}

export async function seedBrowserSession(page: Page, token: string, user: unknown) {
  await page.addInitScript(({ authToken, userData }) => {
    window.localStorage.setItem('authToken', authToken);
    window.localStorage.setItem('userData', JSON.stringify(userData));
  }, { authToken: token, userData: user });
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}
