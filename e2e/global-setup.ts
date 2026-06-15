import { reseedDevDb } from './helpers/db';

export default async function globalSetup() {
  await reseedDevDb();
}
