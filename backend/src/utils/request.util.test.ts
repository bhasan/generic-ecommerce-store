import { describe, it, expect } from 'vitest';
import { parsePaginationQuery } from './request.util';

describe('parsePaginationQuery', () => {
  const opts = { defaultLimit: 50, maxLimit: 200 };
  it('uses defaultLimit when limit absent', () => {
    expect(parsePaginationQuery({}, opts)).toEqual({ limit: 50, offset: 0 });
  });
  it('caps limit at maxLimit', () => {
    expect(parsePaginationQuery({ limit: '9999' }, opts).limit).toBe(200);
  });
  it('honors a valid limit and offset', () => {
    expect(parsePaginationQuery({ limit: '20', offset: '40' }, opts)).toEqual({ limit: 20, offset: 40 });
  });
  it('clamps negative/invalid offset to 0', () => {
    expect(parsePaginationQuery({ offset: '-5' }, opts).offset).toBe(0);
  });
  it('falls back to defaultLimit when limit is non-numeric', () => {
    expect(parsePaginationQuery({ limit: 'abc' }, opts).limit).toBe(50);
  });
  it('falls back to defaultLimit when limit is zero', () => {
    expect(parsePaginationQuery({ limit: '0' }, opts).limit).toBe(50);
  });
});
