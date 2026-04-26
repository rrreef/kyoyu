import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './TopBar.css';

const isNativeApp = navigator.userAgent.includes('KyoyuApp');

export default function TopBar() {
  const navigate = useNavigate();
  const { avatarSrc } = useAuth();

  return (
    <header className="topbar glass">

      {/* Desktop-only nav controls */}
      <div className="topbar-nav" />

      {/* Desktop actions */}
      <div className="topbar-actions topbar-actions--desktop">
        <button className="topbar-btn topbar-search" onClick={() => navigate('/search')} title="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button className="topbar-btn" title="Notifications"><Bell size={18} /></button>
        <button className="topbar-btn" onClick={() => navigate('/profile')} title="Profile">
          {avatarSrc
            ? <img src={avatarSrc} alt="Avatar" className="topbar-avatar topbar-avatar-img" />
            : <div className="topbar-avatar">A</div>
          }
        </button>
      </div>

      {/* Mobile web float cluster — hidden in native iOS app (handled natively there) */}
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
