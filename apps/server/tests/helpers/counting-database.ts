import type { Database } from '../../src/db/client.js';

/**
 * The same Database, counting the statements its transactions send through `tx.execute` (begin, commit and savepoints are not counted):
 * for a test that holds a read to a number of round trips (plan ל').
 */
export function countingDatabase(database: Database): { readonly database: Database; readonly statements: () => number; readonly reset: () => void } {
  let statements = 0;
  const countingTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop);
        if (typeof value !== 'function') return value;
        if (prop !== 'execute') {
          const bound: unknown = value.bind(target);
          return bound;
        }
        return (...args: unknown[]): unknown => {
          statements += 1;
          const answer: unknown = Reflect.apply(value, target, args);
          return answer;
        };
      },
    });
  const counting: Database = {
    ...database,
    db: new Proxy(database.db, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop);
        if (typeof value !== 'function') return value;
        if (prop !== 'transaction') {
          const bound: unknown = value.bind(target);
          return bound;
        }
        return (work: (tx: object) => unknown, ...rest: unknown[]): unknown => {
          const answer: unknown = Reflect.apply(value, target, [(tx: object) => work(countingTx(tx)), ...rest]);
          return answer;
        };
      },
    }),
  };
  return {
    database: counting,
    statements: () => statements,
    reset: () => {
      statements = 0;
    },
  };
}
