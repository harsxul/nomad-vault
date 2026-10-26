// Nomad Vault backend (hackathon): product metadata API + payroll runner. API contract: docs/API.md.
// It holds one policy-limited payroll operator key. The treasury admin key is used only in demo mode
// (NV_DEMO_ADMIN=0 turns that off). It never holds contractor keys.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { StrKey } from '@stellar/stellar-sdk';
import { cfg, keypair, txLink, payFromTreasury, balanceOf, accountExists, treasuryTransfers, policyState } from './stellar.mjs';
import { db, now, newId, newToken } from './db.mjs';
import { parseAmount, formatAmount, sumMinor, draftItems, runStatusFromItems, canExecute, sendable, stepsFor, FAILURE_MESSAGES } from './payroll.mjs';

const PORT = Number(process.env.PORT || 8787);
// Localhost by default; hosted deployments (Railway) must listen on all interfaces.
const HOST = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
const allowedOrigins = String(process.env.NV_CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const demo = JSON.parse(readFileSync(new URL('./demo-data.json', import.meta.url)));
const company = demo.company;
const T = cfg.treasury;
const operator = keypair('nv-operator');
const feePayer = keypair(T.feePayerAlias);
const admin = process.env.NV_DEMO_ADMIN === '0' ? null : keypair('nv-admin');

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const fail = (status, message, code = 'bad_request') => { throw new HttpError(status, message, code); };

// ---------- mapping ----------
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : null);
const contractorJson = (r) => ({
  id: r.id, displayName: r.display_name, email: r.email, countryLabel: r.country_label,
  amount: formatAmount(r.amount_minor), amountMinor: r.amount_minor, asset: cfg.asset.code, frequency: r.frequency,
  status: r.status, vaultAddress: r.vault_address, vaultShort: short(r.vault_address),
  nextPaymentDate: r.next_payment_date, createdAt: r.created_at,
});
const getContractor = (id) => db.prepare('SELECT * FROM contractors WHERE id = ?').get(id) || fail(404, 'Contractor not found', 'not_found');
const allContractors = () => db.prepare('SELECT * FROM contractors ORDER BY created_at, display_name').all();

function itemJson(i, activeId) {
  const status = i.status;
  return {
    id: i.id, contractorId: i.contractor_id, displayName: i.display_name, countryLabel: i.country_label,
    amount: formatAmount(i.amount_minor), status, signer: i.signer,
    tx: i.tx_hash, link: i.tx_hash ? txLink(i.tx_hash) : null,
    failureCode: i.failure_code, message: i.failure_code ? FAILURE_MESSAGES[i.failure_code] || FAILURE_MESSAGES.simulation_failed : null,
    steps: stepsFor({ status, active: i.id === activeId }),
  };
}
const runItems = (runId) => db.prepare(`SELECT pi.*, c.display_name, c.country_label, c.vault_address FROM payroll_items pi
  JOIN contractors c ON c.id = pi.contractor_id WHERE pi.run_id = ? ORDER BY c.display_name`).all(runId);
const getRun = (id) => db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(id) || fail(404, 'Payroll run not found', 'not_found');

async function runJson(run, { withChain = true } = {}) {
  const items = runItems(run.id);
  const unpaid = sumMinor(items.filter((i) => i.status !== 'confirmed').map((i) => ({ amountMinor: i.amount_minor })));
  const base = {
    id: run.id, period: run.period, asset: cfg.asset.code, status: run.status,
    total: formatAmount(run.total_minor), totalMinor: run.total_minor,
    warnings: JSON.parse(run.warnings), approvedBy: run.approved_by, approvedAt: run.approved_at, createdAt: run.created_at,
    items: items.map((i) => itemJson(i, executing.get(run.id))),
  };
  if (!withChain) return base;
  const [balance, policy] = await Promise.all([balanceOf(T.account), policyState()]);
  const remaining = policy.limitMinor - policy.spentMinor;
  return {
    ...base,
    treasuryBefore: formatAmount(balance), treasuryAfter: formatAmount(balance - unpaid),
    policy: { dailyLimit: formatAmount(policy.limitMinor), remaining: formatAmount(remaining > 0n ? remaining : 0n), withinLimit: unpaid <= remaining },
  };
}

