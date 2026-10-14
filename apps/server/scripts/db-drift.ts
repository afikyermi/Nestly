// CI entry for the Drizzle drift check (spec criterion 20). Run by the `db` job:
//
//   npm run db:drift -w @nestly/server -- <catalog.json from supabase/ci/catalog-columns.sql>
//
// Exit 0 when every column of src/db/schema.ts matches the migrated database; 1 with one ::error:: line per problem;
// 2 on a usage or input error.

import { readFileSync } from 'node:fs';
import * as schema from '../src/db/schema.js';
import { compareColumns, drizzleColumns, parseCatalog } from './drift.js';

function main(): number {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('usage: db-drift <catalog.json>\n');
    return 2;
  }
  let database;
  try {
    database = parseCatalog(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unreadable';
    process.stdout.write(`::error::drizzle drift: cannot read the catalog: ${reason}\n`);
    return 2;
  }
  const drizzle = drizzleColumns(schema);
  const problems = compareColumns(drizzle, database);
  for (const problem of problems) process.stdout.write(`::error::drizzle drift: ${problem}\n`);
  if (problems.length > 0) return 1;
  const tables = new Set(drizzle.map((c) => `${c.schema}.${c.table}`));
  process.stdout.write(`drizzle drift: none (${drizzle.length} columns in ${tables.size} tables match the database)\n`);
  return 0;
}

process.exitCode = main();
