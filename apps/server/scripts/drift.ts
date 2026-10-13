// Drift between the Drizzle schema and the migrated database (I1 F1.1 part b, spec criterion 20).
//
// Drizzle describes the product tables for typing only; the SQL migrations are the DDL. A column Drizzle names must
// exist in the database with the same type and nullability, or a typed query compiles against a column that is not
// there. This module is pure: the CI `db` job reads the catalog with supabase/ci/catalog-columns.sql and
// scripts/db-drift.ts feeds both sides in. Columns the database has and Drizzle does not name are not drift here.

import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';

export interface ColumnShape {
  schema: string;
  table: string;
  column: string;
  /** The SQL type as written by its source; compared after normalizeType(). */
  type: string;
  notNull: boolean;
}

/** Every column of every PgTable exported by a schema module. */
export function drizzleColumns(schemaModule: Readonly<Record<string, unknown>>): ColumnShape[] {
  const out: ColumnShape[] = [];
  for (const value of Object.values(schemaModule)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    for (const column of config.columns) {
      out.push({
        schema: config.schema ?? 'public',
        table: config.name,
        column: column.name,
        type: column.getSQLType(),
        notNull: column.notNull,
      });
    }
  }
  return out;
}

/**
 * One spelling for a type, so Drizzle's names compare with PostgreSQL's format_type(): lower case, single spaces,
 * no spaces inside parentheses, and the aliases Drizzle emits mapped to PostgreSQL's canonical names.
 */
export function normalizeType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\)/g, ')')
    .replace(/^varchar(?=\(|\[|$)/, 'character varying')
    .replace(/^char(?=\(|\[|$)/, 'character')
    .replace(/^(timestamp|time)(\(\d+\))?(?=\[|$)/, '$1$2 without time zone');
}

/** Problems, one line each; empty when every Drizzle column matches the database. */
export function compareColumns(drizzle: readonly ColumnShape[], database: readonly ColumnShape[]): string[] {
  if (drizzle.length === 0) return ['the Drizzle schema declares no column: nothing would be checked'];
  const key = (c: ColumnShape): string => `${c.schema}.${c.table}.${c.column}`;
  const byKey = new Map(database.map((c) => [key(c), c]));
  const problems: string[] = [];
  for (const expected of drizzle) {
    const name = key(expected);
    const actual = byKey.get(name);
    if (!actual) {
      problems.push(`${name} is in the Drizzle schema but not in the database`);
      continue;
    }
    if (normalizeType(expected.type) !== normalizeType(actual.type)) {
      problems.push(`${name} is "${expected.type}" in the Drizzle schema but "${actual.type}" in the database`);
    }
    if (expected.notNull !== actual.notNull) {
      const say = (notNull: boolean): string => (notNull ? 'not null' : 'nullable');
      problems.push(`${name} is ${say(expected.notNull)} in the Drizzle schema but ${say(actual.notNull)} in the database`);
    }
  }
  return problems;
}

function isColumnShape(value: unknown): value is ColumnShape {
  if (typeof value !== 'object' || value === null) return false;
  const fields: Record<string, unknown> = { ...value };
  return (
    typeof fields.schema === 'string' &&
    typeof fields.table === 'string' &&
    typeof fields.column === 'string' &&
    typeof fields.type === 'string' &&
    typeof fields.notNull === 'boolean'
  );
}

/** The JSON array catalog-columns.sql prints. Throws on anything else: a malformed catalog must not pass. */
export function parseCatalog(text: string): ColumnShape[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('the catalog is not a JSON array');
  const columns: ColumnShape[] = [];
  for (const item of parsed) {
    if (!isColumnShape(item)) throw new Error('the catalog has an entry that is not {schema, table, column, type, notNull}');
    columns.push(item);
  }
  return columns;
}
