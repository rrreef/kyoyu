import { Check, Paintbrush2 } from 'lucide-react';
import { useTheme, THEMES } from '../hooks/useTheme';
import './Settings.css';

const THEME_PREVIEWS = {
  dark:  { bg: '#060608', surface: 'rgba(255,255,255,0.05)' },
  grey:  { bg: '#16161e', surface: 'rgba(255,255,255,0.08)' },
  white: { bg: '#f0f0f5', surface: 'rgba(255,255,255,0.85)' },
};

export default function ListenerSettings() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="page animate-in">
      <div className="settings-page" style={{ gap: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <div className="s-panel">
            <div className="s-panel-header">
              <h2>Settings</h2>
              <p>Customize your Reef experience</p>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
}
