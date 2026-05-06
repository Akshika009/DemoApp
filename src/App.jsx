import { BrowserRouter as Router, NavLink, Route, Routes } from 'react-router-dom';
import { Edit3, FileText, Home as HomeIcon, Upload } from 'lucide-react';
import './App.css';
import Home from './components/Home';
import OverrideContracts from './components/OverrideContracts';
import UploadContracts from './components/UploadContracts';
import ViewContracts from './components/ViewContracts';
import AppFooter from './components/AppFooter';
import AiAssistantWidget from './components/AiAssistantWidget';
import pepsicoLogo from './assets/pepsico-logo-official.png';

const defaultUserName = import.meta.env.VITE_DEFAULT_USER_NAME || 'Akshika Guglani';
const defaultUserRole = import.meta.env.VITE_DEFAULT_USER_ROLE || 'Contracts Manager';

const resolveUserName = () => {
  if (typeof window === 'undefined') {
    return defaultUserName;
  }
  return window.localStorage.getItem('contracts_user_name') || defaultUserName;
};

const resolveUserRole = () => {
  if (typeof window === 'undefined') {
    return defaultUserRole;
  }
  return window.localStorage.getItem('contracts_user_role') || defaultUserRole;
};

const initialsFor = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return 'AG';
  }

  return parts
    .slice(0, 2)
    .map((token) => token[0].toUpperCase())
    .join('');
};

function App() {
  const userName = resolveUserName();
  const userRole = resolveUserRole();
  const userInitials = initialsFor(userName);

  return (
    <Router>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-wrap">
            <div
              className="brand-logo-lockup"
              role="img"
              aria-label="PepsiCo logo"
              style={{ '--brand-logo-url': `url(${pepsicoLogo})` }}
            >
              <span className="brand-logo-icon" aria-hidden="true" />
              <span className="brand-logo-wordmark" aria-hidden="true" />
            </div>
            <div>
              <p className="brand-title">Tibersoft Contracts Application</p>
              <p className="brand-subtitle">PepsiCo Databricks Contract Management</p>
            </div>
          </div>
          <div className="topbar-right">
            <nav className="topnav">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'topnav-link active' : 'topnav-link')}>
                <HomeIcon size={14} />
                Home
              </NavLink>
              <NavLink to="/view" className={({ isActive }) => (isActive ? 'topnav-link active' : 'topnav-link')}>
                <FileText size={14} />
                View Contracts
              </NavLink>
              <NavLink to="/upload" className={({ isActive }) => (isActive ? 'topnav-link active' : 'topnav-link')}>
                <Upload size={14} />
                Upload New Contracts
              </NavLink>
              <NavLink to="/override" className={({ isActive }) => (isActive ? 'topnav-link active' : 'topnav-link')}>
                <Edit3 size={14} />
                Override Existing
              </NavLink>
            </nav>
            <div className="profile-chip">
              <div className="profile-text">
                <p className="profile-name">{userName}</p>
                <p className="profile-role">{userRole}</p>
              </div>
              <div className="profile-avatar" aria-hidden="true">{userInitials}</div>
            </div>
          </div>
        </header>

        <main className="page-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/view" element={<ViewContracts />} />
            <Route path="/upload" element={<UploadContracts />} />
            <Route path="/override" element={<OverrideContracts />} />
          </Routes>
        </main>

        <AiAssistantWidget />
        <AppFooter />
      </div>
    </Router>
  );
}

export default App;
