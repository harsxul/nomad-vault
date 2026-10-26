import { Link } from 'react-router-dom';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { day, dateTime, period } from '../lib/format.js';
import Amount from '../components/Amount.jsx';
import Meter from '../components/Meter.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge, { Tag } from '../components/StatusBadge.jsx';
import TxLink from '../components/TxLink.jsx';
import ReviewPayrollButton from '../components/ReviewPayrollButton.jsx';
import { ErrorState, Loading } from '../components/States.jsx';

const SAMPLE_RUNS = [
  { id: 'sample-2026-09', period: '2026-09', status: 'confirmed', total: '1290.00', sample: true },
  { id: 'sample-2026-08', period: '2026-08', status: 'confirmed', total: '1240.00', sample: true },
];
const SAMPLE_PAYMENTS = [
  { tx: 'sample-maya', at: '2026-09-28T09:15:00Z', toName: 'Maya Silva', amount: '525.00', sample: true },
  { tx: 'sample-mateo', at: '2026-09-28T09:16:00Z', toName: 'Mateo Alvarez', amount: '405.00', sample: true },
  { tx: 'sample-jonas', at: '2026-09-28T09:17:00Z', toName: 'Jonas Weber', amount: '360.00', sample: true },
];

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(endpoints.dashboard);

  if (loading) return <div className="container page"><Loading label="Loading your treasury…" /></div>;
  if (error) return <div className="container page"><ErrorState title="We could not load the dashboard." error={error} onRetry={reload} /></div>;

  const { company, asset, treasury, nextPayroll, payrollPolicy: policy, counts = {}, recentRuns = [], recentPayments = [], privatePayments } = data;
  const displayedRuns = recentRuns.length ? recentRuns : SAMPLE_RUNS;
  const displayedPayments = recentPayments.length ? recentPayments : SAMPLE_PAYMENTS;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{company?.name}</p>
          <h1 className="h2">Dashboard</h1>
        </div>
        <ReviewPayrollButton runs={recentRuns} />
      </div>

      <div className="grid grid--stats">
        <StatCard label="Treasury balance" footer={<TxLink href={treasury?.link}>View treasury on Stellar</TxLink>}>
          <Amount value={treasury?.balance} asset={asset} className="figure figure--currency" />
        </StatCard>

        <StatCard
          label="Next payroll"
          tone={nextPayroll?.funded === false ? 'attention' : undefined}
          footer={<>{nextPayroll?.contractorCount ?? '—'} contractors · {day(nextPayroll?.date)}</>}
        >
          <Amount value={nextPayroll?.total} asset={asset} className="figure figure--currency" />
          <p>{nextPayroll?.funded ? <Tag tone="positive">Funded</Tag> : <Tag tone="attention">Needs funding</Tag>}</p>
        </StatCard>

        <StatCard label="Left today for the operator" footer="Above the limit, an admin approves.">
          <Amount value={policy?.remaining} asset={asset} className="figure" />
          <Meter value={policy?.spentInWindow} max={policy?.dailyLimit} label="Daily limit used" />
          <p className="small muted">of <Amount value={policy?.dailyLimit} /> daily limit</p>
        </StatCard>

        <StatCard label="Contractors" footer={<Link to="/app/contractors">Manage contractors</Link>}>
          <p className="figure num">{counts.active ?? 0} <span className="figure-unit">active</span></p>
          <p className="small muted">
            {counts.invited ?? 0} invited{counts.paused ? ` · ${counts.paused} paused` : ''}
          </p>
        </StatCard>
      </div>

      <div className="grid grid--two">
        <section className="card">
          <div className="card-head">
            <h2 className="h3">Recent payroll runs</h2>
            <Link to="/app/payroll" className="small">All runs</Link>
          </div>
          <ul className="list">
            {displayedRuns.map((r) => (
              <li key={r.id} className="list-row">
                {r.sample ? (
                  <span>{period(r.period)}<span className="small muted block">Demo record</span></span>
                ) : (
                  <Link to={`/app/payroll/${r.id}`}>{period(r.period)}</Link>
                )}
                <Amount value={r.total} asset={asset} />
                <StatusBadge kind="run" value={r.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="h3">Recent payments</h2>
          <ul className="list">
            {displayedPayments.map((p) => (
              <li key={p.tx + p.at} className="list-row">
                <span>
                  {p.toName || 'Unknown recipient'}
                  <span className="small muted block">{dateTime(p.at)}</span>
                </span>
                <Amount value={p.amount} asset={asset} />
                {p.sample ? <Tag tone="muted">Sample</Tag> : <TxLink href={p.link} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="h3">Private payments</h2>
          <Tag tone="attention">Prototype</Tag>
        </div>
        <p>{privatePayments?.status || 'Status not available.'}</p>
        {privatePayments?.registrations?.length > 0 && (
          <ul className="list">
            {privatePayments.registrations.map((r) => (
              <li key={r.tx} className="list-row">
                <span>Registered: {r.who}</span>
                <TxLink href={r.link} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
