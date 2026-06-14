import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.util';

const TEST_KEY = 'a'.repeat(64); // 32 bytes as 64-char hex

describe('encrypt', () => {
  it('returns a non-empty string different from the input', () => {
    const result = encrypt('secret-value', TEST_KEY);
    expect(result).toBeTruthy();
    expect(result).not.toBe('secret-value');
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const first = encrypt('same-input', TEST_KEY);
    const second = encrypt('same-input', TEST_KEY);
    expect(first).not.toBe(second);
  });
});

describe('decrypt', () => {
  it('round-trips the original value', () => {
    const plaintext = 'my-api-key-12345';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it('throws when decrypting with the wrong key', () => {
    const ciphertext = encrypt('secret', TEST_KEY);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it('throws when the ciphertext is corrupted', () => {
    expect(() => decrypt('notvalidciphertext', TEST_KEY)).toThrow();
  });
});
