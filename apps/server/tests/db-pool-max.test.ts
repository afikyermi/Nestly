import { describe, expect, it } from 'vitest';
import { poolMaxOf } from '../src/db/client.js';

// Plan ג' (Afik 26.10.2026, decisions-in-force §21.2, §23.1): the connections per instance come from DB_POOL_MAX when it is 1–3;
// otherwise 3 in Production (Afik 27.10.2026, §25.2), 2 on a Vercel Preview and 1 everywhere else (development, tests).
describe('[§21.2] DB_POOL_MAX', () => {
  it('is 3 in Production when unset or invalid', () => {
    for (const value of [undefined, '', '4', 'two']) expect(poolMaxOf({ DB_POOL_MAX: value, VERCEL_ENV: 'production' })).toBe(3);
  });

  it('is 1 outside Production and a Preview when unset, empty or anything but 1–3', () => {
    for (const VERCEL_ENV of [undefined, 'development']) {
      for (const value of [undefined, '', ' ', '0', '4', '10', '-1', '2.5', 'two']) expect(poolMaxOf({ DB_POOL_MAX: value, VERCEL_ENV })).toBe(1);
    }
  });

  it('is 2 on a Preview when unset or invalid', () => {
    for (const value of [undefined, '', '4', 'two']) expect(poolMaxOf({ DB_POOL_MAX: value, VERCEL_ENV: 'preview' })).toBe(2);
  });

  it('follows a valid DB_POOL_MAX in any environment (spaces allowed)', () => {
    expect(poolMaxOf({ DB_POOL_MAX: '2' })).toBe(2);
    expect(poolMaxOf({ DB_POOL_MAX: ' 3 ', VERCEL_ENV: 'production' })).toBe(3);
    expect(poolMaxOf({ DB_POOL_MAX: '1', VERCEL_ENV: 'preview' })).toBe(1);
    expect(poolMaxOf({ DB_POOL_MAX: '1', VERCEL_ENV: 'production' })).toBe(1);
  });
});
