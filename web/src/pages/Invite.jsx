import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { day, frequency } from '../lib/format.js';
import { addTrustline, getOrCreateVaultKey } from '../lib/vaultKey.js';
import { useNetwork } from '../lib/network.jsx';
import Amount from '../components/Amount.jsx';
import { Tag } from '../components/StatusBadge.jsx';
import Stepper from '../components/Stepper.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';

const SETUP_STEPS = [
  { key: 'key', label: 'Vault key created in this browser' },
  { key: 'fund', label: 'Vault opened on Stellar testnet, ready for USDC' },
  { key: 'link', label: 'Vault linked to your agreement' },
];

export default function Invite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const network = useNetwork();
  const { data, loading, error, reload } = useApi(() => endpoints.invitation(token), token);
  const [progress, setProgress] = useState(null); // index of the step in progress, or null
  const [setupError, setSetupError] = useState(null);

  if (loading) return <div className="container page narrow"><Loading label="Opening your invitation…" /></div>;
  if (error?.status === 404) return <InviteGone title="This invitation link is not valid." />;
  if (error?.status === 410) return <InviteGone title="This invitation has expired or was already used." />;
  if (error) return <div className="container page narrow"><ErrorState title="We could not open this invitation." error={error} onRetry={reload} /></div>;

  const { company, contractor, expiresAt, accepted } = data;
  const companyName = company?.name || 'Your client';

  if (accepted) {
    return (
      <InviteGone title="This invitation was already accepted." body="Your vault is already set up.">
        <Link to={`/vault/${contractor.id}`} className="btn btn-primary">Open my vault</Link>
      </InviteGone>
    );
  }

  async function createVault() {
    setSetupError(null);
    try {
      setProgress(0);
      const key = await getOrCreateVaultKey(contractor.id);
      setProgress(1);
      await endpoints.fundVault(key.publicKey);
      await addTrustline(key, network);
      setProgress(2);
      const res = await endpoints.acceptInvitation(token, key.publicKey);
      setProgress(3);
      navigate(`/vault/${res.contractor?.id || contractor.id}`);
    } catch (e) {
      setSetupError(e);
    }
  }

  const steps = SETUP_STEPS.map((s, i) => ({
    ...s,
    state: progress == null || i > progress ? 'todo' : i < progress ? 'done' : setupError ? 'error' : 'active',
  }));
  const working = progress != null && !setupError;

  return (
    <div className="container page narrow">
      <p className="eyebrow">Invitation from {companyName}</p>
      <h1 className="h2">{companyName} wants to pay you through Nomad Vault</h1>

      <dl className="qa">
        <div>
          <dt>Who is inviting you?</dt>
          <dd>{companyName}, for {contractor.displayName}{contractor.email && ` (${contractor.email})`}.</dd>
        </div>
        <div>
          <dt>How much and how often?</dt>
          <dd>
            <Amount value={contractor.amount} asset={contractor.asset} />, {frequency(contractor.frequency).toLowerCase()}.
            {contractor.nextPaymentDate && <> Next payment expected on {day(contractor.nextPaymentDate)}.</>}
          </dd>
        </div>
        <div>
          <dt>What are you creating?</dt>
          <dd>A compensation vault: your own account on Stellar where your pay arrives. You do not need to share bank details with {companyName}.</dd>
        </div>
        <div>
          <dt>Who controls the funds?</dt>
          <dd>You do. {companyName} can send payments into your vault but cannot take them back once a payment is complete. You decide whether to hold, send or withdraw.</dd>
        </div>
        <div>
          <dt>What does private mean?</dt>
          <dd>
            Nomad Vault is designed so your pay and balance are not visible to the public, using Stellar Private Payments.{' '}
            <Tag tone="attention">Prototype</Tag> In this testnet demo, private transfers are still being connected, so
            payments are visible on the public Stellar testnet explorer.
          </dd>
        </div>
      </dl>

      <section className="card">
        <h2 className="h3">Create your vault</h2>
        <p className="small muted">
          Demo: a vault key is created and kept only in this browser. The production version uses a passkey on your
          device, so there is nothing to write down.
        </p>
        {progress != null && <Stepper steps={steps} />}
        {setupError && (
          <p className="error-text" role="alert">We could not finish creating your vault. No funds moved. {setupError.message}</p>
        )}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={createVault} disabled={working}>
            {working ? 'Creating your vault…' : setupError ? 'Try again' : 'Create my vault'}
          </button>
        </div>
        {expiresAt && <p className="small muted">This invitation expires on {day(expiresAt)}.</p>}
      </section>
    </div>
  );
}

const GONE_BODY = 'Ask the company that invited you for a new link. Nothing has been paid or charged.';

function InviteGone({ title, body = GONE_BODY, children }) {
  return (
    <div className="container page narrow">
      <Empty title={title} action={children}>{body}</Empty>
    </div>
  );
}
