import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, LayoutDashboard, Upload, Music, Users, Palette, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './TopBar.css';

const isNativeApp = navigator.userAgent.includes('KyoyuApp');

// ── Searchable creator portal items ──────────────────────────
const ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',       icon: LayoutDashboard, hint: 'Overview · Stats · Payouts' },
  { label: 'Upload Release',  path: '/upload',          icon: Upload,          hint: 'Upload tracks & artwork'    },
  { label: 'Releases',        path: '/releases',        icon: Music,           hint: 'Manage your catalog'        },
  { label: 'Artists',         path: '/artists',         icon: Users,           hint: 'Artist profiles'            },
  { label: 'Visual Identity', path: '/visual-identity', icon: Palette,         hint: 'Branding & theme'           },
  { label: 'Settings',        path: '/settings',        icon: Settings,        hint: 'Account · Billing · Privacy'},
  { label: 'Account',         path: '/settings',        icon: Settings,        hint: 'Profile & security'         },
  { label: 'Payout',          path: '/dashboard',       icon: LayoutDashboard, hint: 'Revenue breakdown'          },
  { label: 'Contract',        path: '/dashboard',       icon: LayoutDashboard, hint: 'Terms & contract status'    },
  { label: 'Notifications',   path: '/dashboard',       icon: LayoutDashboard, hint: 'Send to followers'          },
];

// ── Search bubble component ───────────────────────────────────
function SearchBubble({ onClose }) {
  const navigate   = useNavigate();
  const [q, setQ]  = useState('');
  const inputRef   = useRef(null);
  const wrapRef    = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handle(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const results = q.trim()
    ? ITEMS.filter(it =>
        it.label.toLowerCase().includes(q.toLowerCase()) ||
        it.hint.toLowerCase().includes(q.toLowerCase())
      )
    : [];

  function select(path) { navigate(path); onClose(); }

  return (
    <div className="topbar-search-wrap" ref={wrapRef}>
      {/* Input pill */}
      <div className="topbar-search-bubble glass">
        <svg className="topbar-search-bubble-icon" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          className="topbar-search-input"
          placeholder="Search pages, releases, artists…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        {q && (
          <button className="topbar-search-clear" onClick={() => setQ('')} title="Clear">
            <X size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {q.trim().length > 0 && (
        <div className="topbar-search-results glass">
          {results.length > 0 ? results.map((it, i) => {
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
          }) : (
            <div className="topbar-search-empty">No results for "<em>{q}</em>"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────
export default function TopBar({ showSearch = true }) {
  const navigate          = useNavigate();
  const { avatarSrc }     = useAuth();
  const [searching, setSearching] = useState(false);

  return (
    <header className="topbar glass">
      <div className="topbar-nav" />

      {/* Desktop actions */}
      <div className="topbar-actions topbar-actions--desktop">

        {/* Search: inline bubble replaces the button when open */}
        {searching
          ? <SearchBubble onClose={() => setSearching(false)} />
          : showSearch && (
            <button
              className="topbar-btn topbar-search"
              onClick={() => setSearching(true)}
              title="Search"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          )
        }

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
          <button className="topbar-float-btn" title="Notifications">
            <Bell size={18} />
          </button>
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
