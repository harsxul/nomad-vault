// Loading, empty and error states. Copy stays plain: say what happened and what did not.
import { getApiMessage } from '../lib/api.js';

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="state state--empty">
      <p className="state-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state-title">{title}</p>
      {error && <p className="muted">{getApiMessage(error)}</p>}
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={() => onRetry()}>
          Try again
        </button>
      )}
    </div>
  );
}

// Small inline notice for action results (success or failure) inside a page.
export function Notice({ tone = 'info', children, onDismiss }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onDismiss && (
        <button type="button" className="btn btn-quiet btn-small" onClick={onDismiss} aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}
