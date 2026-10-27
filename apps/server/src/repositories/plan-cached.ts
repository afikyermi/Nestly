// The plan-cached read functions (migration 20261027400000; .claude/knowledge/data-model.md rule 10): a statement the server sent runs as a
// SECURITY INVOKER plpgsql function, planned once per database connection. Its columns are snake_case (the database never quotes an
// identifier); the call names them back to the camelCase keys the repository's row schema reads, so the rows are the statement's own.

import { sql, type SQL } from 'drizzle-orm';

const SNAKE = /^[a-z][a-z0-9_]*$/;
const camel = (name: string): string => name.replace(/_([a-z0-9])/g, (_m: string, c: string) => c.toUpperCase());

/** `a_b as "aB", c` for the function's output columns (fixed identifiers of this code, never input). */
export function camelColumns(...names: readonly string[]): SQL {
  return sql.raw(
    names
      .map((name) => {
        if (!SNAKE.test(name)) throw new Error(`not a snake_case column: ${name}`);
        const key = camel(name);
        return key === name ? name : `${name} as "${key}"`;
      })
      .join(', '),
  );
}
