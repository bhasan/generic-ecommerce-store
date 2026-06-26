import { reseedDevDb } from './helpers/db';

export default async function globalSetup() {
  if (process.env.SKIP_RESEED === '1') {
    console.log('[db] SKIP_RESEED=1 — skipping reseed (DB already seeded).');
    return;
  }
  await reseedDevDb();
}
