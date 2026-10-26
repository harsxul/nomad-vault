// Saves a read-only snapshot of the live testnet API for the hosted preview, which has no backend.
// Usage (backend running): node scripts/snapshot.mjs [http://127.0.0.1:8787]
import { writeFileSync } from 'node:fs';

const base = (process.argv[2] || 'http://127.0.0.1:8787') + '/api';
const get = async (p) => (await fetch(base + p)).json();
const snap = {};
const put = async (p) => (snap[p] = await get(p));

await put('/network-config');
await put('/dashboard');
const { contractors } = await put('/contractors');
const { runs } = await put('/payroll-runs');
for (const c of contractors) {
  await put(`/contractors/${c.id}`);
  if (c.vaultAddress) await put(`/vaults/${c.vaultAddress}`);
}
for (const r of runs) await put(`/payroll-runs/${r.id}`);
snap._takenAt = new Date().toISOString();
writeFileSync(new URL('../src/lib/snapshot.json', import.meta.url), JSON.stringify(snap));
console.log(`snapshot: ${Object.keys(snap).length - 1} responses`);
