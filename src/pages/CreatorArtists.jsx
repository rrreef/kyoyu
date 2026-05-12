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

  // Sync selected artist from URL ?id=N
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id) {
      const found = MOCK_ARTISTS.find(a => String(a.id) === id);
      setSelected(found || null);
    } else {
      setSelected(null);
    }
  }, [location.search]);

  return (
    <div className="page creator-artists-page animate-in">
      <div className="ca-header">
        <div>
          <h1>{selected ? selected.name : 'Artists'}</h1>
          <p className="ca-header-sub">
            {selected ? selected.genre : 'Select an artist from the sidebar'}
          </p>
        </div>
        <button className="ca-add-btn"><Plus size={14}/> Add Artist</button>
      </div>

      {selected ? (
        <ArtistDetail artist={selected} />
      ) : (
        <div className="ca-empty-state">
          <div className="ca-empty-icon">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="12" r="5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
              <path d="M6 26c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="ca-empty-text">Select an artist from the left menu</p>
        </div>
      )}
    </div>
  );
}

/* ─── Full-width artist detail ───────────────────────────────── */
function ArtistDetail({ artist }) {
  const [name,         setName]         = useState(artist.name);
  const [location,     setLocation]     = useState(artist.location);
  const [disciplines,  setDisciplines]  = useState([...artist.disciplines]);
  const [bio,          setBio]          = useState(artist.bio);
  const [performances, setPerformances] = useState([...artist.performances]);
  const [newPerf,      setNewPerf]      = useState('');
  const [saved,        setSaved]        = useState(false);

  // Reset form when artist changes
  useEffect(() => {
    setName(artist.name);
    setLocation(artist.location);
    setDisciplines([...artist.disciplines]);
    setBio(artist.bio);
    setPerformances([...artist.performances]);
    setSaved(false);
  }, [artist.id]);

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
    <div className="ca-artist-detail">
      {/* Hero header */}
      <div className="ca-detail-hero" style={{ borderColor: artist.color + '33' }}>
        <div
          className="ca-detail-avatar"
          style={{
            background: `radial-gradient(circle at 40% 40%, ${artist.color}44, ${artist.color}11)`,
            borderColor: artist.color + '55',
          }}
        >
          <span style={{ color: artist.color }}>{artist.initials}</span>
        </div>
        <div>
          <input
            className="ca-detail-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="ca-detail-genre">{artist.genre}</div>
        </div>
      </div>

      {/* Fields grid */}
      <div className="ca-detail-grid">
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

        {/* Bio — full width */}
        <div className="ca-panel-field ca-field-full">
          <label><FileText size={12}/> Artist Bio</label>
          <textarea rows={5} value={bio} onChange={e => setBio(e.target.value)} />
        </div>

        {/* Performances — full width */}
        <div className="ca-panel-field ca-field-full">
          <label><Calendar size={12}/> Performances</label>
          <div className="ca-perf-list">
            {performances.map((p, i) => (
              <div key={i} className="ca-perf-row">
                <span>{p}</span>
                <button onClick={() => setPerformances(prev => prev.filter((_,j) => j !== i))}><X size={10}/></button>
              </div>
            ))}
          </div>
          <div className="ca-tag-input-row" style={{ marginTop: 8 }}>
            <input
              value={newPerf}
              onChange={e => setNewPerf(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPerf()}
              placeholder="Add performance (e.g. Venue, City — Month Year)"
            />
            <button className="ca-tag-add" onClick={addPerf}><Plus size={12}/></button>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="ca-panel-actions">
        {saved && <span className="ca-saved-toast"><CheckCircle2 size={13}/> Saved</span>}
        <button className="ca-save-btn" onClick={handleSave}><Save size={13}/> Save Changes</button>
      </div>
    </div>
  );
}
