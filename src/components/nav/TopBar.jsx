import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LayoutDashboard, Upload, Music, Users, Palette, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './TopBar.css';

const isNativeApp = !!window.webkit?.messageHandlers?.player;

const ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',       icon: LayoutDashboard, hint: 'Overview · Stats · Payouts' },
  { label: 'Upload Release',  path: '/upload',          icon: Upload,          hint: 'Upload tracks & artwork'    },
  { label: 'Releases',        path: '/releases',        icon: Music,           hint: 'Manage your catalog'        },
  { label: 'Artists',         path: '/artists',         icon: Users,           hint: 'Artist profiles'            },
  { label: 'Visual Identity', path: '/visual-identity', icon: Palette,         hint: 'Branding & theme'           },
  { label: 'Settings',        path: '/settings',        icon: Settings,        hint: 'Account · Billing · Privacy'},
];

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

export default function TopBar({ showSearch = true }) {
  const navigate          = useNavigate();
  const { avatarSrc }     = useAuth();
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState('');
  const wrapRef           = useRef(null);
  const inputRef          = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
    else setQ('');
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  const results = q.trim()
    ? ITEMS.filter(it =>
        it.label.toLowerCase().includes(q.toLowerCase()) ||
        it.hint.toLowerCase().includes(q.toLowerCase())
      )
    : [];

  const select = useCallback((path) => { navigate(path); setOpen(false); }, [navigate]);

  if (isNativeApp) return null;

  return (
    <div className={`topbar-cluster ${open ? 'search-open' : ''}`}>

      {/* ── Search — circle → pill morph ── */}
      {showSearch && (
        <div
          className={`topbar-glass-search ${open ? 'open' : ''}`}
          ref={wrapRef}
        >
          {/* Input grows LEFT, icon stays RIGHT — no row-reverse needed */}
          <input
            ref={inputRef}
            className="topbar-search-input"
            placeholder="Search…"
            value={q}
            onChange={e => setQ(e.target.value)}
            tabIndex={open ? 0 : -1}
          />
          <button
            className="topbar-search-icon-btn"
            onClick={() => setOpen(o => !o)}
            title="Search"
          >
            <SearchIcon />
          </button>

          {/* Dropdown */}
          {open && (results.length > 0 || q.trim().length > 0) && (
            <div className="topbar-search-results">
              {results.length > 0
                ? results.map((it, i) => {
                    const Icon = it.icon;
                    return (
                      <button key={i} className="topbar-search-item" onClick={() => select(it.path)}>
                        <span className="topbar-search-item-icon"><Icon size={13} strokeWidth={1.8} /></span>
                        <span className="topbar-search-item-body">
                          <span className="topbar-search-item-label">{it.label}</span>
                          <span className="topbar-search-item-hint">{it.hint}</span>
                        </span>
                      </button>
                    );
                  })
                : (
                  <div className="topbar-search-empty">No results for "<em>{q}</em>"</div>
                )
              }
            </div>
          )}
        </div>
      )}

      {/* ── Bell — standalone glass circle ── */}
      <div className="topbar-glass-btn" role="button" tabIndex={0} title="Notifications">
        <Bell size={15} strokeWidth={2} />
      </div>

      {/* ── Avatar — standalone glass circle ── */}
      <div
        className="topbar-glass-btn topbar-glass-btn--avatar"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/profile')}
        title="Profile"
      >
        {avatarSrc
          ? <img src={avatarSrc} alt="Avatar" className="topbar-avatar-img" />
          : <div className="topbar-avatar-placeholder">A</div>
        }
      </div>

    </div>
  );
}
