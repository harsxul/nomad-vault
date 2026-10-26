// Demo vault key, stored in this browser only. Production replaces this with a passkey smart account.
// The secret never leaves the browser: only the public address is sent to the server.

const storageKey = (contractorId) => `nomad-vault:demo-vault-key:${contractorId}`;

export function readVaultKey(contractorId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(contractorId)) || 'null');
  } catch {
    return null;
  }
}

export async function getOrCreateVaultKey(contractorId) {
  const existing = readVaultKey(contractorId);
  if (existing?.publicKey) return existing;
  const { Keypair } = await import('@stellar/stellar-sdk');
  const kp = Keypair.random();
  const record = { publicKey: kp.publicKey(), secret: kp.secret(), createdAt: new Date().toISOString(), note: 'demo vault key, stored in this browser' };
  localStorage.setItem(storageKey(contractorId), JSON.stringify(record));
  return record;
}

// A Stellar account must trust USDC before it can receive it. Signed here, so the secret stays in this browser.
export async function addTrustline(record, { asset, assetIssuer, horizonUrl, networkPassphrase }) {
  const { Horizon, Asset, Operation, TransactionBuilder, Keypair } = await import('@stellar/stellar-sdk');
  const horizon = new Horizon.Server(horizonUrl);
  const account = await horizon.loadAccount(record.publicKey);
  if (account.balances.some((b) => b.asset_code === asset && b.asset_issuer === assetIssuer)) return;
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset(asset, assetIssuer) })).setTimeout(60).build();
  tx.sign(Keypair.fromSecret(record.secret));
  await horizon.submitTransaction(tx);
}
