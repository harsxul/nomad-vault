import { money } from '../lib/format.js';

// Every amount on screen goes through here so it gets tabular numerals.
// Big figures render the asset code smaller so long amounts fit their card.
export default function Amount({ value, asset, className = '' }) {
  if (asset && className.includes('figure')) {
    return <span className={`num ${className}`}>{money(value)} <span className="figure-unit">{asset}</span></span>;
  }
  return <span className={`num ${className}`}>{money(value, asset)}</span>;
}
