/**
 * SQLite trust store (spec §23). Only CLI-side commands import this module —
 * never the hook path. Schema is intentionally minimal and extensible.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Category, Scope, TrustStatus } from '../core/trust/entities.js';

const require = createRequire(import.meta.url);

// node:sqlite is still flagged experimental on some Node versions, and its
// warning is printed synchronously where listener-based suppression cannot
// reach. This module is CLI-only (the hook path never imports it), and these
// are short-lived processes, so removing the default warning printer here is
// an acceptable trade for clean CLI output.
process.removeAllListeners('warning');

const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS tools (
     id           TEXT PRIMARY KEY,
     name         TEXT NOT NULL,
     category     TEXT NOT NULL,
     ecosystem    TEXT,
     trust_status TEXT NOT NULL,
     scope        TEXT NOT NULL,
     notes        TEXT,
     created_at   INTEGER NOT NULL,
     updated_at   INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

export interface DbToolRow {
  id: string;
  name: string;
  category: Category;
  ecosystem: string | null;
  trust_status: TrustStatus;
  scope: Scope;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
};

/** Opens (creating if needed) and migrates the database. */
export function openDb(file: string): SqliteDb {
  // node:sqlite is built-in and unflagged from Node >= 22.13 (>= 23.4 on the
  // 23.x line); required for the CLI side only.
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  for (const sql of MIGRATIONS) db.exec(sql);
  return db as unknown as SqliteDb;
}

export function closeDb(db: SqliteDb): void {
  db.close();
}

export function listTools(db: SqliteDb): DbToolRow[] {
  const rows = db.prepare('SELECT * FROM tools ORDER BY name').all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: row.category as Category,
    ecosystem: row.ecosystem == null ? null : String(row.ecosystem),
    trust_status: row.trust_status as TrustStatus,
    scope: row.scope as Scope,
    notes: row.notes == null ? null : String(row.notes),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  }));
}

export function upsertTool(
  db: SqliteDb,
  tool: {
    id: string;
    name: string;
    category: Category;
    ecosystem?: string;
    trustStatus: TrustStatus;
    scope: Scope;
    notes?: string;
  },
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO tools (id, name, category, ecosystem, trust_status, scope, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       ecosystem = excluded.ecosystem,
       trust_status = excluded.trust_status,
       scope = excluded.scope,
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
  ).run(
    tool.id,
    tool.name,
    tool.category,
    tool.ecosystem ?? null,
    tool.trustStatus,
    tool.scope,
    tool.notes ?? null,
    now,
    now,
  );
}

export function deleteTool(db: SqliteDb, id: string): boolean {
  const result = db.prepare('DELETE FROM tools WHERE id = ?').run(id);
  return Number((result as { changes?: number }).changes ?? 0) > 0;
}
