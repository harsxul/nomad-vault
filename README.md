# Nomad Vault

**Hire anywhere. Pay without borders.** One USDC treasury for a company's global team, and a personal vault every contractor owns and keeps between jobs. Built on Stellar in 48 hours for HackMeridian Lisbon 2026 (Genesis track, Stellar Composed).

## The problem

Companies that hire contractors abroad pay through slow, expensive cross-border rails. The contractor's money then sits in an employer or platform account they do not control. Moving payroll on-chain fixes speed and cost, but on a public ledger everyone can read everyone's salary.

## What Nomad Vault does

1. **Fund your treasury.** The company treasury is a smart account on Stellar holding Circle's testnet USDC.
2. **Set up your team.** The admin adds a contractor and sends an invite link. The contractor opens it, a vault (a Stellar account) is created in their browser, funded, and given a USDC trustline. Only the public address reaches our server.
3. **Approve and pay.** The admin reviews the month's payroll and approves it. A payroll operator key pays each contractor, but only inside a daily limit that the treasury contract itself enforces. Anything above the limit is refused on-chain and waits for an admin signature.
4. **Private payments.** Stellar Private Payments (a zero-knowledge pool by Nethermind) lets a company pay salaries without publishing amounts and recipients. We deployed it ourselves and ran it end to end on futurenet (see below).

## Live on Stellar testnet

