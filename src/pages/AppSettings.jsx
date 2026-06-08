import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Cpu, Eye, Globe, Zap, RefreshCw, Check, Paintbrush2, LayoutGrid, List, LogOut } from 'lucide-react';
import { useTheme, THEMES } from '../hooks/useTheme';
import { useDisplay } from '../contexts/DisplayContext';
import { useAuth } from '../contexts/AuthContext';
import './AppSettings.css';

const isNativeApp = navigator.userAgent.includes('KyoyuApp');

const LANGUAGES = ['English','Français','Deutsch','Italiano','Español','Português','Nederlands','Svenska','日本語'];
const QUALITIES  = [
  { id:'low',     label:'Low',     sub:'~96 kbps — saves data' },
  { id:'normal',  label:'Normal',  sub:'~160 kbps' },
  { id:'high',    label:'High',    sub:'~320 kbps' },
  { id:'lossless',label:'Lossless',sub:'FLAC / ALAC — best quality' },
];

const THEME_PREVIEWS = {
  dark:  { bg: '#060608', surface: 'rgba(255,255,255,0.05)' },
  grey:  { bg: '#16161e', surface: 'rgba(255,255,255,0.08)' },
  white: { bg: '#f0f0f5', surface: 'rgba(255,255,255,0.85)' },
};

const LAYOUT_OPTIONS = [
  { id: 'list', label: 'List' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '5', label: '5' },
];


function Toggle({ on, onChange }) {
  return (
    <button className={`appsettings-toggle${on?' on':''}`} onClick={()=>onChange(!on)}>
      <span className="appsettings-thumb" />
    </button>
  );
}

function LayoutPicker({ value, onChange }) {
  const current = value.mode === 'list' ? 'list' : String(value.cols);
  return (
    <div className="appsettings-layout-picker">
      {LAYOUT_OPTIONS.map(opt => (
        <button
          key={opt.id}
          className={`appsettings-layout-btn${current === opt.id ? ' active' : ''}`}
          onClick={() => onChange(
            opt.id === 'list'
              ? { mode: 'list', cols: 1 }
              : { mode: 'grid', cols: parseInt(opt.id) }
          )}
        >
          {opt.id === 'list' ? <List size={13} strokeWidth={2}/> : <span className="appsettings-layout-num">{opt.label}</span>}
        </button>
      ))}
    </div>
  );
}

