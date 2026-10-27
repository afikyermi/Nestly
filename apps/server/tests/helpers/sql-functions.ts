import { readdirSync, readFileSync } from 'node:fs';

// The statements the server runs as plan-cached invoker functions (migration 20261027400000 and later): a static test that checks a
// statement's text reads it here, from the migration that defines the function last (a later `create or replace` wins).
const migrations = new URL('../../../../supabase/migrations/', import.meta.url);
const texts = readdirSync(migrations)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(new URL(name, migrations), 'utf8'));

/**
 * `text` with every call `nestly.read_…(` followed by that function's statement, so a check on the text of the statements a file sends
 * also reads the statements those calls run. A name no migration defines is left as it is.
 */
export function expandFunctionCalls(text: string): string {
  return text.replace(/\bnestly\.(read_\w+)\(/g, (call: string, name: string) => {
    try {
      return `${call} ${functionStatement(name)} `;
    } catch {
      return call;
    }
  });
}

/**
 * expandFunctionCalls, and `select * from nestly.read_…(` read as the call alone: the function's output is its declared column list (the
 * statement's own), not a wildcard over a table, so a "no select *" check reads the statement instead.
 */
export function expandedStatement(text: string): string {
  return expandFunctionCalls(text.replace(/select \* from (nestly\.read_\w+\()/g, '$1'));
}

/** The statement of `nestly.<name>`: the text after `return query` up to its closing `;` (an SQL function: its whole body). */
export function functionStatement(name: string): string {
  let found: string | undefined;
  const head = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+nestly\\.${name}\\s*\\(`, 'i');
  for (const text of texts) {
    const at = text.search(head);
    if (at < 0) continue;
    const open = /as\s+(\$\w*\$)/i.exec(text.slice(at));
    if (open?.[1] === undefined) continue;
    const start = at + open.index + open[0].length;
    const end = text.indexOf(open[1], start);
    const body = text.slice(start, end);
    const query = /return\s+query\b([\s\S]*?);\s*end\s*$/i.exec(body.trim());
    found = query?.[1] ?? body;
  }
  if (found === undefined) throw new Error(`no migration defines nestly.${name}`);
  return found;
}
