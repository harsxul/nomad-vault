import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useNetwork } from '../lib/network.jsx';
import { readVaultKey } from '../lib/vaultKey.js';
import { dateTime, day, frequency } from '../lib/format.js';
import Amount from '../components/Amount.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge, { Tag } from '../components/StatusBadge.jsx';
import TxLink from '../components/TxLink.jsx';
import Modal from '../components/Modal.jsx';
import VaultActions from '../components/VaultActions.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';

export default function Vault() {
  const { contractorId } = useParams();
  const person = useApi(() => endpoints.contractor(contractorId), contractorId);
  const address = person.data?.contractor?.vaultAddress;
  const vault = useApi(() => (address ? endpoints.vault(address) : Promise.resolve(null)), address);
  const [action, setAction] = useState(null);

  if (person.loading) return <div className="container page"><Loading label="Opening your vault…" /></div>;
  if (person.error) {
    const title = person.error.status === 404 ? 'We could not find this vault.' : 'We could not open your vault.';
    return <div className="container page"><ErrorState title={title} error={person.error} onRetry={person.reload} /></div>;
  }

  const { contractor } = person.data;
  if (!address) {
    return (
      <div className="container page">
        <Empty title={`${contractor.displayName} has not created a vault yet.`}>
          Open the invitation link from the company to create it. Payments start once the vault is active.
        </Empty>
      </div>
    );
  }

  // Prefer the chain view of payments (includes the paying company); fall back to the agreement's record.
  const payments = vault.data?.payments || person.data.payments || [];
  const latest = payments[0];
  const asset = vault.data?.asset || contractor.asset;
  const firstName = contractor.displayName.split(' ')[0];

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Compensation vault</p>
          <h1 className="h2">Hi {firstName}</h1>
        </div>
        <StatusBadge kind="contractor" value={contractor.status} />
      </div>

      <div className="grid grid--stats">
        <StatCard label="Compensation received" tone="feature" footer={<PrivacyLine />}>
          {vault.loading && <p className="muted">Checking balance…</p>}
          {vault.error && <p className="small error-text">We could not read your balance right now. {vault.error.message}</p>}
          {vault.data && <Amount value={vault.data.receivedTotal ?? vault.data.balance} asset={asset} className="figure" />}
          {vault.data && <p className="small">Total balance {vault.data.balance} {asset}.</p>}
        </StatCard>

        <StatCard label="Latest compensation" footer={latest && <TxLink href={latest.link}>Confirmed on Stellar</TxLink>}>
          {latest ? (
            <>
              <Amount value={latest.amount} asset={asset} className="figure" />
              <p className="small muted">{latest.fromCompany ? `From ${latest.fromCompany} · ` : ''}{dateTime(latest.at)}</p>
            </>
          ) : (
            <p className="muted">No payments yet.</p>
          )}
        </StatCard>

        <StatCard label="Next expected payment">
          {contractor.status === 'paused' ? (
            <p>Payments are paused by the company.</p>
          ) : (
            <>
              <Amount value={contractor.amount} asset={contractor.asset} className="figure" />
              <p className="small muted">{day(contractor.nextPaymentDate)} · {frequency(contractor.frequency)}</p>
            </>
          )}
        </StatCard>
      </div>

      <div className="actions actions--vault">
        <button type="button" className="btn btn-secondary" onClick={() => setAction('hold')}>Hold</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAction('send')}>Send</button>
        <button type="button" className="btn btn-primary" onClick={() => setAction('withdraw')}>Withdraw</button>
      </div>

      <section className="card">
        <h2 className="h3">Payment history</h2>
        {payments.length === 0 ? (
          <Empty title="No payments yet.">Your first payment will appear here as soon as it is confirmed.</Empty>
        ) : (
          <ul className="list">
            {payments.map((p) => (
              <li key={p.tx + p.at} className="list-row">
                <span>
                  {p.fromCompany || 'Compensation'}
                  <span className="small muted block">{dateTime(p.at)}</span>
                </span>
                <Amount value={p.amount} asset={asset} />
                <TxLink href={p.link} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountRecovery contractorId={contractor.id} address={address} vaultShort={contractor.vaultShort} />

      <Modal open={!!action} title={{ hold: 'Hold', send: 'Send', withdraw: 'Withdraw' }[action] || ''} onClose={() => setAction(null)}>
        {action && <VaultActions action={action} onClose={() => setAction(null)} />}
      </Modal>
    </div>
  );
}

function PrivacyLine() {
  return (
    <span>
      <Tag tone="attention">Prototype</Tag> Private balances are in development. On testnet your payments are publicly visible.
    </span>
  );
}

function AccountRecovery({ contractorId, address, vaultShort }) {
  const { explorer } = useNetwork();
  const key = readVaultKey(contractorId);
  return (
    <section className="card">
      <h2 className="h3">Account and recovery</h2>
      <dl className="summary">
        <div>
          <dt>Sign-in</dt>
          <dd>
            {key ? 'Demo vault key, stored in this browser.' : 'This vault’s demo key is not stored in this browser.'}{' '}
            <Tag tone="attention">Demo</Tag>
          </dd>
        </div>
        <div>
          <dt>Recovery</dt>
          <dd>
            The intended production design is passkey sign-in with passkey recovery: you sign in with your device and can
            add a second device to recover access. No seed phrase to write down.
          </dd>
        </div>
        <div>
          <dt>Vault reference</dt>
          <dd>
            <span className="num">{vaultShort || address}</span>{' '}
            {explorer && <TxLink href={`${explorer}/account/${address}`}>View on Stellar</TxLink>}
          </dd>
        </div>
      </dl>
    </section>
  );
}
