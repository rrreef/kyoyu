import { useState } from 'react';
import { MapPin, Mic2, FileText, Calendar, Plus, X, Save, CheckCircle2 } from 'lucide-react';
import './CreatorArtists.css';

/* ─── Mock roster ──────────────────────────────────────────── */
const MOCK_ARTISTS = [
  { id:1, name:'Valeria Moor',    genre:'Techno / Industrial', location:'Berlin, DE',   initials:'VM', color:'#9b6dff',
    disciplines:['DJ','Producer','Vocalist'],
    bio:'Valeria Moor crafts relentless techno landscapes where rhythm meets narratives of solitude and urban decay.',
    performances:['Berghain, Berlin — Apr 2026','Tresor, Berlin — Feb 2026','Fabric, London — Dec 2025'] },
  { id:2, name:'Oskar Lund',      genre:'Ambient / Drone',    location:'Stockholm, SE', initials:'OL', color:'#29b6f6',
    disciplines:['Composer','Sound Designer'],
    bio:'Oskar Lund sculpts immersive soundscapes that blur the boundary between acoustic and electronic worlds.',
    performances:['Moderna Museet, Stockholm — Mar 2026','Atonal Festival — Aug 2025'] },
  { id:3, name:'Léa Fontaine',    genre:'Deep House',         location:'Paris, FR',     initials:'LF', color:'#ce93d8',
    disciplines:['DJ','Producer'],
    bio:'Léa Fontaine is a Paris-based selector and producer known for her late-night deep house sets.',
    performances:['Rex Club, Paris — Apr 2026','Concrete, Paris — Jan 2026'] },
  { id:4, name:'Mir Hashemi',     genre:'Experimental',       location:'Tehran / Amsterdam', initials:'MH', color:'#50c878',
    disciplines:['Composer','Performer','Visual Artist'],
    bio:'Mir bridges Persian classical structures with modular synthesis in a genre-defying live act.',
    performances:['Unsound, Kraków — Oct 2025','CTM Festival — Feb 2025'] },
  { id:5, name:'Dela Cruz',       genre:'Electronic / Breakbeat', location:'Manila, PH', initials:'DC', color:'#ff6b1a',
    disciplines:['Producer','DJ'],
    bio:'Dela Cruz brings the rhythmic density of Filipino percussion into contemporary electronic music.',
    performances:['Moni Club, Manila — Mar 2026'] },
  { id:6, name:'Hanna Strøm',     genre:'Nordic Folk / Electronic', location:'Oslo, NO',  initials:'HS', color:'#f43f5e',
    disciplines:['Singer-Songwriter','Multi-Instrumentalist'],
    bio:'Hanna weaves Norse mythology into fragile electronic folk that resonates across cultural boundaries.',
    performances:['Øya Festival — Aug 2025','Rockefeller, Oslo — Apr 2026'] },
];

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
  const [selected, setSelected] = useState(null);

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
