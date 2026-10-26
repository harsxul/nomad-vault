// One-time setup: deploy a company treasury smart account on testnet, fund it with testnet USDC, and add the payroll rule
// (operator key, USDC transfers only, daily spending limit). Writes the result into config/deployments.testnet.json.
// Usage: node server/scripts/setup-treasury.mjs [--limit 1000] [--fund 5000]
import { execFileSync } from 'node:child_process';
import { Address, nativeToScVal, xdr, Horizon, Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { cfg, saveConfig, server, keypair, scMap, externalSigner, callAsTreasury } from '../stellar.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const UNIT = 10_000_000n;
const limit = BigInt(arg('limit', '1000')) * UNIT;
const fund = BigInt(arg('fund', '5000')) * UNIT;
const cli = (...a) => execFileSync('stellar', a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const T = cfg.treasury;
const admin = keypair('nv-admin');
const operator = keypair('nv-operator');
const feePayer = keypair(T.feePayerAlias || 'nv-employer');

const horizon = new Horizon.Server(cfg.horizonUrl);
const usdc = new Asset(cfg.asset.code, cfg.asset.issuer);
const usdcBalance = async (pub) => (await horizon.loadAccount(pub)).balances.find((b) => b.asset_code === usdc.code && b.asset_issuer === usdc.issuer);
const toMinor = (s) => BigInt(s.replace('.', '')); // Horizon always prints 7 decimals
async function classic(kp, op) {
  const tx = new TransactionBuilder(await horizon.loadAccount(kp.publicKey()), { fee: '10000', networkPassphrase: cfg.networkPassphrase })
    .addOperation(op).setTimeout(60).build();
  tx.sign(kp);
  return horizon.submitTransaction(tx);
}

// Accounts need a trustline before they can hold USDC: the fee payer (buys it) and the demo contractor vaults (receive it).
for (const alias of [T.feePayerAlias || 'nv-employer', 'nv-maya', 'nv-mateo', 'nv-jonas']) {
  let kp;
  try { kp = keypair(alias); } catch { console.log('skip trustline', alias, '(no local key; the demo vaults already trust USDC)'); continue; }
  if (!(await usdcBalance(kp.publicKey()))) { await classic(kp, Operation.changeTrust({ asset: usdc })); console.log('trustline', alias); }
}

// Buy the missing USDC with testnet XLM on the Stellar DEX.
const have = toMinor((await usdcBalance(feePayer.publicKey())).balance);
if (have < fund) {
  const want = ((fund - have) * 101n / 100n).toString().padStart(8, '0');
  const destAmount = `${want.slice(0, -7)}.${want.slice(-7)}`;
  const [best] = (await horizon.strictReceivePaths([Asset.native()], usdc, destAmount).call()).records;
  if (!best) { console.error('No XLM to USDC path on the testnet DEX right now'); process.exit(1); }
  const sendMax = (Number(best.source_amount) * 1.05).toFixed(7);
  await classic(feePayer, Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(), sendMax, destination: feePayer.publicKey(), destAsset: usdc, destAmount,
    path: best.path.map((a) => (a.asset_type === 'native' ? Asset.native() : new Asset(a.asset_code, a.asset_issuer))),
  }));
  console.log('bought', destAmount, 'USDC for at most', sendMax, 'XLM');
}

const signers = JSON.stringify([{ External: [T.ed25519Verifier, Buffer.from(admin.rawPublicKey()).toString('hex')] }]);
const treasury = cli('contract', 'deploy', '--wasm-hash', T.accountWasmHash, '--source', T.feePayerAlias || 'nv-employer', '--network', 'testnet', '--', '--signers', signers, '--policies', '{}');
const deployedFromLedger = (await server.getLatestLedger()).sequence - 5;
console.log('treasury', treasury);

cli('contract', 'invoke', '--id', cfg.asset.contract, '--source', T.feePayerAlias || 'nv-employer', '--network', 'testnet', '--', 'transfer',
  '--from', T.feePayerAlias || 'nv-employer', '--to', treasury, '--amount', fund.toString());
console.log('funded', String(fund / UNIT));

const latest = (await server.getLatestLedger()).sequence;
const params = scMap([['period_ledgers', xdr.ScVal.scvU32(17280)], ['spending_limit', nativeToScVal(limit, { type: 'i128' })]]);
const r = await callAsTreasury({
  treasury, contract: treasury, fn: 'add_context_rule', ruleId: 0, signer: admin, feePayer,
  args: [
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('CallContract'), new Address(cfg.asset.contract).toScVal()]),
    xdr.ScVal.scvString('payroll'),
    xdr.ScVal.scvU32(latest + 120960),
    xdr.ScVal.scvVec([externalSigner(operator)]),
    xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: new Address(T.spendingLimitPolicy).toScVal(), val: params })]),
  ],
});
if (!r.ok) { console.error('add_context_rule failed', r); process.exit(1); }
console.log('payroll rule added', r.hash);

Object.assign(cfg.treasury, { account: treasury, payrollRuleId: 1, deployedFromLedger, setupTx: r.hash, dailyLimitMinor: limit.toString() });
saveConfig();
console.log('config updated');
