import { test as setup } from '@playwright/test';
import { ALL_ACCOUNTS } from './helpers/accounts';
import { loginViaUI } from './helpers/auth';

for (const account of ALL_ACCOUNTS) {
  setup(`authenticate as ${account.role}`, async ({ page }) => {
    await loginViaUI(page, account);
    await page.context().storageState({ path: account.storageStatePath });
  });
}
