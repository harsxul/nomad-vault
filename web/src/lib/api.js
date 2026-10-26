// Thin client for the Nomad Vault API (contract: docs/API.md). Every call goes through /api, proxied in dev.

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getApiMessage(error) {
  if (!error) return FALLBACK[0];
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error.message) return String(error.message);
  return FALLBACK[0];
}

const FALLBACK = {
  0: 'We could not reach Nomad Vault. Check that the server is running, then try again.',
  404: 'We could not find what you asked for.',
  500: 'Something went wrong on our side.',
};

const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const demoState = {
  contractors: [
    { id: 'ctr_maya', displayName: 'Maya Silva', email: 'maya@example.com', countryLabel: 'Portugal', amount: '550.00', asset: 'USDC', frequency: 'monthly', status: 'active', vaultAddress: 'GCXG5QK5XSPCIQW2D3LDJ3IEJHJ7JFUV3T3PH6URRUCBXO3657LASJR3', vaultShort: 'GCXG…ASJR3', nextPaymentDate: '2026-10-28' },
    { id: 'ctr_mateo', displayName: 'Mateo Alvarez', email: 'mateo@example.com', countryLabel: 'Argentina', amount: '420.00', asset: 'USDC', frequency: 'monthly', status: 'active', vaultAddress: 'GDUXYP3FXU4TN6Z27ZIQBBP3SIAXE5H5JYTE2GXDGE2VB3IWRR5HWKVR', vaultShort: 'GDUX…WKVR', nextPaymentDate: '2026-10-28' },
    { id: 'ctr_jonas', displayName: 'Jonas Weber', email: 'jonas@example.com', countryLabel: 'Germany', amount: '380.00', asset: 'USDC', frequency: 'monthly', status: 'active', vaultAddress: 'GDCM2KIZBRXUQJTJN4OFIPTG72XXF53BIGBABGKHRXJUMGP55WYKQHJD', vaultShort: 'GDCM…QHJD', nextPaymentDate: '2026-10-28' },
    { id: 'ctr_nadia', displayName: 'Nadia Chen', email: 'nadia@example.com', countryLabel: 'Singapore', amount: '480.00', asset: 'USDC', frequency: 'monthly', status: 'invited', vaultAddress: null, vaultShort: null, nextPaymentDate: '2026-10-28' },
  ],
  runs: [],
};

const hostedDemo = () => !API_ORIGIN && typeof window !== 'undefined' && /(?:vercel\.app|now\.sh|tmp\.now)$/.test(window.location.hostname);

