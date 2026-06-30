import { describe, it, expect } from 'vitest';
import { generateMachineToken, hashMachineToken } from './machineToken';

describe('machineToken utilities', () => {
  it('generateMachineToken returns a token and its hash', () => {
    const { token, hash } = generateMachineToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('hashMachineToken of the generated token matches the stored hash (round-trip)', () => {
    const { token, hash } = generateMachineToken();
    expect(hashMachineToken(token)).toBe(hash);
  });

  it('different tokens produce different hashes', () => {
    const a = generateMachineToken();
    const b = generateMachineToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hashMachineToken is deterministic — same input always gives same output', () => {
    const token = 'some-fixed-token-value';
    const h1 = hashMachineToken(token);
    const h2 = hashMachineToken(token);
    expect(h1).toBe(h2);
  });
});
