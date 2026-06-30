import { randomBytes, createHash } from 'crypto';

/**
 * Generate a cryptographically random machine token and its SHA-256 hash.
 * The plaintext token is returned once (to be transmitted to the caller) and
 * NEVER stored. Only the hash is persisted in the database.
 */
export function generateMachineToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashMachineToken(token) };
}

/**
 * Compute the SHA-256 hex digest of a machine token.
 * Used both at generation time and in auth middleware to compare a supplied
 * token against the stored hash (hash-lookup replaces constant-time compare).
 */
export function hashMachineToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
