# Nomad Vault API (hackathon backend)

Base URL in development: `http://localhost:8787`. All bodies are JSON. Errors return `{ "error": "<plain-English message>", "code": "<machine code>" }` with a 4xx/5xx status.

Money: every amount is a decimal string in token units with two decimals for display (`"5.50"`) and an integer string in base units (`amountMinor`, 7 decimals for USDC). The demo settles in Circle's testnet USDC through its Stellar Asset Contract; `asset` tells the UI which code to show. Contractor vaults need a USDC trustline, which the invite flow adds in the browser.

The backend stores product metadata only. It holds one policy-limited payroll operator key; it never holds contractor keys.

## Status vocabularies

- Contractor `status`: `invited` | `active` | `paused` | `ended`
- Payroll run `status`: `draft` | `awaiting_approval` | `approved` | `executing` | `needs_approval` | `partially_confirmed` | `confirmed` | `failed`
  - Run `needs_approval` = nothing failed, but at least one payment waits for an admin because the daily limit was reached.
- Payroll item `status`: `pending` | `submitted` | `confirmed` | `failed` | `needs_approval`
  - `needs_approval` = the treasury's on-chain spending policy refused the operator (daily limit reached). An admin must approve it.
- Payroll item `steps`: ordered list for the progress UI, each `{ "key": "policy" | "submitted" | "confirmed", "label": string, "state": "todo" | "active" | "done" | "error" }`

## Endpoints

### Network and dashboard

`GET /api/network-config`
```json
{ "network": "testnet", "asset": "USDC", "assetIssuer": "G...", "horizonUrl": "https://horizon-testnet.stellar.org", "networkPassphrase": "...", "explorer": "https://stellar.expert/explorer/testnet", "treasury": "C...", "privatePool": "C..." }
```

`GET /api/dashboard`
```json
{
  "company": { "id": "northstar", "name": "Northstar Labs" },
  "network": "testnet", "asset": "USDC", "latestLedger": 5385050,
  "treasury": { "address": "C...", "link": "https://...", "balance": "176.00" },
  "nextPayroll": { "total": "18.30", "contractorCount": 3, "funded": true, "date": "2026-10-28" },
  "payrollPolicy": { "rule": "payroll", "dailyLimit": "25.00", "spentInWindow": "0.00", "remaining": "25.00", "windowLedgers": 17280, "ledgersLeft": 120000 },
  "counts": { "active": 3, "invited": 1, "paused": 0 },
  "recentRuns": [ { "id": "run_...", "period": "2026-10", "status": "confirmed", "total": "18.30", "createdAt": "..." } ],
  "recentPayments": [ { "at": "2026-10-25T16:59:32Z", "toName": "Maya Silva", "amount": "5.50", "tx": "hash", "link": "https://..." } ],
  "privatePayments": { "status": "string", "registrations": [ { "who": "maya", "tx": "hash", "link": "https://..." } ] }
}
```

### Contractors

`GET /api/contractors` → `{ "contractors": [Contractor] }`

Contractor:
```json
{
  "id": "ctr_maya", "displayName": "Maya Silva", "email": "maya@example.com", "countryLabel": "Portugal",
  "amount": "5.50", "amountMinor": "55000000", "asset": "USDC", "frequency": "monthly",
  "status": "active", "vaultAddress": "G..." , "vaultShort": "GCXG…SJR3",
  "nextPaymentDate": "2026-10-28", "createdAt": "..."
}
```

`POST /api/contractors` body `{ "displayName", "email", "countryLabel", "amount": "4.80", "frequency": "monthly" }` → `{ "contractor": Contractor, "invitation": { "token": "...", "url": "/invite/<token>", "expiresAt": "..." } }`. Validation errors return 400.

`GET /api/contractors/:id` → `{ "contractor": Contractor, "payments": [Payment] }` where Payment = `{ "at", "amount", "tx", "link", "runId" | null }`.

`POST /api/contractors/:id/pause` and `POST /api/contractors/:id/resume` → `{ "contractor": Contractor }`

`POST /api/contractors/:id/invitations` → new invitation for an invited contractor (same shape as above).

### Invitations (contractor side)

`GET /api/invitations/:token` → `{ "company": { "name" }, "contractor": Contractor, "expiresAt", "accepted": false }`. 404 if unknown, 410 if expired or used.

`POST /api/invitations/:token/accept` body `{ "vaultAddress": "G..." }` → `{ "contractor": Contractor }` (status becomes `active`). The demo creates the vault in the browser: a fresh Stellar keypair funded by testnet friendbot, plus a USDC trustline signed in the browser. Passkey smart accounts are the intended production version.

### Payroll runs

`GET /api/payroll-runs` → `{ "runs": [PayrollRun] }` newest first.

`POST /api/payroll-runs` body `{}` → if this month already has an unfinished run, returns it (`reused: true`) instead of creating a second one. Otherwise creates a `draft` run with one item per `active` contractor that has a vault and has not already been paid this month. 409 when everyone is already paid or a run is executing.

`GET /api/payroll-runs/:id` → `{ "run": PayrollRun }`

PayrollRun:
```json
{
  "id": "run_...", "period": "2026-10", "asset": "USDC", "status": "draft",
  "total": "18.30", "totalMinor": "183000000",
  "treasuryBefore": "176.00", "treasuryAfter": "157.70",
  "policy": { "dailyLimit": "25.00", "remaining": "25.00", "withinLimit": true },
  "warnings": [ "Nadia Chen has not activated a vault and is not included." ],
  "approvedBy": null, "approvedAt": null, "createdAt": "...",
  "items": [ {
    "id": "itm_...", "contractorId": "ctr_maya", "displayName": "Maya Silva", "countryLabel": "Portugal",
    "amount": "5.50", "status": "pending", "signer": null,
    "tx": null, "link": null, "failureCode": null, "message": null,
    "steps": [ { "key": "policy", "label": "Policy checked", "state": "todo" }, { "key": "submitted", "label": "Submitted to Stellar", "state": "todo" }, { "key": "confirmed", "label": "Confirmed", "state": "todo" } ]
  } ]
}
```

`POST /api/payroll-runs/:id/approve` body `{ "approvedBy": "Alex" }` → run with status `approved`. Approval locks the amounts.

`POST /api/payroll-runs/:id/execute` → returns immediately with status `executing`; items progress in the background one by one. Poll `GET /api/payroll-runs/:id` every 1–2 s. Retrying `execute` on a `partially_confirmed` or `failed` run only resends `failed` items; confirmed items are never resent.

`POST /api/payroll-runs/:id/items/:itemId/admin-approve` → pays a `needs_approval` item with the treasury admin key (demo mode only; returns 403 when the server has no admin signer configured).

### Contractor vault

`GET /api/vaults/:address` → `{ "address", "exists": true, "balance": "15.50", "receivedTotal": "5.50", "asset": "USDC", "payments": [Payment with "fromCompany": "Northstar Labs"] }`

`POST /api/demo/fund-vault` body `{ "address": "G..." }` → funds a new testnet account through friendbot. `{ "funded": true }`.
