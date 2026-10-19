import { Paintbrush2, LayoutGrid, List } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import AppearanceCustomizer from '../components/ui/AppearanceCustomizer';
import { useDisplay } from '../contexts/DisplayContext';
import './Settings.css';
import './AppSettings.css';

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
  useTheme();
  const { homeLayout, setHomeLayout, libraryLayout, setLibraryLayout } = useDisplay();

  return (
    <div className="page animate-in">
      <div className="settings-page" style={{ gap: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <div className="s-panel">
            <div className="s-panel-header">
              <h2>Settings</h2>
              <p>Customize your Reef experience</p>
            </div>

            {/* Theme & Glass Lens UI Tint */}
            <div className="s-card glass">
              <div className="s-section-heading">
                <Paintbrush2 size={13} style={{ opacity: 0.6 }} /> Appearance
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 16 }}>
                Choose your preferred interface theme and glass lens UI tint
              </p>
              <AppearanceCustomizer />
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

          </div>
        </div>
      </div>
    </div>
  );
}
