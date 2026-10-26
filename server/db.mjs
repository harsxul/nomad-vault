// Product metadata store (Node's built-in SQLite). Asset ownership lives on Stellar, never here.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

const localDbPath = new URL('./data/nomad.db', import.meta.url).pathname;
const dbPath = process.env.NV_DB_PATH
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'nomad.db') : localDbPath);

mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS contractors (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL, email TEXT NOT NULL, country_label TEXT,
    amount_minor TEXT NOT NULL, frequency TEXT NOT NULL DEFAULT 'monthly', status TEXT NOT NULL,
    vault_address TEXT, next_payment_date TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS invitations (
    token TEXT PRIMARY KEY, contractor_id TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT);
  CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY, period TEXT NOT NULL, status TEXT NOT NULL, total_minor TEXT NOT NULL,
    warnings TEXT NOT NULL DEFAULT '[]', approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS payroll_items (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, contractor_id TEXT NOT NULL, amount_minor TEXT NOT NULL,
    status TEXT NOT NULL, signer TEXT, tx_hash TEXT, failure_code TEXT, updated_at TEXT NOT NULL);
`);

export const now = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${randomBytes(6).toString('hex')}`;
export const newToken = () => randomBytes(24).toString('base64url');

// First start: load the demo company's contractors.
if (db.prepare('SELECT COUNT(*) AS n FROM contractors').get().n === 0) {
  const seed = JSON.parse(readFileSync(new URL('./demo-data.json', import.meta.url))).contractors;
  const insert = db.prepare(`INSERT INTO contractors (id, display_name, email, country_label, amount_minor, frequency, status, vault_address, next_payment_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const c of seed) insert.run(c.id, c.displayName, c.email, c.countryLabel, c.amountMinor, c.frequency, c.status, c.address || null, c.nextPaymentDate, now());
}
