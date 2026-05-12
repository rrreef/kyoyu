import { useState, useEffect } from 'react';
import { MapPin, Mic2, FileText, Calendar, Plus, X, Save, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MOCK_ARTISTS } from '../data/artistsData';
import './CreatorArtists.css';

/* ─── EditableTag component ────────────────────────────────── */
function TagList({ tags, setTags }) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setInput('');
  };
  return (
    <div className="ca-tag-group">
      <div className="ca-tags">
        {tags.map(t => (
          <span key={t} className="ca-tag">
            {t}
            <button onClick={() => setTags(tags.filter(x => x !== t))}><X size={9}/></button>
          </span>
        ))}
      </div>
      <div className="ca-tag-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add discipline…"
        />
        <button className="ca-tag-add" onClick={add}><Plus size={12}/></button>
      </div>
    </div>
  );
}

/* ─── DetailPanel ─────────────────────────────────────────── */
function DetailPanel({ artist, onClose }) {
  const [name,         setName]         = useState(artist.name);
  const [location,     setLocation]     = useState(artist.location);
  const [disciplines,  setDisciplines]  = useState([...artist.disciplines]);
  const [bio,          setBio]          = useState(artist.bio);
  const [performances, setPerformances] = useState([...artist.performances]);
  const [newPerf,      setNewPerf]      = useState('');
  const [saved,        setSaved]        = useState(false);

  const addPerf = () => {
    if (!newPerf.trim()) return;
    setPerformances(p => [...p, newPerf.trim()]);
    setNewPerf('');
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="ca-detail-panel glass">
      <button className="ca-panel-close" onClick={onClose}><X size={14}/></button>

      {/* Avatar + name */}
      <div className="ca-panel-header">
        <div className="ca-panel-avatar" style={{ background: `linear-gradient(135deg, ${artist.color}55, ${artist.color}22)`, borderColor: artist.color + '55' }}>
          <span style={{ color: artist.color }}>{artist.initials}</span>
        </div>
        <div className="ca-panel-title-area">
          <input
            className="ca-panel-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="ca-panel-genre">{artist.genre}</div>
        </div>
      </div>

      {/* Location */}
      <div className="ca-panel-field">
        <label><MapPin size={12}/> Location</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" />
      </div>

      {/* Disciplines */}
      <div className="ca-panel-field">
        <label><Mic2 size={12}/> Disciplines</label>
        <TagList tags={disciplines} setTags={setDisciplines} />
      </div>

      {/* Bio */}
      <div className="ca-panel-field">
        <label><FileText size={12}/> Artist Bio</label>
        <textarea rows={4} value={bio} onChange={e => setBio(e.target.value)} />
      </div>

      {/* Performances */}
      <div className="ca-panel-field">
        <label><Calendar size={12}/> Performances</label>
        <div className="ca-perf-list">
          {performances.map((p, i) => (
            <div key={i} className="ca-perf-row">
              <span>{p}</span>
              <button onClick={() => setPerformances(prev => prev.filter((_,j) => j !== i))}><X size={10}/></button>
            </div>
          ))}
        </div>
        <div className="ca-tag-input-row" style={{ marginTop: 6 }}>
          <input
            value={newPerf}
            onChange={e => setNewPerf(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPerf()}
            placeholder="Add performance (e.g. Venue, City — Month Year)"
          />
          <button className="ca-tag-add" onClick={addPerf}><Plus size={12}/></button>
        </div>
      </div>

      {/* Save */}
      <div className="ca-panel-actions">
        {saved && (
          <span className="ca-saved-toast"><CheckCircle2 size={13}/> Saved</span>
        )}
        <button className="ca-save-btn" onClick={handleSave}>
          <Save size={13}/> Save Changes
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function CreatorArtists() {
  const location = useLocation();
  const [selected, setSelected] = useState(null);

  // Auto-open artist from sidebar link (?id=N)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id) {
      const found = MOCK_ARTISTS.find(a => String(a.id) === id);
      setSelected(found || null);
    }
  }, [location.search]);

  const handleSelect = (a) => {
    setSelected(prev => prev?.id === a.id ? null : a);
  };

  return (
    <div className="page creator-artists-page animate-in">
      <div className="ca-header">
        <div>
          <h1>Artists</h1>
          <p className="ca-header-sub">Manage artists releasing on your label</p>
        </div>
        <button className="ca-add-btn"><Plus size={14}/> Add Artist</button>
      </div>

      <div className={`ca-layout ${selected ? 'ca-layout--split' : ''}`}>
        {/* Artist grid */}
        <div className="ca-grid">
          {MOCK_ARTISTS.map(a => {
            const isSelected = selected?.id === a.id;
            const isDimmed   = selected && !isSelected;
            return (
              <div
                key={a.id}
                className={`ca-card ${isSelected ? 'ca-card--selected' : ''} ${isDimmed ? 'ca-card--dimmed' : ''}`}
                onClick={() => handleSelect(a)}
              >
                <div
                  className="ca-card-avatar"
                  style={{
                    background: `radial-gradient(circle at 40% 40%, ${a.color}33, ${a.color}11)`,
                    border: `1.5px solid ${a.color}44`,
                  }}
                >
                  <span style={{ color: a.color }}>{a.initials}</span>
                  {isSelected && <div className="ca-card-selected-ring" style={{ borderColor: a.color }}/>}
                </div>
                <div className="ca-card-name">{a.name}</div>
                <div className="ca-card-genre">{a.genre}</div>
                <div className="ca-card-loc"><MapPin size={9}/> {a.location}</div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel artist={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
