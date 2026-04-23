import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Upload, Music, Settings, LogOut, Users, Palette } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './CreatorSidebar.css';

const LogoMark = () => (
  <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="12" stroke="white" strokeWidth="2" fill="none"/>
    <line x1="6" y1="26" x2="26" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const creatorNav = [
  { to: '/upload',          label: 'Upload',           icon: Upload   },
  { to: '/releases',        label: 'Releases',         icon: Music    },
  { to: '/artists',         label: 'Artists',          icon: Users    },
  { to: '/visual-identity', label: 'Visual Identity',  icon: Palette  },
  { to: '/settings',        label: 'Settings',         icon: Settings },
];

// Condensed 5-item mobile bottom bar for creator portal
const creatorMobileNav = [
  { to: '/dashboard',       label: 'Dashboard', icon: BarChart3 },
  { to: '/upload',          label: 'Upload',    icon: Upload    },
  { to: '/releases',        label: 'Releases',  icon: Music     },
  { to: '/visual-identity', label: 'Identity',  icon: Palette   },
  { to: '/settings',        label: 'Settings',  icon: Settings  },
];

export default function CreatorSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === '/dashboard';

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="creator-sidebar glass">
        {/* Logo */}
        <div className="creator-sidebar__logo">
          <span className="logo-mark">
            <LogoMark />
          </span>
        </div>

        {/* Portal label */}
        <div className="creator-sidebar__portal-label">Creator Portal</div>

        {/* Dashboard — top link, styled separately */}
        <nav className="creator-sidebar__nav">
          <button
            className={`creator-nav-item creator-nav-dashboard ${isDashboard ? 'active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            <BarChart3 size={18} strokeWidth={1.8} />
            <span>Dashboard</span>
          </button>

          {creatorNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `creator-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer — artist info + logout */}
        <div className="creator-sidebar__footer">
          <div className="creator-artist-badge">
            <div className="creator-artist-avatar">
              {(user?.artistName || user?.name || 'A')[0].toUpperCase()}
            </div>
            <div className="creator-artist-info">
              <span className="creator-artist-name">{user?.artistName || user?.name || 'Artist'}</span>
              <span className="creator-artist-plan">{user?.email || 'Creator'}</span>
            </div>
          </div>
          <button className="creator-logout-btn" onClick={logout} title="Sign out">
            <LogOut size={15} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav (smartphone only) ── */}
      <nav className="creator-mobile-nav">
        {creatorMobileNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={22} strokeWidth={1.6} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
