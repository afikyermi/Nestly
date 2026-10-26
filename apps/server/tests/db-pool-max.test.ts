import { describe, expect, it } from 'vitest';
import { poolMaxOf } from '../src/db/client.js';

// Plan ג' (Afik 26.10.2026, decisions-in-force §21.2): the connections per instance come from DB_POOL_MAX, 1 when it is unset; only 1–3 count.
describe('[§21.2] DB_POOL_MAX', () => {
  it('is 1 when unset, empty or anything but 2 or 3', () => {
    for (const value of [undefined, '', ' ', '0', '1', '4', '10', '-1', '2.5', 'two']) expect(poolMaxOf({ DB_POOL_MAX: value })).toBe(1);
  });

  it('is 2 or 3 when set so (spaces allowed)', () => {
    expect(poolMaxOf({ DB_POOL_MAX: '2' })).toBe(2);
    expect(poolMaxOf({ DB_POOL_MAX: ' 3 ' })).toBe(3);
  });
});
