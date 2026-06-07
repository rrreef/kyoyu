import { useState } from 'react';
import { Check, Paintbrush2, LayoutGrid, List } from 'lucide-react';
import { useTheme, THEMES } from '../hooks/useTheme';
import { useDisplay } from '../contexts/DisplayContext';
import './Settings.css';
import './AppSettings.css';

const isNativeApp = navigator.userAgent.includes('KyoyuApp');


const THEME_PREVIEWS = {
  dark:  { bg: '#060608', surface: 'rgba(255,255,255,0.05)' },
  grey:  { bg: '#16161e', surface: 'rgba(255,255,255,0.08)' },
  white: { bg: '#f0f0f5', surface: 'rgba(255,255,255,0.85)' },
};

const LAYOUT_OPTIONS = [
  { id: 'list', label: 'List' },
  { id: '1',    label: '1'    },
  { id: '2',    label: '2'    },
  { id: '3',    label: '3'    },
  { id: '4',    label: '4'    },
  { id: '5',    label: '5'    },
];

function LayoutPicker({ value, onChange }) {
  const current = value.mode === 'list' ? 'list' : String(value.cols);
  return (
    <div className="s-layout-picker">
      {LAYOUT_OPTIONS.map(opt => (
        <button
          key={opt.id}
          className={`s-layout-btn${current === opt.id ? ' active' : ''}`}
          onClick={() => onChange(
            opt.id === 'list'
              ? { mode: 'list', cols: 1 }
              : { mode: 'grid', cols: parseInt(opt.id) }
          )}
        >
          {opt.id === 'list' ? <List size={13} strokeWidth={2}/> : opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ListenerSettings() {
  const [theme, setTheme] = useTheme();
  const { homeLayout, setHomeLayout, libraryLayout, setLibraryLayout } = useDisplay();
  const [activeIcon, setActiveIcon] = useState('default');

  const ICONS = [
    { id: 'default', label: 'Default', thumb: '/icon-default-thumb.png', nativeName: 'default' },
    { id: 'alt',     label: 'Minimal', thumb: '/icon-alt-thumb.png',     nativeName: 'AppIconAlt' },
  ];

  function changeIcon(icon) {
    if (icon.id === activeIcon) return;
    if (window.webkit?.messageHandlers?.changeAppIcon) {
      window.webkit.messageHandlers.changeAppIcon.postMessage(icon.nativeName);
      setActiveIcon(icon.id);
    }
  }

  return (
    <div className="page animate-in">
      <div className="settings-page" style={{ gap: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <div className="s-panel">
            <div className="s-panel-header">
              <h2>Settings</h2>
              <p>Customize your Reef experience</p>
            </div>

            {/* Theme */}
            <div className="s-card glass">
              <div className="s-section-heading">
                <Paintbrush2 size={13} style={{ opacity: 0.6 }} /> Appearance
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 16 }}>
                Choose your preferred interface theme
              </p>
              <div className="s-theme-grid">
                {THEMES.map(({ id, label }) => {
                  const p = THEME_PREVIEWS[id];
                  const active = theme === id;
                  return (
                    <button
                      key={id}
                      className={`s-theme-card ${active ? 'active' : ''}`}
                      onClick={() => setTheme(id)}
                      style={{ '--th-bg': p.bg, '--th-surface': p.surface }}
                    >
                      <div className="s-theme-preview">
                        <div className="s-theme-preview-bar" />
                        <div className="s-theme-preview-card" />
                        <div className="s-theme-preview-card s-theme-preview-card--2" />
                      </div>
                      <div className="s-theme-label">
                        {active && <Check size={11} strokeWidth={3} />}
                        {label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Display layout */}
            <div className="s-card glass" style={{ marginTop: 16 }}>
              <div className="s-section-heading">
                <LayoutGrid size={13} style={{ opacity: 0.6 }} /> Display Layout
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 18 }}>
                Choose how titles and artwork appear in Home and Library
              </p>

              <div className="s-layout-row">
                <div className="s-layout-row-label">Home</div>
                <LayoutPicker value={homeLayout} onChange={setHomeLayout}/>
              </div>

              <div className="s-layout-divider"/>

              <div className="s-layout-row">
                <div className="s-layout-row-label">Library</div>
                <LayoutPicker value={libraryLayout} onChange={setLibraryLayout}/>
              </div>

              <div className="s-layout-hint">
                <span><List size={10}/> List — artwork + title + artist per row</span>
                <span><LayoutGrid size={10}/> 1–5 — grid columns of artwork tiles</span>
              </div>
            </div>

            {/* App Icon — iOS native only */}
            {isNativeApp && (
              <div className="s-card glass" style={{ marginTop: 16 }}>
                <div className="s-section-heading">
                  App Icon
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 16 }}>
                  Choose your home screen icon
                </p>
                <div className="appsettings-icon-grid" style={{ padding: 0 }}>
                  {ICONS.map(icon => (
                    <button
                      key={icon.id}
                      className={`appsettings-icon-option${activeIcon === icon.id ? ' active' : ''}`}
                      onClick={() => changeIcon(icon)}
                    >
                      <img src={icon.thumb} alt={icon.label} className="appsettings-icon-thumb" />
                      <span className="appsettings-icon-label">{icon.label}</span>
                      {activeIcon === icon.id && <Check size={12} className="appsettings-icon-check" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
