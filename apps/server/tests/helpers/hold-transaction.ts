import type { Database } from '../../src/db/client.js';

/** A Database whose first transaction after arm() does its work and then waits for release() before it commits. */
export function holdingAfterWork(real: Database): { database: Database; arm: () => void; reached: Promise<void>; release: () => void } {
  let armed = false;
  let signal: () => void = () => undefined;
  let open: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => { signal = resolve; });
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      if (prop !== 'transaction') {
        const bound: unknown = value.bind(target);
        return bound;
      }
      return (work: unknown, ...rest: unknown[]) => {
        if (!armed || typeof work !== 'function') {
          const passed: unknown = Reflect.apply(value, target, [work, ...rest]);
          return passed;
        }
        armed = false;
        const held = async (tx: unknown): Promise<unknown> => {
          const out: unknown = await Reflect.apply(work, undefined, [tx]);
          signal();
          await gate;
          return out;
        };
        const outcome: unknown = Reflect.apply(value, target, [held, ...rest]);
        return outcome;
      };
    },
  });
  return { database: { db, client: real.client, close: () => real.close() }, arm: () => { armed = true; }, reached, release: () => open() };
}
