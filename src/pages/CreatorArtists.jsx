import { useState, useEffect, useRef } from 'react';
import {
  MapPin, Mic2, FileText, Calendar, Plus, X, Save, CheckCircle2,
  Link2, Video, Image, Film, Quote, Package, Layout, Upload, GripVertical,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MOCK_ARTISTS } from '../data/artistsData';
import './CreatorArtists.css';

/* ─── TagList ─────────────────────────────────────────────── */
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
            {t}<button onClick={() => setTags(tags.filter(x => x !== t))}><X size={9}/></button>
          </span>
        ))}
      </div>
      <div className="ca-tag-input-row">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add discipline…"/>
        <button className="ca-icon-btn" onClick={add}><Plus size={12}/></button>
      </div>
    </div>
  );
}

/* ─── PerformanceRow ─────────────────────────────────────── */
function PerformanceRow({ perf, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ca-perf-item">
      <div className="ca-perf-main">
        <input
          className="ca-perf-input"
          value={perf.text}
          onChange={e => onChange({ ...perf, text: e.target.value })}
          placeholder="Venue, City — Month Year"
        />
        <button className="ca-icon-btn-sm" onClick={() => setExpanded(o => !o)} title="Add media">
          <Link2 size={12}/>
        </button>
        <button className="ca-icon-btn-sm danger" onClick={onRemove}><X size={10}/></button>
      </div>
      {expanded && (
        <div className="ca-perf-media">
          {[
            { key: 'link',  icon: <Link2  size={11}/>, label: 'Link',  placeholder: 'https://…' },
            { key: 'video', icon: <Video  size={11}/>, label: 'Video', placeholder: 'YouTube / Vimeo URL' },
            { key: 'gif',   icon: <Film   size={11}/>, label: 'GIF',   placeholder: 'GIF URL' },
            { key: 'photo', icon: <Image  size={11}/>, label: 'Photo', placeholder: 'Image URL or upload' },
          ].map(({ key, icon, label, placeholder }) => (
            <div key={key} className="ca-perf-media-row">
              <span className="ca-perf-media-label">{icon}{label}</span>
              <input
                value={perf[key] || ''}
                onChange={e => onChange({ ...perf, [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── DropZone ───────────────────────────────────────────── */
function DropZone({ items, setItems, label, accept = 'image/*,video/*' }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const addFiles = (files) => {
    const newItems = Array.from(files).map(f => ({
      id: Date.now() + Math.random(),
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video') ? 'video' : 'image',
    }));
    setItems(prev => [...prev, ...newItems]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="ca-dropzone-wrap">
      <div
        className={`ca-dropzone ${dragging ? 'dragging' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Upload size={18} strokeWidth={1.5}/>
        <span>{label}</span>
        <span className="ca-dropzone-hint">Click or drag & drop</span>
      </div>
      <input ref={inputRef} type="file" multiple accept={accept} style={{ display:'none' }}
        onChange={e => addFiles(e.target.files)}/>
      {items.length > 0 && (
        <div className="ca-media-grid">
          {items.map(item => (
            <div key={item.id} className="ca-media-thumb">
              {item.type === 'video'
                ? <video src={item.url} muted playsInline/>
                : <img src={item.url} alt={item.name}/>
              }
              <button className="ca-media-remove" onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}>
                <X size={10}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────── */
function Section({ icon, title, children }) {
  return (
    <div className="ca-section">
      <div className="ca-section-label">{icon}{title}</div>
      {children}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────── */
export default function CreatorArtists() {
  const location = useLocation();
  const [selected, setSelected] = useState(null);

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
        <ArtistDetail key={selected.id} artist={selected} />
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

/* ─── Full artist detail ─────────────────────────────────── */
function ArtistDetail({ artist }) {
  const [name,        setName]        = useState(artist.name);
  const [location,    setLocation]    = useState(artist.location);
  const [disciplines, setDisciplines] = useState([...artist.disciplines]);
  const [bio,         setBio]         = useState(artist.bio);
  const [statement,   setStatement]   = useState('');
  const [performances, setPerformances] = useState(
    artist.performances.map((text, i) => ({ id: i, text, link:'', video:'', gif:'', photo:'' }))
  );
  const [promoItems,  setPromoItems]  = useState([]);
  const [pageItems,   setPageItems]   = useState([]);
  const [saved,       setSaved]       = useState(false);

  const addPerf = () =>
    setPerformances(p => [...p, { id: Date.now(), text:'', link:'', video:'', gif:'', photo:'' }]);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div className="ca-artist-detail">

      {/* Hero */}
      <div className="ca-detail-hero">
        <div className="ca-detail-avatar" style={{
          background: `radial-gradient(circle at 40% 40%, ${artist.color}33, ${artist.color}11)`,
          borderColor: artist.color + '44',
        }}>
          <span style={{ color: artist.color }}>{artist.initials}</span>
        </div>
        <div>
          <input className="ca-detail-name-input" value={name} onChange={e => setName(e.target.value)}/>
          <div className="ca-detail-genre">{artist.genre}</div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="ca-detail-columns">

        {/* LEFT — media */}
        <div className="ca-col-media">
          <Section icon={<Package size={11}/>} title="Promo Material">
            <p className="ca-section-hint">Images, artworks, videos for press and bookings</p>
            <DropZone items={promoItems} setItems={setPromoItems} label="Drop promo files here"/>
          </Section>

          <Section icon={<Layout size={11}/>} title="Page Decoration">
            <p className="ca-section-hint">Images arranged freely on the artist's public page</p>
            <DropZone items={pageItems} setItems={setPageItems} label="Drop images or short videos" accept="image/*,video/*"/>
            {pageItems.length > 0 && (
              <div className="ca-page-deco-grid">
                {pageItems.map(item => (
                  <div key={item.id} className="ca-deco-item">
                    <div className="ca-deco-drag"><GripVertical size={12}/></div>
                    {item.type === 'video'
                      ? <video src={item.url} muted playsInline className="ca-deco-media"/>
                      : <img src={item.url} alt={item.name} className="ca-deco-media"/>
                    }
                    <button className="ca-media-remove" onClick={() => setPageItems(prev => prev.filter(x => x.id !== item.id))}>
                      <X size={10}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — data fields */}
        <div className="ca-col-data">
          <div className="ca-data-row-two">
            <Section icon={<MapPin size={11}/>} title="Location">
              <input className="ca-field-input" value={location}
                onChange={e => setLocation(e.target.value)} placeholder="City, Country"/>
            </Section>

            <Section icon={<Mic2 size={11}/>} title="Disciplines">
              <TagList tags={disciplines} setTags={setDisciplines}/>
            </Section>
          </div>

          <Section icon={<FileText size={11}/>} title="Artist Bio">
            <textarea className="ca-field-textarea" rows={4} value={bio}
              onChange={e => setBio(e.target.value)}/>
          </Section>

          <Section icon={<Quote size={11}/>} title="Statement">
            <textarea className="ca-field-textarea ca-field-statement" rows={3} value={statement}
              onChange={e => setStatement(e.target.value)}
              placeholder="A short statement or manifesto from the artist…"/>
          </Section>

          <Section icon={<Calendar size={11}/>} title="Performances">
            {performances.map(p => (
              <PerformanceRow
                key={p.id}
                perf={p}
                onChange={updated => setPerformances(prev => prev.map(x => x.id === p.id ? updated : x))}
                onRemove={() => setPerformances(prev => prev.filter(x => x.id !== p.id))}
              />
            ))}
            <button className="ca-add-row-btn" onClick={addPerf}><Plus size={12}/> Add performance</button>
          </Section>
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