function demoApi(path, method, body = {}) {
  if (path === '/dashboard') {
    const active = demoState.contractors.filter((c) => c.status === 'active' && c.vaultAddress);
    const total = active.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2);
    return { company: { id: 'northstar', name: 'Northstar Labs' }, network: 'Stellar Testnet', asset: 'USDC', treasury: { address: 'G...', balance: '12,450.00' }, nextPayroll: { total, contractorCount: active.length, funded: true, date: '2026-10-28' }, payrollPolicy: { dailyLimit: '2,000.00', spentInWindow: '0.00', remaining: '2,000.00', ledgersLeft: 17 }, counts: { active: active.length, invited: demoState.contractors.filter((c) => c.status === 'invited').length, paused: demoState.contractors.filter((c) => c.status === 'paused').length }, recentRuns: demoState.runs, recentPayments: [], privatePayments: { status: 'Demo mode: private transfer integration is not connected on this deployment.', registrations: [] } };
  }
  if (path === '/contractors') return { contractors: demoState.contractors };
  const contractorMatch = path.match(/^\/contractors\/([^/]+)$/);
  if (contractorMatch && method === 'GET') {
    const contractor = demoState.contractors.find((c) => c.id === decodeURIComponent(contractorMatch[1]));
    if (!contractor) throw new ApiError('Contractor not found', 404, 'not_found');
    return { contractor, payments: [] };
  }
  const actionMatch = path.match(/^\/contractors\/([^/]+)\/(pause|resume)$/);
  if (actionMatch && method === 'POST') {
    const contractor = demoState.contractors.find((c) => c.id === decodeURIComponent(actionMatch[1]));
    if (!contractor) throw new ApiError('Contractor not found', 404, 'not_found');
    contractor.status = actionMatch[2] === 'pause' ? 'paused' : 'active';
    return { contractor };
  }
  if (path === '/payroll-runs') {
    if (method === 'GET') return { runs: demoState.runs };
    const active = demoState.contractors.filter((c) => c.status === 'active' && c.vaultAddress);
    if (!active.length) throw new ApiError('No active contractors with a vault to pay yet.', 409, 'nothing_to_pay');
    const totalAmount = active.reduce((sum, c) => sum + Number(c.amount), 0);
    const run = { id: `run_demo_${Date.now()}`, period: '2026-10', asset: 'USDC', status: 'draft', total: totalAmount.toFixed(2), warnings: [], approvedBy: null, approvedAt: null, createdAt: new Date().toISOString(), treasuryBefore: '12,450.00', treasuryAfter: (12450 - totalAmount).toFixed(2), policy: { dailyLimit: '2,000.00', remaining: '2,000.00', withinLimit: true }, items: active.map((c) => ({ id: `item_${c.id}`, contractorId: c.id, displayName: c.displayName, countryLabel: c.countryLabel, amount: c.amount, status: 'pending', steps: [] })) };
    demoState.runs.unshift(run);
    return { run };
  }
  const runMatch = path.match(/^\/payroll-runs\/([^/]+)(?:\/(approve|execute))?$/);
  if (runMatch) {
    const run = demoState.runs.find((r) => r.id === decodeURIComponent(runMatch[1]));
    if (!run) throw new ApiError('Payroll run not found', 404, 'not_found');
    if (method === 'POST' && runMatch[2] === 'approve') { run.status = 'approved'; run.approvedBy = body.approvedBy || 'Company admin'; run.approvedAt = new Date().toISOString(); }
    if (method === 'POST' && runMatch[2] === 'execute') { run.status = 'confirmed'; run.items.forEach((item) => { item.status = 'confirmed'; }); }
    return { run };
  }
  if (path.startsWith('/vaults/')) return { address: path.split('/').pop(), exists: true, balance: '0.00', receivedTotal: '0.00', asset: 'USDC', payments: [] };
  throw new ApiError('This demo action is not available on the hosted preview.', 501, 'demo_unavailable');
}

export async function api(path, { method = 'GET', body } = {}) {
  const init = { method, headers: { accept: 'application/json' } };
  if (method !== 'GET') {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(`${API_ORIGIN}/api${path}`, init);
  } catch {
    if (hostedDemo()) return demoApi(path, method, body);
    throw new ApiError(FALLBACK[0], 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok && hostedDemo()) return demoApi(path, method, body);
  // A 5xx with no JSON body comes from the dev proxy, not our API: the server is not reachable.
  if (!res.ok && !data && res.status >= 500) throw new ApiError(FALLBACK[0], res.status);
  if (!res.ok) {
    const message = data?.error || FALLBACK[res.status] || (res.status >= 500 ? FALLBACK[500] : 'The request was not accepted.');
    throw new ApiError(message, res.status, data?.code);
  }
  return data;
}

const enc = encodeURIComponent;

export const endpoints = {
  dashboard: () => api('/dashboard'),
  contractors: () => api('/contractors'),
  contractor: (id) => api(`/contractors/${enc(id)}`),
  createContractor: (body) => api('/contractors', { method: 'POST', body }),
  pauseContractor: (id) => api(`/contractors/${enc(id)}/pause`, { method: 'POST' }),
  resumeContractor: (id) => api(`/contractors/${enc(id)}/resume`, { method: 'POST' }),
  newInvitation: (id) => api(`/contractors/${enc(id)}/invitations`, { method: 'POST' }),
  invitation: (token) => api(`/invitations/${enc(token)}`),
  acceptInvitation: (token, vaultAddress) => api(`/invitations/${enc(token)}/accept`, { method: 'POST', body: { vaultAddress } }),
  runs: () => api('/payroll-runs'),
  run: (id) => api(`/payroll-runs/${enc(id)}`),
  createRun: () => api('/payroll-runs', { method: 'POST' }),
  approveRun: (id, approvedBy) => api(`/payroll-runs/${enc(id)}/approve`, { method: 'POST', body: { approvedBy } }),
  executeRun: (id) => api(`/payroll-runs/${enc(id)}/execute`, { method: 'POST' }),
  adminApproveItem: (runId, itemId) => api(`/payroll-runs/${enc(runId)}/items/${enc(itemId)}/admin-approve`, { method: 'POST' }),
  vault: (address) => api(`/vaults/${enc(address)}`),
  fundVault: (address) => api('/demo/fund-vault', { method: 'POST', body: { address } }),
};
