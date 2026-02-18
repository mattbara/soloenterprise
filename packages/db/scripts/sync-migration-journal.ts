/**
 * Sync Migration Journal
 *
 * Detects migration files that have been applied to the database (via db:push
 * or direct SQL) but are missing from Drizzle's __drizzle_migrations journal.
 *
 * This prevents the dreaded "column already exists" error when running db:migrate
 * after using db:push.
 *
 * Usage:
 *   pnpm db:sync-journal          # Dry run — shows what's out of sync
 *   pnpm db:sync-journal --apply  # Actually inserts missing records
 */

import { config } from 'dotenv';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
config({ path: resolve(__dirname, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const applyMode = process.argv.includes('--apply');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface AppliedMigration {
  id: number;
  hash: string;
  created_at: string;
}

async function main() {
  const sql = neon(DATABASE_URL!);

  // 1. Read local journal
  const journalPath = resolve(__dirname, '../drizzle/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  const entries: JournalEntry[] = journal.entries;

  console.log(`Local journal: ${entries.length} migration(s)\n`);

  // 2. Read applied migrations from DB
  let applied: AppliedMigration[];
  try {
    applied = await sql`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at` as AppliedMigration[];
  } catch {
    console.error('Could not read drizzle.__drizzle_migrations — has db:migrate ever been run?');
    process.exit(1);
  }

  const appliedHashes = new Set(applied.map(a => a.hash));
  console.log(`Database journal: ${applied.length} migration(s) recorded\n`);

  // 3. Compare — find migrations in local journal but not in DB
  const missing: { entry: JournalEntry; hash: string }[] = [];

  for (const entry of entries) {
    const filePath = join(resolve(__dirname, '../drizzle'), `${entry.tag}.sql`);
    const content = readFileSync(filePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    if (!appliedHashes.has(hash)) {
      missing.push({ entry, hash });
    }
  }

  if (missing.length === 0) {
    console.log('All migrations are in sync. Nothing to do.');
    return;
  }

  console.log(`Found ${missing.length} migration(s) missing from DB journal:\n`);
  for (const { entry, hash } of missing) {
    console.log(`  ${entry.tag}`);
    console.log(`    hash: ${hash}`);
    console.log(`    when: ${entry.when}\n`);
  }

  if (!applyMode) {
    console.log('Dry run — no changes made. Run with --apply to insert missing records.');
    return;
  }

  // 4. Insert missing records
  console.log('Inserting missing migration records...\n');

  for (const { entry, hash } of missing) {
    await sql`
      INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${String(entry.when)})
    `;
    console.log(`  Inserted: ${entry.tag}`);
  }

  console.log(`\nDone. ${missing.length} migration(s) synced.`);
  console.log('Run pnpm db:migrate to verify — it should report "migrations applied successfully" with no errors.');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
