import crypto from 'crypto';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { RoleName } from '../constants/roles';

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
    }
    console.warn('[WARN] JWT_SECRET not set — using insecure default (development only)');
    return 'dev-only-insecure-secret';
  }
  return secret;
})();
// Short-lived access token: 15 minutes. Sessions are kept alive by the
// long-lived refresh token (see generateRefreshTokenValue), so a stolen
// access token is only useful for a small window.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export interface JwtPayload {
  userId: number;
  username: string;
  roles: RoleName[];
}

/**
 * Generate a JWT token for a user
 */
export const generateToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, JWT_SECRET, options);
};

/**
 * Verify and decode a JWT token
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Generate an opaque refresh token value (NOT a JWT).
 *
 * 48 bytes of CSPRNG entropy → 96 hex chars. Because the value is
 * unguessable, the DB stores only its SHA-256 hash; the raw value is
 * returned to the client once and never persisted server-side.
 */
export const generateRefreshTokenValue = (): string => {
  return crypto.randomBytes(48).toString('hex');
};

/**
 * Hash a raw refresh token for storage / lookup.
 *
 * SHA-256 (not bcrypt) is appropriate here: the input already has full
 * cryptographic entropy, so there is nothing to brute-force, and we need
 * deterministic hashing for the unique-index lookup.
 */
export const hashRefreshToken = (raw: string): string => {
  return crypto.createHash('sha256').update(raw).digest('hex');
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};
