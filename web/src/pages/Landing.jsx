import { Link } from 'react-router-dom';
import '../landing.css';

// Marketing landing page ("Nomad Vault 2" design). Layout.jsx renders no app chrome on "/",
// so this page owns its header, main and footer. Illustrations live in public/landing/.

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#why-stellar', label: 'Why Stellar' },
];

// Demo contractors from server/demo-data.json, with the USDC amounts the demo pays them.
// x/y place each tag on the 1280x430 map; mx/my are the phone positions (the map is zoomed on the Atlantic there).
const TAGS = [
  { who: 'Jonas · Berlin', amount: '380 USDC', x: 610, y: 22, mx: 560, my: 20 },
  { who: 'Maya · Lisbon', amount: '550 USDC', x: 330, y: 104, mx: 372, my: 118 },
  { who: 'Mateo · Buenos Aires', amount: '420 USDC', x: 292, y: 326, mx: 246, my: 322 },
  { who: 'Nadia · Singapore', amount: '480 USDC', x: 985, y: 300, mobile: false },
];

const pct = (v, total) => `${((v / total) * 100).toFixed(2)}%`;

const STEPS = [
  {
    img: 'step-fund', w: 569, title: ['Fund your', 'treasury'],
    body: 'Add USDC or EURC to your company’s treasury and manage payment funds from one place.',
  },
  {
    img: 'step-team', w: 571, title: ['Set up your', 'team'],
    body: 'Invite your contractors and set up their recurring compensation agreements.',
  },
  {
    img: 'step-pay', w: 571, title: ['Approve & pay', 'privately'],
    body: 'Review payroll and send private payments directly to your contractors’ personal vaults.',
  },
];

const FEATURES = [
  {
    img: 'feature-treasury', w: 504, title: ['One place', 'for every', 'payment.'],
    body: 'Manage contractor compensation from a single company treasury.',
  },
  {
    img: 'feature-privacy', w: 502, title: ['Privacy', 'comes', 'standard.'],
    body: 'Keep sensitive compensation details private with Stellar Private Payments.',
  },
  {
    img: 'feature-control', w: 504, title: ['Their money.', 'Their control.'],
    body: 'Contractors receive payments into personal vaults they independently control.',
  },
];

function Card({ n, item, height, variant }) {
  return (
    <li className={`lp-card lp-card--${variant}`}>
      <span className="lp-card__num" aria-hidden="true">{String(n).padStart(2, '0')}</span>
      <img
        className="lp-card__art" src={`${import.meta.env.BASE_URL}landing/${item.img}.webp`} width={item.w} height={height}
        alt="" loading="lazy" decoding="async"
      />
      <h3 className="lp-card__title">{item.title.map((line, i) => <span key={line}>{i > 0 && ' '}{line}</span>)}</h3>
      <p className="lp-card__body">{item.body}</p>
    </li>
  );
}

