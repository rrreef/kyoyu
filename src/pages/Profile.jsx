import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Camera, Music, Download, Upload, Disc3, Settings, ChevronRight, Heart, BarChart3, FileText, Bell, LogOut, Palette, ChevronLeft } from 'lucide-react';
import { userProfile, payoutData } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import './Profile.css';

export default function Profile() {
  const { user, role, logout, avatarSrc, setAvatarSrc } = useAuth();
  const navigate = useNavigate();
  const isNativeApp = navigator.userAgent.includes('KyoyuApp');
  const u = userProfile;
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const fileRef = useRef();

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatarSrc(ev.target.result);
    reader.readAsDataURL(file);
    setAvatarMenu(false);
  }

  const AvatarWidget = (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div className="profile-avatar-wrap" onClick={() => setAvatarMenu(m => !m)}>
        {avatarSrc
          ? <img src={avatarSrc} alt="Avatar" className="profile-avatar-img" />
          : <div className="profile-avatar"><User size={32} /></div>
        }
        <div className="profile-avatar-overlay"><Camera size={16} /></div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>
      {avatarMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setAvatarMenu(false)} />
          <div className="avatar-menu">
            <button className="avatar-menu-item" onClick={() => fileRef.current.click()}>
              {avatarSrc ? 'Replace' : 'Add photo'}
            </button>
            {avatarSrc && (
              <button className="avatar-menu-item avatar-menu-remove" onClick={() => { setAvatarSrc(null); setAvatarMenu(false); }}>
                Remove
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ── Creator profile ─────────────────────────────────────
  if (role === 'creator') {
    const contract = user?.contract || '70 / 30';
    return (
      <div className="page profile-page animate-in">
        {isNativeApp && (
          <button className="profile-back" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} strokeWidth={2} />
            Back
          </button>
        )}
        {/* Hero */}
        <div className="profile-hero glass">
          {AvatarWidget}
          <div className="profile-info">
            <h1>{user?.artistName || user?.name || 'Admin'}</h1>
            <div className="profile-plan-badge profile-contract-badge">
              <span>Contract</span>
              <span>·</span>
              <span>{contract}</span>
            </div>
            <div className="profile-member-since">Reef Creator Portal</div>
          </div>
        </div>

        {/* Menu */}
        <div className="profile-menu">
          {[
            { icon: BarChart3, label: 'Dashboard',        to: '/dashboard' },
            { icon: Music,     label: 'My Releases',       to: '/releases'  },
            { icon: FileText,  label: 'Upload New Release', to: '/upload'   },
            { icon: Bell,      label: 'Notifications',     to: '/profile'   },
            { icon: Settings,  label: 'Account Settings',  to: '/settings'  },
          ].map(({ icon: Icon, label, to }) => (
            <Link key={label} to={to} className="profile-menu-item glass">
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={16} className="profile-menu-arrow" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Listener profile ─────────────────────────────────────
  return (
    <div className="page profile-page animate-in">
      {isNativeApp && (
        <button className="profile-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={18} strokeWidth={2} />
          Back
        </button>
      )}
      {/* Hero — tap to reveal sign-out */}
      <div
        className="profile-hero glass"
        onClick={() => setShowSignOut(s => !s)}

        style={{ cursor: 'pointer' }}
      >
        {AvatarWidget}
        <div className="profile-info">
          <h1>{u.name}</h1>
          <div className="profile-plan-badge">
            <span>{u.plan} Plan</span>
          </div>
        </div>
        <div className="profile-hero-actions">
          {showSignOut ? (
            <button
              className="profile-dashboard-btn"
              style={{ border: '1px solid rgba(220,60,60,0.55)', color: 'rgba(220,60,60,0.85)', background: 'transparent', borderRadius: 'var(--radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}
              onClick={e => { e.stopPropagation(); logout(); }}
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          ) : (
            <Link to="/dashboard" className="profile-dashboard-btn glass-sm" onClick={e => e.stopPropagation()}>
              <BarChart3 size={16} />
              <span>Dashboard</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="profile-stats">
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalPlays.toLocaleString()}</div>
          <div className="profile-stat-label">Streams</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalDownloads}</div>
          <div className="profile-stat-label">Downloads</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalVinylOrders}</div>
          <div className="profile-stat-label">Vinyl Orders</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{payoutData.topArtists.length}</div>
          <div className="profile-stat-label">Artists Supported</div>
        </div>
      </div>

      {/* Payout this month */}
      <div className="profile-payout glass">
        <div className="profile-payout-title">This Month's Artist Support</div>
        <div className="profile-payout-amt">€{payoutData.artistPool.toFixed(2)} went to {payoutData.topArtists.length} artists</div>
        <Link to="/subscription" className="profile-payout-link">
          See full breakdown →
        </Link>
      </div>

      {/* Menu */}
      <div className="profile-menu">
        {[
          { icon: User,     label: 'Account',              to: '/account'      },
          { icon: Upload,   label: 'Uploads',               to: '/uploads'      },
          { icon: Download, label: 'Downloads',             to: '/downloads'    },
          { icon: Disc3,    label: 'Merch Orders',          to: '/orders'       },
          { icon: BarChart3,label: 'Manage Subscription',   to: '/subscription' },
          { icon: Palette,  label: 'Appearance',            to: '/settings'     },
          { icon: Settings, label: 'Settings',              to: '/app-settings' },
        ].map(({ icon: Icon, label, to }) => (
          <Link key={label} to={to} className="profile-menu-item glass">
            <Icon size={18} />
            <span>{label}</span>
            <ChevronRight size={16} className="profile-menu-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
