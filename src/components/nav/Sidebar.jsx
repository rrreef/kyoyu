import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library, ShoppingBag, Store, Music, LogOut, MessageCircle, CalendarDays } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.css';

// Routes that the native iOS profile button handles — none of these should
// highlight a sidebar item (profile icon lives in the native top-right cluster)
const PROFILE_ROUTES = new Set(['/profile', '/account', '/uploads', '/app-settings', '/downloads', '/orders', '/subscription', '/settings']);

const navItems = [
  { to: '/',            label: 'Home',        icon: Home           },
  { to: '/search',      label: 'Search',      icon: Search         },
  { to: '/library',     label: 'Library',     icon: Library        },
  { to: '/events',      label: 'Events',      icon: CalendarDays   },
  { to: '/shop',        label: 'Shop',        icon: ShoppingBag    },
  { to: '/marketplace', label: 'Marketplace', icon: Store          },
  { to: '/messages',    label: 'Messages',    icon: MessageCircle  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  // When on a profile-owned route, suppress ALL active highlights
  const isProfileRoute = PROFILE_ROUTES.has(pathname)
    || pathname.startsWith('/release/')
    || pathname.startsWith('/artist/')
    || pathname.startsWith('/label/');



  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar glass">
        {/* Logo */}
        <div className="sidebar-logo">
          <span className="logo-mark">
            {/* Record + Tonearm */}
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="12" stroke="white" strokeWidth="2" fill="none"/>
              <line x1="6" y1="26" x2="26" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="nav-label">Menu</div>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive && !isProfileRoute ? 'active' : ''}`
              }
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="plan-badge glass-sm">
            <Music size={12} />
            <span>Reef {user?.plan || 'Standard'}</span>
          </div>
          <div className="plan-sub">€9.99 / month</div>

          <button className="sidebar-logout" onClick={logout} title="Sign out">
            <LogOut size={14} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
