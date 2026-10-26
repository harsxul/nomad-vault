import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import PaperPlane from './components/PaperPlane.jsx';
import { NetworkProvider } from './lib/network.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contractors from './pages/Contractors.jsx';
import PayrollHistory from './pages/PayrollHistory.jsx';
import PayrollRun from './pages/PayrollRun.jsx';
import Invite from './pages/Invite.jsx';
import Vault from './pages/Vault.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <NetworkProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<><PaperPlane /><Landing /></>} />
          <Route path="app" element={<Dashboard />} />
          <Route path="app/contractors" element={<Contractors />} />
          <Route path="app/payroll" element={<PayrollHistory />} />
          <Route path="app/payroll/:id" element={<PayrollRun />} />
          <Route path="invite/:token" element={<Invite />} />
          <Route path="vault/:contractorId" element={<Vault />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </NetworkProvider>
  );
}