export default function AppSettings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const { homeLayout, setHomeLayout, libraryLayout, setLibraryLayout } = useDisplay();
  const [notifications,  setNotifications]  = useState(true);
  const [dynamicIsland,  setDynamicIsland]  = useState(true);
  const [tracking,       setTracking]       = useState(false);
  const [language,       setLanguage]       = useState('English');
  const [quality,        setQuality]        = useState('high');
  const [langOpen,       setLangOpen]       = useState(false);
  const [checking,       setChecking]       = useState(false);
  const [upToDate,       setUpToDate]       = useState(false);
  const APP_VERSION = '1.0.4';


  function checkUpdate() {
    setChecking(true);
    setTimeout(() => { setChecking(false); setUpToDate(true); }, 1800);
  }

  return (
    <div className="page appsettings-page animate-in">

      <div className="appsettings-header">
        {!isNativeApp && <button className="appsettings-back glass" onClick={() => navigate('/profile')}>
          <ChevronLeft size={18} />
        </button>}
        <h1>Settings</h1>
      </div>

      {/* Appearance — Theme */}
      <div className="appsettings-section">
        <div className="appsettings-label">Appearance</div>
        <div className="appsettings-row glass" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Paintbrush2 size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="appsettings-row-title">Theme</span>
          </div>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {THEMES.map(({ id, label }) => {
              const p = THEME_PREVIEWS[id] || THEME_PREVIEWS.dark;
              const active = theme === id;
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  style={{
                    flex: 1, border: 'none', cursor: 'pointer', padding: '8px 0',
                    borderRadius: 10,
                    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                    outline: active ? '1.5px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all .15s',
                  }}
                >
                  <div style={{
                    width: 36, height: 24, borderRadius: 6,
                    background: p.bg, border: '1px solid rgba(255,255,255,0.12)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, height: 5, borderRadius: 2, background: p.surface }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: active ? '#fff' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {active && <Check size={9} strokeWidth={3} />}{label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Display Layout */}
      <div className="appsettings-section">
        <div className="appsettings-label">Display</div>
        <div className="appsettings-row glass" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LayoutGrid size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="appsettings-row-title">Layout</span>
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="appsettings-appearance-row">
              <span className="appsettings-appearance-row-label">Home</span>
              <LayoutPicker value={homeLayout} onChange={setHomeLayout} />
            </div>
            <div style={{ height: 0.5, background: 'rgba(255,255,255,0.07)' }} />
            <div className="appsettings-appearance-row">
              <span className="appsettings-appearance-row-label">Library</span>
              <LayoutPicker value={libraryLayout} onChange={setLibraryLayout} />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="appsettings-section">
        <div className="appsettings-label">Notifications</div>
        <div className="appsettings-row glass">
          <Bell size={16} className="appsettings-icon" />
          <div className="appsettings-row-body">
            <div className="appsettings-row-title">Allow Notifications</div>
            <div className="appsettings-row-sub">New releases, messages, events</div>
          </div>
          <Toggle on={notifications} onChange={setNotifications} />
        </div>
      </div>

      {/* Device */}
      <div className="appsettings-section">
        <div className="appsettings-label">Device</div>
        <div className="appsettings-row glass">
          <Cpu size={16} className="appsettings-icon" />
          <div className="appsettings-row-body">
            <div className="appsettings-row-title">Dynamic Island</div>
            <div className="appsettings-row-sub">Show player in Dynamic Island</div>
          </div>
          <Toggle on={dynamicIsland} onChange={setDynamicIsland} />
        </div>
      </div>

      {/* Privacy */}
      <div className="appsettings-section">
        <div className="appsettings-label">Privacy</div>
        <div className="appsettings-row glass">
          <Eye size={16} className="appsettings-icon" />
          <div className="appsettings-row-body">
            <div className="appsettings-row-title">Analytics Tracking</div>
            <div className="appsettings-row-sub">Help improve the app (anonymous)</div>
          </div>
          <Toggle on={tracking} onChange={setTracking} />
        </div>
      </div>

      {/* Language */}
      <div className="appsettings-section">
        <div className="appsettings-label">Language</div>
        <div className="appsettings-row glass appsettings-row-btn" onClick={()=>setLangOpen(o=>!o)}>
          <Globe size={16} className="appsettings-icon" />
          <div className="appsettings-row-body">
            <div className="appsettings-row-title">App Language</div>
            <div className="appsettings-row-sub">{language}</div>
          </div>
          <ChevronLeft size={15} className={`appsettings-chevron${langOpen?' open':''}`} />
        </div>
        {langOpen && (
          <div className="appsettings-picker glass">
            {LANGUAGES.map(l => (
              <button key={l} className={`appsettings-option${language===l?' active':''}`} onClick={()=>{setLanguage(l);setLangOpen(false);}}>
                <span>{l}</span>
                {language===l && <Check size={13} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Playback quality */}
      <div className="appsettings-section">
        <div className="appsettings-label">Playback</div>
        <div className="appsettings-quality-grid glass">
          {QUALITIES.map(q => (
            <button key={q.id} className={`appsettings-quality-btn${quality===q.id?' active':''}`} onClick={()=>setQuality(q.id)}>
              <Zap size={13} className="appsettings-quality-icon" />
              <span className="appsettings-quality-label">{q.label}</span>
              <span className="appsettings-quality-sub">{q.sub}</span>
              {quality===q.id && <Check size={12} className="appsettings-quality-check" />}
            </button>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="appsettings-section">
        <div className="appsettings-label">About</div>
        <div className="appsettings-row glass">
          <RefreshCw size={16} className={`appsettings-icon${checking?' spinning':''}`} />
          <div className="appsettings-row-body">
            <div className="appsettings-row-title">App Version</div>
            <div className="appsettings-row-sub">
              {upToDate ? '✓ Up to date' : checking ? 'Checking…' : `v${APP_VERSION}`}
            </div>
          </div>
          {!upToDate && (
            <button className="appsettings-check-btn" onClick={checkUpdate} disabled={checking}>
              {checking ? '…' : 'Check'}
            </button>
          )}
        </div>
      </div>

      {/* Sign Out */}
      <div className="appsettings-section">
        <button className="appsettings-signout glass" onClick={logout}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>

    </div>
  );
}
