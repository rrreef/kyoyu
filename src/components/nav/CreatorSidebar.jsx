import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Upload, Music, Settings, LogOut, Users, Palette,
         ChevronDown, Globe, Lock } from 'lucide-react';
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
  { to: '/artists',         label: 'Artists',          icon: Users    },
  { to: '/visual-identity', label: 'Visual Identity',  icon: Palette  },
  { to: '/settings',        label: 'Settings',         icon: Settings },
];

const creatorMobileNav = [
  { to: '/dashboard',       label: 'Dashboard', icon: BarChart3 },
  { to: '/upload',          label: 'Upload',    icon: Upload    },
  { to: '/releases/public', label: 'Releases',  icon: Music     },
  { to: '/visual-identity', label: 'Identity',  icon: Palette   },
  { to: '/settings',        label: 'Settings',  icon: Settings  },
];

const RELEASE_SUB = [
  { to: '/releases/public',  label: 'Public',  icon: Globe, hint: 'Published releases' },
  { to: '/releases/private', label: 'Private', icon: Lock,  hint: 'Drafts & scheduled' },
];

export default function CreatorSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard    = location.pathname === '/dashboard';
  const isReleasesPath = location.pathname.startsWith('/releases');

  // Auto-open submenu if on a releases route
  const [releasesOpen, setReleasesOpen] = useState(isReleasesPath);

  const toggleReleases = () => setReleasesOpen(o => !o);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="creator-sidebar glass">
        {/* Logo */}
        <div className="creator-sidebar__logo">
          <span className="logo-mark"><LogoMark /></span>
        </div>

        {/* Portal label */}
        <div className="creator-sidebar__portal-label">Creator Portal</div>

        <nav className="creator-sidebar__nav">
          {/* Dashboard */}
          <button
            className={`creator-nav-item creator-nav-dashboard ${isDashboard ? 'active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            <BarChart3 size={18} strokeWidth={1.8} />
            <span>Dashboard</span>
          </button>

          {/* Upload */}
          <NavLink to="/upload" className={({ isActive }) => `creator-nav-item ${isActive ? 'active' : ''}`}>
            <Upload size={18} strokeWidth={1.8} /><span>Upload</span>
          </NavLink>

          {/* Releases — with submenu */}
          <div className={`creator-nav-group ${isReleasesPath ? 'active' : ''}`}>
            <button
              className={`creator-nav-item creator-nav-group__header ${isReleasesPath ? 'active' : ''}`}
              onClick={toggleReleases}
            >
              <Music size={18} strokeWidth={1.8} />
              <span>Releases</span>
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={`creator-nav-chevron ${releasesOpen ? 'open' : ''}`}
              />
            </button>

            {/* Submenu */}
            <div className={`creator-submenu ${releasesOpen ? 'open' : ''}`}>
              {RELEASE_SUB.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `creator-submenu-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          {/* Other nav items */}
          {creatorNav.slice(1).map(({ to, label, icon: Icon }) => (
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

        {/* Footer */}
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

      {/* ── Mobile bottom nav ── */}
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