// ---------- payroll execution ----------
const executing = new Map(); // runId -> item id currently being paid
const setItem = (id, fields) => {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE payroll_items SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), now(), id);
};
const refreshRunStatus = (runId) => {
  const status = runStatusFromItems(db.prepare('SELECT status FROM payroll_items WHERE run_id = ?').all(runId));
  db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run(status, runId);
  return status;
};

// Pays one item. Operator first (policy-limited); a policy refusal parks the item for an admin.
async function payItem(item, signerKind) {
  setItem(item.id, { status: 'submitted', failure_code: null });
  const signer = signerKind === 'admin' ? admin : operator;
  const ruleId = signerKind === 'admin' ? 0 : T.payrollRuleId;
  let r;
  try { r = await payFromTreasury({ to: item.vault_address, amountMinor: item.amount_minor, signer, ruleId, feePayer }); }
  catch (e) { r = { ok: false, code: 'simulation_failed', error: String(e.message || e) }; }
  if (r.ok) setItem(item.id, { status: 'confirmed', signer: signerKind, tx_hash: r.hash });
  else if (r.code === 'policy_limit' && signerKind === 'operator') setItem(item.id, { status: 'needs_approval', failure_code: 'policy_limit' });
  else setItem(item.id, { status: 'failed', failure_code: FAILURE_MESSAGES[r.code] ? r.code : 'simulation_failed', tx_hash: r.hash || null });
  if (!r.ok) console.log(`payment ${item.id} not completed: ${r.code}`);
}

async function executeRun(runId) {
  try {
    for (const item of sendable(runItems(runId))) {
      executing.set(runId, item.id);
      await payItem(item, 'operator');
    }
  } finally {
    executing.delete(runId);
    refreshRunStatus(runId);
  }
}

// ---------- routes ----------
const json = async (req) => {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 1e5) fail(413, 'Request too large'); }
  if (!body) return {};
  try { return JSON.parse(body); } catch { fail(400, 'Body must be JSON'); }
};

