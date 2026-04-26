import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Cpu, Eye, Globe, Zap, RefreshCw, Check } from 'lucide-react';
import './AppSettings.css';

const LANGUAGES = ['English','Français','Deutsch','Italiano','Español','Português','Nederlands','Svenska','日本語'];
const QUALITIES  = [
  { id:'low',    label:'Low',    sub:'~96 kbps — saves data' },
  { id:'normal', label:'Normal', sub:'~160 kbps' },
  { id:'high',   label:'High',   sub:'~320 kbps' },
  { id:'lossless',label:'Lossless',sub:'FLAC / ALAC — best quality' },
];

function Toggle({ on, onChange }) {
  return (
    <button className={`appsettings-toggle${on?' on':''}`} onClick={()=>onChange(!on)}>
      <span className="appsettings-thumb" />
    </button>
  );
}

export default function AppSettings() {
  const navigate = useNavigate();
  const [notifications,    setNotifications]    = useState(true);
  const [dynamicIsland,    setDynamicIsland]    = useState(true);
  const [tracking,         setTracking]         = useState(false);
  const [language,         setLanguage]         = useState('English');
  const [quality,          setQuality]          = useState('high');
  const [langOpen,         setLangOpen]         = useState(false);
  const [checking,         setChecking]         = useState(false);
  const [upToDate,         setUpToDate]         = useState(false);
  const APP_VERSION = '1.0.4';

  function checkUpdate() {
    setChecking(true);
    setTimeout(() => { setChecking(false); setUpToDate(true); }, 1800);
  }

  return (
    <div className="page appsettings-page animate-in">

      <div className="appsettings-header">
        <button className="appsettings-back glass" onClick={() => navigate('/profile')}>
          <ChevronLeft size={18} />
        </button>
        <h1>Settings</h1>
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

      {/* App version */}
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

    </div>
  );
}
