import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './TopBar.css';

export default function TopBar() {
  const navigate = useNavigate();
  const { avatarSrc } = useAuth();

  return (
    <header className="topbar glass">
      <div className="topbar-nav">
        <button className="topbar-btn" onClick={() => navigate(-1)} title="Back">
          <ChevronLeft size={20} />
        </button>
        <button className="topbar-btn" onClick={() => navigate(+1)} title="Forward">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="topbar-actions">
        <button className="topbar-btn topbar-search" onClick={() => navigate('/search')} title="Search">
          <Search size={18} />
        </button>
        <button className="topbar-btn" title="Notifications">
          <Bell size={18} />
        </button>
        <button className="topbar-btn" onClick={() => navigate('/profile')} title="Profile">
          {avatarSrc
            ? <img src={avatarSrc} alt="Avatar" className="topbar-avatar topbar-avatar-img" />
            : <div className="topbar-avatar">A</div>
          }
        </button>
      </div>
    </header>
  );
}
