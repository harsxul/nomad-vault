import { cloneElement, useState } from 'react';
import { endpoints } from '../lib/api.js';
import { frequency } from '../lib/format.js';
import { useNetwork } from '../lib/network.jsx';
import Amount from './Amount.jsx';
import InvitationLink from './InvitationLink.jsx';

const STEP_TITLES = ['Identity and invitation', 'Compensation terms', 'Review and create'];
const EMPTY = { displayName: '', email: '', countryLabel: '', amount: '', frequency: 'monthly' };

function validate(step, f) {
  const errors = {};
  if (step === 0) {
    if (!f.displayName.trim()) errors.displayName = 'Enter the contractor’s name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email address.';
  }
  if (step === 1) {
    if (!/^\d+(\.\d{1,2})?$/.test(f.amount.trim()) || Number(f.amount) <= 0) errors.amount = 'Enter an amount above zero, with at most two decimals.';
  }
  return errors;
}

// Three short steps; no bank details are ever asked for. On success it shows the invitation link.
export default function AddContractor({ onCreated, onDone }) {
  const { asset } = useNetwork();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function next(e) {
    e.preventDefault();
    const found = validate(step, form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (step < 2) return setStep(step + 1);
    setBusy(true);
    setSubmitError(null);
    try {
      const body = { ...form, displayName: form.displayName.trim(), email: form.email.trim(), countryLabel: form.countryLabel.trim(), amount: Number(form.amount).toFixed(2) };
      const res = await endpoints.createContractor(body);
      setResult(res);
      onCreated?.(res.contractor);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="stack">
        <p><strong>{result.contractor.displayName}</strong> has been added as invited. Their vault becomes active once they accept.</p>
        <InvitationLink invitation={result.invitation} />
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={next} noValidate>
      <p className="small muted">Step {step + 1} of 3 · {STEP_TITLES[step]}</p>

      {step === 0 && (
        <>
          <Field id="displayName" label="Full name" error={errors.displayName}>
            <input id="displayName" className="input" value={form.displayName} onChange={set('displayName')} autoComplete="off" />
          </Field>
          <Field id="email" label="Email for the invitation" error={errors.email}>
            <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="off" />
          </Field>
          <Field id="countryLabel" label="Location (optional)" hint="Shown as context for your team, not as a compliance check.">
            <input id="countryLabel" className="input" value={form.countryLabel} onChange={set('countryLabel')} placeholder="e.g. Portugal" />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <Field id="amount" label={`Amount per payment${asset ? ` (${asset})` : ''}`} error={errors.amount}>
            <input id="amount" className="input num" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </Field>
          <div className="field">
            <span className="field-label">How often</span>
            <p>Monthly <span className="small muted">(the demo pays monthly)</span></p>
          </div>
        </>
      )}

      {step === 2 && (
        <dl className="summary">
          <div><dt>Name</dt><dd>{form.displayName}</dd></div>
          <div><dt>Email</dt><dd>{form.email}</dd></div>
          <div><dt>Location</dt><dd>{form.countryLabel || '—'}</dd></div>
          <div><dt>Compensation</dt><dd><Amount value={form.amount} asset={asset} /> · {frequency(form.frequency)}</dd></div>
          <div><dt>Bank details</dt><dd>Not needed. The contractor creates their own vault.</dd></div>
        </dl>
      )}

      {submitError && (
        <p className="error-text" role="alert">We could not add this contractor. Nothing was saved. {submitError.message}</p>
      )}

      <div className="actions">
        {step > 0 && <button type="button" className="btn btn-quiet" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {step < 2 ? 'Continue' : busy ? 'Creating…' : 'Create invitation'}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {cloneElement(children, { 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && <p className="small muted" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="small error-text" id={`${id}-error`}>{error}</p>}
    </div>
  );
}
