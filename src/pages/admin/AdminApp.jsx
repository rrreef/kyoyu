import { useState, useEffect } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import AdminOverview from './AdminOverview';
import AdminUsers    from './AdminUsers';
import AdminTracks   from './AdminTracks';
import { LayoutDashboard, Users, Music, LogOut } from 'lucide-react';
import './AdminApp.css';

const NAV = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16}/> },
  { id: 'users',    label: 'Users',    icon: <Users size={16}/> },
  { id: 'tracks',   label: 'Tracks',   icon: <Music size={16}/> },
];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [page, setPage]  = useState('overview');

  // iOS native tab bar bridge — register window.__kyoyuGo so the tab bar
  // can drive navigation even though AdminApp doesn't use React Router.
  useEffect(() => {
    // Map any incoming path to the closest admin section
    window.__kyoyuGo = (path) => {
      if (path.includes('users'))   setPage('users');
      else if (path.includes('tracks')) setPage('tracks');
      else                          setPage('overview');
    };
    // Also listen for the custom event (race-condition safety)
    const handler = (e) => { if (e.detail) window.__kyoyuGo(e.detail); };
    window.addEventListener('kyoyu-navigate', handler);
    // Report initial route to Swift
    try { window.webkit?.messageHandlers?.route?.postMessage('/admin'); } catch (_) {}
    return () => {
      delete window.__kyoyuGo;
      window.removeEventListener('kyoyu-navigate', handler);
    };
  }, []);

  // Report page changes to native bridge
  useEffect(() => {
    try { window.webkit?.messageHandlers?.route?.postMessage(`/admin/${page}`); } catch (_) {}
  }, [page]);

  return (
    <div className="adm-shell">
      {/* ── Sidebar ── */}
      <aside className="adm-sidebar">
        <div className="adm-logo">
          <div className="adm-logo-mark">K</div>
          <div className="adm-logo-text">Admin</div>
        </div>

        <nav className="adm-nav">
          <div className="adm-nav-section">Platform</div>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`adm-nav-item${page === n.id ? ' active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="adm-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="adm-sidebar-footer">
          <div className="adm-user-chip">
            <div className="adm-user-role">Admin</div>
            <div className="adm-user-email">{user?.email}</div>
          </div>
          <button className="adm-logout" onClick={logout}>
            <LogOut size={13} style={{ marginRight: 6, verticalAlign: 'middle' }}/>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="adm-main">
        {page === 'overview' && <AdminOverview />}
        {page === 'users'    && <AdminUsers />}
        {page === 'tracks'   && <AdminTracks />}
      </main>
    </div>
  );
}