const routes = [
  ['GET', /^\/api\/network-config$/, async () => ({
    network: cfg.network, asset: cfg.asset.code, assetIssuer: cfg.asset.issuer, horizonUrl: cfg.horizonUrl, networkPassphrase: cfg.networkPassphrase,
    explorer: cfg.explorer, treasury: T.account, privatePool: cfg.privatePayments.pool,
  })],

  ['GET', /^\/api\/dashboard$/, async () => {
    const [balance, policy, transfers] = await Promise.all([balanceOf(T.account), policyState(), treasuryTransfers()]);
    const contractors = allContractors();
    const names = Object.fromEntries(contractors.filter((c) => c.vault_address).map((c) => [c.vault_address, c.display_name]));
    const payable = contractors.filter((c) => c.status === 'active' && c.vault_address);
    const next = sumMinor(payable.map((c) => ({ amountMinor: c.amount_minor })));
    const count = (s) => contractors.filter((c) => c.status === s).length;
    const runs = db.prepare('SELECT * FROM payroll_runs ORDER BY created_at DESC LIMIT 5').all();
    const remaining = policy.limitMinor - policy.spentMinor;
    return {
      company: { id: company.id, name: company.name }, network: cfg.network, asset: cfg.asset.code, latestLedger: policy.latest,
      treasury: { address: T.account, link: `${cfg.explorer}/contract/${T.account}`, balance: formatAmount(balance) },
      nextPayroll: { total: formatAmount(next), contractorCount: payable.length, funded: balance >= next, date: company.payrollDate },
      payrollPolicy: {
        rule: policy.rule, dailyLimit: formatAmount(policy.limitMinor), spentInWindow: formatAmount(policy.spentMinor),
        remaining: formatAmount(remaining > 0n ? remaining : 0n), windowLedgers: policy.windowLedgers,
        ledgersLeft: policy.validUntil ? policy.validUntil - policy.latest : null,
      },
      counts: { active: count('active'), invited: count('invited'), paused: count('paused') },
      recentRuns: runs.map((r) => ({ id: r.id, period: r.period, status: r.status, total: formatAmount(r.total_minor), createdAt: r.created_at })),
      recentPayments: transfers.slice(0, 10).map((t) => ({ at: t.at, toName: names[t.to] || short(t.to), amount: formatAmount(t.amountMinor), tx: t.tx, link: t.link })),
      privatePayments: {
        status: 'Zero-knowledge payroll via Stellar Private Payments, working end to end on futurenet. Here, payroll settles through the treasury.',
        registrations: demo.privateRegistrations.map((r) => ({ ...r, link: txLink(r.tx) })),
      },
    };
  }],

  ['GET', /^\/api\/contractors$/, async () => ({ contractors: allContractors().map(contractorJson) })],

  ['POST', /^\/api\/contractors$/, async (req) => {
    const b = await json(req);
    const displayName = String(b.displayName || '').trim();
    const email = String(b.email || '').trim();
    if (displayName.length < 2 || displayName.length > 80) fail(400, 'Enter the contractor’s name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
    let amountMinor;
    try { amountMinor = parseAmount(b.amount).toString(); } catch (e) { fail(400, e.message); }
    if ((b.frequency || 'monthly') !== 'monthly') fail(400, 'Only monthly compensation is supported in the demo');
    const id = newId('ctr');
    db.prepare(`INSERT INTO contractors (id, display_name, email, country_label, amount_minor, frequency, status, vault_address, next_payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, 'monthly', 'invited', NULL, ?, ?)`).run(id, displayName, email, String(b.countryLabel || '').trim().slice(0, 60), amountMinor, company.payrollDate, now());
    return { status: 201, body: { contractor: contractorJson(getContractor(id)), invitation: createInvitation(id) } };
  }],

  ['GET', /^\/api\/contractors\/([\w-]+)$/, async (req, [id]) => {
    const c = getContractor(id);
    const payments = c.vault_address ? (await treasuryTransfers({ to: c.vault_address })).map(paymentJson) : [];
    return { contractor: contractorJson(c), payments };
  }],

  ['POST', /^\/api\/contractors\/([\w-]+)\/(pause|resume)$/, async (req, [id, action]) => {
    const c = getContractor(id);
    if (action === 'pause' && c.status !== 'active') fail(409, 'Only active contractors can be paused', 'invalid_state');
    if (action === 'resume' && c.status !== 'paused') fail(409, 'Only paused contractors can be resumed', 'invalid_state');
    db.prepare('UPDATE contractors SET status = ? WHERE id = ?').run(action === 'pause' ? 'paused' : 'active', id);
    return { contractor: contractorJson(getContractor(id)) };
  }],

  ['POST', /^\/api\/contractors\/([\w-]+)\/invitations$/, async (req, [id]) => {
    if (getContractor(id).status !== 'invited') fail(409, 'This contractor has already activated a vault', 'invalid_state');
    return { status: 201, body: { invitation: createInvitation(id) } };
  }],

  ['GET', /^\/api\/invitations\/([\w-]+)$/, async (req, [token]) => {
    const inv = validInvitation(token);
    return { company: { name: company.name }, contractor: contractorJson(getContractor(inv.contractor_id)), expiresAt: inv.expires_at, accepted: false };
  }],

  ['POST', /^\/api\/invitations\/([\w-]+)\/accept$/, async (req, [token]) => {
    const inv = validInvitation(token);
    const { vaultAddress } = await json(req);
    if (!StrKey.isValidEd25519PublicKey(String(vaultAddress || ''))) fail(400, 'That vault address is not valid');
    if (!(await accountExists(vaultAddress))) fail(409, 'The vault is not active on Stellar yet. Fund it first.', 'vault_not_funded');
    // Activate once: a second (or sibling) invitation must never replace an active vault address.
    const activated = db.prepare("UPDATE contractors SET status = 'active', vault_address = ? WHERE id = ? AND status = 'invited'").run(vaultAddress, inv.contractor_id);
    if (!activated.changes) fail(410, 'This vault is already set up', 'used');
    db.prepare('UPDATE invitations SET accepted_at = ? WHERE contractor_id = ? AND accepted_at IS NULL').run(now(), inv.contractor_id);
    return { contractor: contractorJson(getContractor(inv.contractor_id)) };
  }],

  ['GET', /^\/api\/payroll-runs$/, async () => ({
    runs: await Promise.all(db.prepare('SELECT * FROM payroll_runs ORDER BY created_at DESC').all().map((r) => runJson(r, { withChain: false }))),
  })],

  ['POST', /^\/api\/payroll-runs$/, async () => {
    if (executing.size) fail(409, 'A payroll run is executing. Wait for it to finish.', 'busy');
    const period = new Date().toISOString().slice(0, 7);
    // An unfinished run for this month is reopened instead of starting a second one.
    const open = db.prepare("SELECT * FROM payroll_runs WHERE period = ? AND status NOT IN ('confirmed') ORDER BY created_at DESC LIMIT 1").get(period);
    if (open) return { run: await runJson(open), reused: true };
    // Anyone already paid, or waiting for an admin, this month is never drafted again.
    const covered = new Set(db.prepare(`SELECT pi.contractor_id FROM payroll_items pi JOIN payroll_runs r ON r.id = pi.run_id
      WHERE r.period = ? AND pi.status IN ('confirmed', 'submitted', 'pending', 'needs_approval')`).all(period).map((r) => r.contractor_id));
    const candidates = allContractors().filter((c) => !covered.has(c.id));
    const { items, warnings } = draftItems(candidates.map((c) => ({ id: c.id, displayName: c.display_name, status: c.status, vaultAddress: c.vault_address, amountMinor: c.amount_minor })));
    if (!items.length) fail(409, covered.size ? 'Everyone active has already been paid this month.' : 'No active contractors with a vault to pay yet.', 'nothing_to_pay');
    const id = newId('run');
    db.prepare("INSERT INTO payroll_runs (id, period, status, total_minor, warnings, created_at) VALUES (?, ?, 'draft', ?, ?, ?)")
      .run(id, period, sumMinor(items).toString(), JSON.stringify(warnings), now());
    const ins = db.prepare("INSERT INTO payroll_items (id, run_id, contractor_id, amount_minor, status, updated_at) VALUES (?, ?, ?, ?, 'pending', ?)");
    for (const it of items) ins.run(newId('itm'), id, it.contractorId, it.amountMinor, now());
    return { status: 201, body: { run: await runJson(getRun(id)) } };
  }],

  ['GET', /^\/api\/payroll-runs\/([\w-]+)$/, async (req, [id]) => ({ run: await runJson(getRun(id)) })],

  ['POST', /^\/api\/payroll-runs\/([\w-]+)\/approve$/, async (req, [id]) => {
    const { approvedBy } = await json(req);
    getRun(id);
    const r = db.prepare("UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status IN ('draft', 'awaiting_approval')")
      .run(String(approvedBy || 'Company admin').slice(0, 60), now(), id);
    if (!r.changes) fail(409, 'This payroll run can no longer be approved', 'invalid_state');
    return { run: await runJson(getRun(id)) };
  }],

  ['POST', /^\/api\/payroll-runs\/([\w-]+)\/execute$/, async (req, [id]) => {
    const run = getRun(id);
    if (executing.has(id)) return { run: await runJson(run) };
    if (executing.size) fail(409, 'Another payroll run is executing', 'busy');
    if (!canExecute(run)) fail(409, run.status === 'draft' ? 'Approve the payroll before executing it' : 'This payroll run has nothing left to send', 'invalid_state');
    if (!sendable(runItems(id)).length) fail(409, 'Nothing left to send. Items waiting for an administrator need admin approval.', 'invalid_state');
    db.prepare("UPDATE payroll_runs SET status = 'executing' WHERE id = ?").run(id);
    executing.set(id, null);
    executeRun(id); // background; clients poll GET
    return { status: 202, body: { run: await runJson(getRun(id)) } };
  }],

  ['POST', /^\/api\/payroll-runs\/([\w-]+)\/items\/([\w-]+)\/admin-approve$/, async (req, [runId, itemId]) => {
    if (!admin) fail(403, 'Administrator signing is not enabled on this server', 'admin_disabled');
    if (executing.size) fail(409, 'A payroll run is executing. Try again in a moment.', 'busy');
    const item = runItems(runId).find((i) => i.id === itemId) || fail(404, 'Payment not found', 'not_found');
    if (item.status !== 'needs_approval') fail(409, 'This payment does not need administrator approval', 'invalid_state');
    executing.set(runId, itemId);
    try { await payItem(item, 'admin'); } finally { executing.delete(runId); refreshRunStatus(runId); }
    return { run: await runJson(getRun(runId)) };
  }],

  ['GET', /^\/api\/vaults\/(G[A-Z2-7]{55})$/, async (req, [addr]) => {
    const exists = await accountExists(addr);
    const balance = exists ? await balanceOf(addr) : 0n;
    const transfers = await treasuryTransfers({ to: addr });
    const payments = transfers.map((p) => ({ ...paymentJson(p), fromCompany: company.name }));
    const received = transfers.reduce((a, t) => a + BigInt(t.amountMinor), 0n);
    return { address: addr, exists, balance: formatAmount(balance), receivedTotal: formatAmount(received), asset: cfg.asset.code, payments };
  }],

  ['POST', /^\/api\/demo\/fund-vault$/, async (req) => {
    const { address } = await json(req);
    if (!StrKey.isValidEd25519PublicKey(String(address || ''))) fail(400, 'That vault address is not valid');
    if (await accountExists(address)) return { funded: true, alreadyActive: true };
    const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
    if (!r.ok) fail(502, 'Testnet funding is unavailable right now. Try again in a minute.', 'friendbot_failed');
    return { funded: true };
  }],
];

function createInvitation(contractorId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO invitations (token, contractor_id, expires_at) VALUES (?, ?, ?)').run(token, contractorId, expiresAt);
  return { token, url: `/invite/${token}`, expiresAt };
}
function validInvitation(token) {
  const inv = db.prepare('SELECT * FROM invitations WHERE token = ?').get(token) || fail(404, 'This invitation does not exist', 'not_found');
  if (inv.accepted_at) fail(410, 'This invitation has already been used', 'used');
  if (inv.expires_at < now()) fail(410, 'This invitation has expired', 'expired');
  return inv;
}
function paymentJson(p) {
  const item = db.prepare('SELECT run_id FROM payroll_items WHERE tx_hash = ?').get(p.tx);
  return { at: p.at, amount: formatAmount(p.amountMinor), tx: p.tx, link: p.link, runId: item?.run_id || null };
}

// ---------- server ----------
const corsOrigin = (req) => {
  if (!allowedOrigins.length) return '*';
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
};

const send = (req, res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': corsOrigin(req), vary: 'Origin' });
  res.end(type === 'application/json' ? JSON.stringify(body, (k, v) => (typeof v === 'bigint' ? v.toString() : v)) : body);
};

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': corsOrigin(req), 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type', vary: 'Origin' });
    return res.end();
  }
  try {
    if (req.method === 'GET' && path === '/health') return send(req, res, 200, { ok: true });
    for (const [method, re, handler] of routes) {
      const m = path.match(re);
      if (m && req.method === method) {
        const out = await handler(req, m.slice(1));
        return out && out.status ? send(req, res, out.status, out.body) : send(req, res, 200, out);
      }
    }
    if (req.method === 'GET' && (path === '/status' || path === '/')) return send(req, res, 200, readFileSync(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    if (req.method === 'GET' && path === '/tokens.css') return send(req, res, 200, readFileSync(new URL('./public/tokens.css', import.meta.url)), 'text/css; charset=utf-8');
    send(req, res, 404, { error: 'Not found', code: 'not_found' });
  } catch (e) {
    if (e instanceof HttpError) return send(req, res, e.status, { error: e.message, code: e.code });
    console.error(`${req.method} ${path}:`, e.message);
    send(req, res, 502, { error: 'We could not reach the Stellar network. Try again.', code: 'upstream' });
  }
}).listen(PORT, HOST, () => console.log(`Nomad Vault backend on http://${HOST}:${PORT} (admin signer ${admin ? 'on, demo mode' : 'off'})`));
