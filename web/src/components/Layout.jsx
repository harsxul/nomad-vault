import { NavLink, Outlet, useLocation } from 'react-router-dom';
import RoleSwitcher from './RoleSwitcher.jsx';

const ADMIN_NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/contractors', label: 'Contractors' },
  { to: '/app/payroll', label: 'Payroll' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const inAdmin = pathname.startsWith('/app');

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <div className="container header-inner">
          <NavLink to="/" className="brand">Nomad Vault</NavLink>
          {inAdmin && (
            <nav className="nav" aria-label="Company">
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="header-end">
            <span className="badge badge--attention">Testnet demo</span>
            <RoleSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container small muted">
          Demo amounts are shown in USDC. Settlement currently uses testnet XLM; no real money is moved.
        </div>
      </footer>
    </div>
  );
}