function ArrowUpRight() {
  return (
    <svg className="lp-btn__icon" viewBox="712 2997 20 20" aria-hidden="true">
      <path d="M714.5 3014.5L729.5 2999.5M729.5 3014.5V2999.5H714.5" fill="none" stroke="currentColor" strokeWidth="3.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="lp-header lp-wrap">
        <Link to="/" className="lp-brand">Nomad Vault</Link>
        <nav className="lp-nav" aria-label="Sections">
          {NAV.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <Link to="/app" className="lp-btn lp-btn--cobalt lp-header__cta">Explore Demo</Link>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-wrap lp-center">
            <h1 id="lp-hero-title" className="lp-h1">
              <span>Hire anywhere.</span> <span>Pay without borders</span>
            </h1>
            <p className="lp-sub">One treasury for your global team. A private, personal vault for everyone.</p>
            <Link to="/app" className="lp-btn lp-btn--cobalt">Explore Demo</Link>
          </div>
          <div className="lp-map">
            <img className="lp-map__dots" src={`${import.meta.env.BASE_URL}landing/world-dots.svg`} width="1280" height="430" alt="" />
            <ul className="lp-map__tags" aria-label="Example contractors">
              {TAGS.map((t, i) => (
                <li
                  key={t.who}
                  className={`lp-tag${t.mobile === false ? ' lp-tag--wide-only' : ''}`}
                  style={{
                    '--i': i,
                    '--x': pct(t.x, 1280), '--y': pct(t.y, 430),
                    '--mx': pct(t.mx ?? t.x, 1280), '--my': pct(t.my ?? t.y, 430),
                  }}
                >
                  <span className="lp-tag__who">{t.who}</span>
                  <span className="lp-tag__amount">{t.amount}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="lp-section lp-section--soft" aria-labelledby="lp-how-title">
          <div className="lp-wrap lp-center">
            <h2 id="lp-how-title" className="lp-h2">Global payday, simplified</h2>
            <ol className="lp-cards">
              {STEPS.map((s, i) => <Card key={s.img} n={i + 1} item={s} height={419} variant="white" />)}
            </ol>
          </div>
        </section>

        <section id="features" className="lp-section lp-section--cobalt lp-demo" aria-labelledby="lp-demo-title">
          <div className="lp-wrap lp-center">
            <h2 id="lp-demo-title" className="lp-h2 lp-h2--yellow">See Nomad Vault in action.</h2>
            <p className="lp-sub lp-sub--light">A simple workspace for companies. Independent personal vaults for contractors.</p>
            <div className="lp-views">
              <Link to="/app" className="lp-btn lp-btn--cream lp-btn--lg">Employer View</Link>
              <Link to="/vault/ctr_maya" className="lp-btn lp-btn--soft lp-btn--lg">Contractor View</Link>
            </div>
            <div className="lp-stage">
              <img
                className="lp-shot" src={`${import.meta.env.BASE_URL}landing/dashboard.webp`} width="1728" height="1581" loading="lazy" decoding="async"
                alt="Employer dashboard: treasury balance, next payroll and recent payments to Maya, Mateo and Jonas in USDC."
              />
              <div className="lp-note lp-note--payday">
                <p>Payday? One click away</p>
                <svg viewBox="1074 2283 183 126" width="183" height="126" aria-hidden="true">
                  <path d="M1078 2372.5C1125.17 2401.67 1213.7 2442.5 1190.5 2372.5C1186.67 2360.96 1182.47 2351.99 1178.14 2345.13M1178.14 2345.13C1149.63 2299.93 1115.78 2345.7 1150.5 2347C1158.95 2347.32 1168.44 2346.7 1178.14 2345.13ZM1178.14 2345.13C1214.33 2339.26 1253.26 2320.13 1250.5 2287" />
                </svg>
              </div>
              <div className="lp-note lp-note--private">
                <p>Private by design</p>
                <svg viewBox="66 2733 116 86" width="116" height="86" aria-hidden="true">
                  <path d="M178.454 2798.5C131.287 2827.67 28.5771 2794.5 103.577 2738" />
                </svg>
              </div>
            </div>
            <Link to="/app" className="lp-btn lp-btn--yellow lp-btn--lg">Explore Demo <ArrowUpRight /></Link>
          </div>
        </section>

        <section id="why-stellar" className="lp-section lp-section--plain" aria-labelledby="lp-why-title">
          <div className="lp-wrap lp-center">
            <h2 id="lp-why-title" className="lp-h2">One treasury. More freedom</h2>
            <ol className="lp-cards">
              {FEATURES.map((f, i) => <Card key={f.img} n={i + 1} item={f} height={389} variant="yellow" />)}
            </ol>
          </div>
        </section>

        <section className="lp-closing" aria-labelledby="lp-closing-title">
          <div className="lp-wrap lp-center">
            <h2 id="lp-closing-title" className="lp-h2">
              <span>Your team is everywhere.</span> <span>Your payroll isn’t</span>
            </h2>
            <p className="lp-sub lp-sub--cobalt">One treasury. Private payments. A better way to pay your global team.</p>
            <Link to="/app" className="lp-btn lp-btn--cobalt">Explore Demo</Link>
          </div>
          <img className="lp-closing__globe" src={`${import.meta.env.BASE_URL}landing/globe.webp`} width="1933" height="322" alt="" loading="lazy" decoding="async" />
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <div className="lp-footer__brand">
            <Link to="/" className="lp-brand">Nomad Vault</Link>
            <p>Hackathon prototype on Stellar testnet. Moves no real money.</p>
          </div>
          <nav className="lp-footer__nav" aria-label="Footer">
            {NAV.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
            <a href="https://github.com/harsxul/nomad-vault" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <p className="lp-footer__copy">© 2026 Nomad Vault</p>
        </div>
      </footer>
    </div>
  );
}
