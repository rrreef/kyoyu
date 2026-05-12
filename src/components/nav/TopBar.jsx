import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LayoutDashboard, Upload, Music, Users, Palette, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './TopBar.css';

const isNativeApp = navigator.userAgent.includes('KyoyuApp');

const ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',       icon: LayoutDashboard, hint: 'Overview · Stats · Payouts' },
  { label: 'Upload Release',  path: '/upload',          icon: Upload,          hint: 'Upload tracks & artwork'    },
  { label: 'Releases',        path: '/releases',        icon: Music,           hint: 'Manage your catalog'        },
  { label: 'Artists',         path: '/artists',         icon: Users,           hint: 'Artist profiles'            },
  { label: 'Visual Identity', path: '/visual-identity', icon: Palette,         hint: 'Branding & theme'           },
  { label: 'Settings',        path: '/settings',        icon: Settings,        hint: 'Account · Billing · Privacy'},
  { label: 'Payout',          path: '/dashboard',       icon: LayoutDashboard, hint: 'Revenue breakdown'          },
  { label: 'Contract',        path: '/dashboard',       icon: LayoutDashboard, hint: 'Terms & contract status'    },
  { label: 'Notifications',   path: '/dashboard',       icon: LayoutDashboard, hint: 'Send to followers'          },
];

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

export default function TopBar({ showSearch = true }) {
  const navigate              = useNavigate();
  const { avatarSrc }         = useAuth();
  const [open, setOpen]       = useState(false);
  const [q, setQ]             = useState('');
  const wrapRef               = useRef(null);
  const inputRef              = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
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

  return (
    <header className="topbar glass">
      <div className="topbar-nav" />

      {/* Desktop actions */}
      <div className="topbar-actions topbar-actions--desktop">

        {/* Search — icon stays, input slides left */}
        {showSearch && (
          <div className={`topbar-search-wrap ${open ? 'open' : ''}`} ref={wrapRef}>

            {/* Sliding input — appears to left of icon */}
            <input
              ref={inputRef}
              className="topbar-search-input"
              placeholder=""
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-hidden={!open}
            />

            {/* Icon always stays */}
            <button
              className={`topbar-btn topbar-search-btn ${open ? 'active' : ''}`}
              onClick={() => setOpen(o => !o)}
              title="Search"
            >
              <SearchIcon />
            </button>

            {/* Results dropdown — anchored under the wrap */}
            {open && results.length > 0 && (
              <div className="topbar-search-results">
                {results.map((it, i) => {
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
                })}
              </div>
            )}

            {open && q.trim().length > 0 && results.length === 0 && (
              <div className="topbar-search-results">
                <div className="topbar-search-empty">No results for "<em>{q}</em>"</div>
              </div>
            )}
          </div>
        )}

        <button className="topbar-btn" title="Notifications"><Bell size={18} /></button>
        <button className="topbar-btn" onClick={() => navigate('/profile')} title="Profile">
          {avatarSrc
            ? <img src={avatarSrc} alt="Avatar" className="topbar-avatar topbar-avatar-img" />
            : <div className="topbar-avatar">A</div>
          }
        </button>
      </div>

      {/* Mobile float cluster */}
      {!isNativeApp && (
        <div className="topbar-float-cluster">
          <button className="topbar-float-btn" title="Notifications"><Bell size={18} /></button>
          <button className="topbar-float-btn topbar-float-btn--avatar"
                  onClick={() => navigate('/profile')} title="Profile">
            {avatarSrc
              ? <img src={avatarSrc} alt="Avatar" className="topbar-avatar topbar-avatar-img" />
              : <div className="topbar-avatar">A</div>
            }
          </button>
        </div>
      )}
    </header>
  );
}