| What | Value |
|---|---|
| Treasury smart account (current demo) | [`CBQEGC3W3LQYOXVDGZOBNY2TCYPDALNXDBREUVLW4FTS7FOL352KHMBX`](https://stellar.expert/explorer/testnet/contract/CBQEGC3W3LQYOXVDGZOBNY2TCYPDALNXDBREUVLW4FTS7FOL352KHMBX) |
| Payroll asset | Circle testnet USDC, Stellar Asset Contract `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) |
| Spending-limit policy (OpenZeppelin) | `CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G`, rule "payroll": operator key, USDC `transfer` only, 1,000 USDC per 17,280 ledgers (about one day) |
| Ed25519 verifier | `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4` |
| Smart account wasm hash | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |

A real payroll run on 26 Oct 2026 (October, 1,350 USDC for three contractors), on the previous treasury [`CCBW5GLO…7X22`](https://stellar.expert/explorer/testnet/contract/CCBW5GLO53X2K5H6ACMQDNWHWJXPCWTJGE5YW6EZVVRIP3AE6QP27X22) (each `npm run demo:reset` deploys a fresh one):

| Contractor | Amount | Signed by | Result |
|---|---|---|---|
| Jonas | 380 USDC | operator (rule 1) | [paid](https://stellar.expert/explorer/testnet/tx/e9244028c6041fdb268b1ecd522c57d4a2024b7567f2e66d28be3aff700682a7) |
| Mateo | 420 USDC | operator (rule 1) | [paid](https://stellar.expert/explorer/testnet/tx/751663a0de40cef64566af6cf52dd0ac6b924023170776417f56a73cc67a13d1) |
| Maya | 550 USDC | operator refused by the policy (contract error #3221, daily limit reached), then admin (rule 0) | [paid by admin](https://stellar.expert/explorer/testnet/tx/579815f149059a3446bf2dc52c5a6c0a38302908f1e76f5baf1724c74a4de2a3) |

All contract IDs live in `config/deployments.testnet.json`.

### Private payments (futurenet)

Testnet storage fees are currently so high that a private deposit simulates at about 3,626 XLM in fees, above the transaction fee cap, so it cannot be submitted there. On futurenet the same deposit costs about 0.74 XLM, so we deployed Stellar Private Payments (tag `cli-v0.2.0`) there and ran the full flow:

| Step | Transaction |
|---|---|
| Register contractor key | `889d8ab8e7991fbc8f919a4232840d6ce44ebc46e3d94d3366df9765592737cf` |
| Register employer key | `2ec89c4d553b6812245a66face2cad68506048f51260ba85a4e9bc7d22cc92a7` |
| Deposit into the private pool | `2d202e6688ae6255c9daa8c7d74fcfcc1a444cc7b438ed84114c8142087982f8` |
| Private transfer to the contractor | `fd285b9b74c08bf753e3aff8310b51715113a44281d05c4ae3aae9917eb4c1ce` |
| Contractor withdraws | `1c0294cea715a2b5978f3760a1d727d582e8840f9fb7aacd7ec450ff66be1cd9` |

Pool `CD6BKKPA57VKLF5C3G34C573V4DUW2BUAURRDOGNXXM25LU43BT6QDKJ`, registry `CASERIUJCPAEROSYZTYJ3E6P7ZFZOC2URNZ5LPZ2F6XG2ZCLCVI7UWLK` on futurenet. Scripts and logs: `spike/spp-cli/`. In the app, payroll settles through the treasury and the private rail is shown as a prototype.

## Architecture

```
Browser (React, web/)                     Backend (Node, server/)                    Stellar testnet
  Company admin: dashboard, contractors,    REST API (docs/API.md)                     Treasury smart account
  payroll review, approve, execute   --->   SQLite: contractors, invites, runs  --->   (OpenZeppelin, context rules,
  Contractor: invite, vault, balance        Payroll runner: one payment at a time       spending-limit policy)
  Vault key + USDC trustline signed         Signs as operator under rule 1;            USDC Stellar Asset Contract
  in the browser, secret never sent         admin under rule 0 only on approval        Soroban events = payment history
```

- The server holds one policy-limited operator key. Even if that key leaked, the treasury contract caps what it can move per day.
- Payment history is read back from Soroban `transfer` events, not from our database.
- Amounts are handled as integers in base units (7 decimals), never floats (`server/payroll.mjs`, unit tested).

## Run it locally

Requirements: Node 22.5 or newer (uses the built-in `node:sqlite`), the [Stellar CLI](https://developers.stellar.org/docs/tools/cli), and internet access to Stellar testnet.

1. Create and fund the demo keys (testnet only):
   ```bash
   for k in nv-employer nv-admin nv-operator; do stellar keys generate $k --network testnet --fund; done
   ```
2. Install and deploy your own treasury. This buys 5,000 testnet USDC on the testnet DEX with testnet XLM, deploys the smart account, funds it and adds the payroll rule (takes about two minutes; testnet fees for this are about 6,500 testnet XLM, so merge an extra friendbot account into `nv-employer` if needed):
   ```bash
   cd server && npm install && npm run demo:reset
   ```
3. Start the backend: `npm start` (serves on http://127.0.0.1:8787).
4. In another terminal: `cd web && npm install && npm run dev`, then open http://127.0.0.1:5173.

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Backend port |
| `HOST` | `127.0.0.1` | Backend bind address |
| `NV_DEMO_ADMIN` | on | Set to `0` to remove the admin signer, so over-limit payments can only wait |
| `NV_<NAME>_SECRET` | from `stellar keys` | Secret for a key alias, for example `NV_OPERATOR_SECRET` for `nv-operator` |

## Demo script (3 minutes)

1. Landing page, then **Explore Demo**.
2. Dashboard: treasury balance in USDC, the operator's daily limit, next payroll.
3. Contractors: add one, copy the invite link, open it in a private window, create the vault (key, funding, USDC trustline), land in the contractor's vault.
4. Payroll: **Review payroll**, approve, execute. Watch each payment move through "Policy checked, Submitted, Confirmed". When the daily limit is reached the policy refuses the next one on-chain; approve it as admin.
5. Open any transaction on stellar.expert. Open the contractor vault to see the money arrive.

`npm run demo:reset` in `server/` gives a fresh treasury and clean demo data.

## Prior work and what we reused

Everything in this repository was written during the hackathon (25 to 26 Oct 2026). We reused contracts that already exist: the OpenZeppelin smart account, Ed25519 verifier and spending-limit policy that SDF deployed on testnet, and Nethermind's Stellar Private Payments (tag `cli-v0.2.0`), which we deployed ourselves on testnet and futurenet. `spike/SPIKE.md` records the experiments and decisions.

## Limitations (honest list)

- Demo only: testnet, throwaway keys, no authentication on the company API. The server binds to localhost by default.
- Contractor vault keys live in the browser's local storage. The production design is a passkey smart account per contractor.
- Private payments run on futurenet, not yet inside the payroll runner.

## Repository map

- `server/`: API and payroll runner. `server/scripts/setup-treasury.mjs` deploys a treasury.
- `web/`: React app (landing page, company admin, contractor vault).
- `config/deployments.testnet.json`: network settings and contract IDs.
- `docs/API.md`: API contract. `docs/UI-REVIEW.md`: design review notes.
- `spike/`: Phase 0 experiments with transaction evidence.

## Team

[names]
