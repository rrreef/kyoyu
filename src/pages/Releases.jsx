import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Download, MessageSquare, Star, X, Eye, EyeOff, Upload,
         Loader, RefreshCw, Filter, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchMyTracks } from '../lib/uploadPipeline';
import { supabase } from '../lib/supabase';
import EmptyReleases from '../components/EmptyReleases';
import './Releases.css';

/* ─── Genre → gradient palette ─────────────────────────── */
const GENRE_PALETTES = [
  { keys: ['techno','electronic','electro'],  gradient: 'linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)', accent: '#7c6fcd' },
  { keys: ['ambient','drone','experimental'], gradient: 'linear-gradient(135deg,#000428 0%,#004e92 100%)',              accent: '#29b6f6' },
  { keys: ['industrial','ebm','dark'],        gradient: 'linear-gradient(135deg,#0d0d0d 0%,#2d1515 100%)',              accent: '#ef5350' },
  { keys: ['house','deep','disco'],           gradient: 'linear-gradient(135deg,#1a001e 0%,#4a0080 100%)',              accent: '#ce93d8' },
  { keys: ['jazz','soul','r&b'],              gradient: 'linear-gradient(135deg,#1a0a00 0%,#5c3c00 100%)',              accent: '#ffb300' },
  { keys: ['classical','orchestral'],         gradient: 'linear-gradient(135deg,#0a0a0f 0%,#1c1c2e 100%)',              accent: '#b0bec5' },
];
const DEFAULT_PALETTE  = { gradient: 'linear-gradient(135deg,#0a0a12 0%,#1c0a2e 55%,#0d0519 100%)', accent: '#9b6dff' };

function paletteFor(genre) {
  const g = (genre || '').toLowerCase();
  return GENRE_PALETTES.find(p => p.keys.some(k => g.includes(k))) || DEFAULT_PALETTE;
}

/** Maps a raw Supabase track row → UI-ready shape */
function adaptTrack(t) {
  const { gradient, accent } = paletteFor(t.genre);
  return {
    id:           t.id,
    title:        t.title,
    artist:       t.artist || '—',
    albumName:    t.album  || t.title,
    year:         t.year,
    format:       t.format || 'Digital',
    visibility:   t.visibility,
    status:       t.status,
    genre:        t.genre,
    tags:         Array.isArray(t.tags) ? t.tags : (t.genre ? [t.genre] : []),
    duration:     t.duration || '—',
    uploadDate:   t.created_at?.slice(0, 10),
    artworkUrl:   t.artworkUrl || null,   // signed URL from fetchMyTracks()
    gradient,
    accentColor:  accent,
    // stats (0 until track_stats wired)
    streams:      0,
    downloads:    0,
    comments:     0,
    feedback:     0,
    feedbackCount:0,
    revenue:      0,
    _raw:         t,
  };
}

/** Returns a CSS background style — image if artwork exists, gradient fallback */
function artBg(rel) {
  if (rel?.artworkUrl) {
    return {
      backgroundImage: `url(${rel.artworkUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { background: rel.gradient };
}

/* ─── Component ──────────────────────────────────────────── */
export default function Releases() {
  const [releases,  setReleases]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [toggling,  setToggling]  = useState(false);
  const navigate = useNavigate();

  /* ── Filter state ── */
  const [fArtist, setFArtist] = useState('All');
  const [fDate,   setFDate]   = useState('All');
  const [fCollab, setFCollab] = useState('All');
  const [fStatus, setFStatus] = useState('All');

  /* Unique artist names for filter pill dropdown */
  const artistOptions = useMemo(() => {
    const names = [...new Set(releases.map(r => r.artist).filter(Boolean))];
    return ['All', ...names];
  }, [releases]);

  /* Derived filtered + sorted releases */
  const filteredReleases = useMemo(() => {
    const now = new Date();
    let list = [...releases];
    // Artist
    if (fArtist !== 'All') list = list.filter(r => r.artist === fArtist);
    // Collab
    if (fCollab === 'Solo')  list = list.filter(r => !/[&,]|feat\.|vs\./i.test(r.artist));
    if (fCollab === 'Collab') list = list.filter(r => /[&,]|feat\.|vs\./i.test(r.artist));
    // Status
    if (fStatus === 'Published') list = list.filter(r => r.visibility === 'public');
    if (fStatus === 'Private')   list = list.filter(r => r.visibility === 'private');
    if (fStatus === 'Pending')   list = list.filter(r => r.status === 'pending');
    // Date
    if (fDate === 'This Year')  list = list.filter(r => r.uploadDate?.startsWith(String(now.getFullYear())));
    if (fDate === 'This Month') {
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      list = list.filter(r => r.uploadDate?.startsWith(ym));
    }
    if (fDate === 'Newest') list.sort((a,b) => (b.uploadDate||'') > (a.uploadDate||'') ? 1 : -1);
    if (fDate === 'Oldest') list.sort((a,b) => (a.uploadDate||'') > (b.uploadDate||'') ? 1 : -1);
    return list;
  }, [releases, fArtist, fDate, fCollab, fStatus]);

  const anyFilterActive = fArtist!=='All' || fDate!=='All' || fCollab!=='All' || fStatus!=='All';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tracks = await fetchMyTracks();
      setReleases(tracks.map(adaptTrack));
    } catch (e) {
      setError(e.message || 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Preload mascot so it's cached before EmptyReleases mounts */
  useEffect(() => {
    const img = new window.Image();
    img.src = '/empty-releases.png';
  }, []);

  const select = (rel) => setSelected(prev => prev?.id === rel.id ? null : rel);

  /* Toggle visibility in DB and update local state */
  async function toggleVisibility() {
    if (!selected || toggling) return;
    const next = selected.visibility === 'public' ? 'private' : 'public';
    setToggling(true);
    const { error: dbErr } = await supabase
      .from('tracks')
      .update({ visibility: next })
      .eq('id', selected.id);
    if (!dbErr) {
      const updated = { ...selected, visibility: next };
      setSelected(updated);
      setReleases(prev => prev.map(r => r.id === selected.id ? updated : r));
    }
    setToggling(false);
  }

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page releases-page animate-in">
        <div className="rel-page-header">
          <div><h1>Releases</h1></div>
        </div>
        <div className="rel-loading-spinner">
          <Loader size={22} className="rel-spinner-icon" />
        </div>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────── */
  if (error) {
    return (
      <div className="page releases-page animate-in">
        <div className="rel-page-header">
          <div><h1>Releases</h1></div>
        </div>
        <div className="rel-empty">
          <p className="rel-empty-error">{error}</p>
          <button className="rel-upload-btn" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page releases-page animate-in">

      {/* Header */}
      <div className="rel-page-header">
        <div>
          <h1>Releases</h1>
          <p className="rel-page-sub">
            {releases.length} release{releases.length !== 1 ? 's' : ''} in your catalog
            {releases.length > 0 && <>&nbsp;·&nbsp; click a release to see insights</>}
          </p>
        </div>
        <button className="rel-upload-btn" onClick={() => navigate('/upload')}>
          <Upload size={13} /> Upload New
        </button>
      </div>
      {/* ── Filter bar ── */}
      {releases.length > 0 && (
        <div className="rel-filter-bar">
          <div className="rel-filter-group">
            <span className="rel-filter-label">Artist</span>
            <div className="rel-filter-pills">
              {artistOptions.slice(0, 6).map(a => (
                <button key={a} className={`rel-filter-pill ${fArtist===a?'active':''}`} onClick={()=>setFArtist(a)}>{a}</button>
              ))}
            </div>
          </div>
          <div className="rel-filter-group">
            <span className="rel-filter-label">Date</span>
            <div className="rel-filter-pills">
              {['All','Newest','Oldest','This Year','This Month'].map(d => (
                <button key={d} className={`rel-filter-pill ${fDate===d?'active':''}`} onClick={()=>setFDate(d)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="rel-filter-group">
            <span className="rel-filter-label">Collaborations</span>
            <div className="rel-filter-pills">
              {['All','Solo','Collab'].map(c => (
                <button key={c} className={`rel-filter-pill ${fCollab===c?'active':''}`} onClick={()=>setFCollab(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="rel-filter-group">
            <span className="rel-filter-label">Status</span>
            <div className="rel-filter-pills">
              {['All','Published','Private','Pending'].map(s => (
                <button key={s} className={`rel-filter-pill ${fStatus===s?'active':''}`} onClick={()=>setFStatus(s)}>{s}</button>
              ))}
            </div>
          </div>
          {anyFilterActive && (
            <button className="rel-filter-clear" onClick={()=>{setFArtist('All');setFDate('All');setFCollab('All');setFStatus('All');}}>Clear filters</button>
          )}
        </div>
      )}

      {/* Empty catalog */}
      {releases.length === 0 && (
        <EmptyReleases variant="creator" />
      )}

      {/* Release grid */}
      {filteredReleases.length > 0 && (
        <div className={`rel-grid ${selected ? 'has-selection' : ''}`}>
          {filteredReleases.map(rel => {
            const isSelected = selected?.id === rel.id;
            const isDimmed   = selected && !isSelected;
            return (
              <div
                key={rel.id}
                className={`rel-card ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
                onClick={() => select(rel)}
              >
                <div className="rel-card-art" style={artBg(rel)}>
                  {/* Music note placeholder when no artwork */}
                  {!rel.artworkUrl && (
                    <div className="rel-card-art-fallback">
                      <Music size={28} strokeWidth={1} />
                    </div>
                  )}
                  <div className="rel-card-play"><Play size={18} fill="currentColor" /></div>
                  {rel.visibility === 'private' && (
                    <div className="rel-card-private"><EyeOff size={9} /> Private</div>
                  )}
                  {rel.status === 'pending' && (
                    <div className="rel-card-pending">Pending</div>
                  )}
                  <div className="rel-card-accent" style={{ background: rel.accentColor }} />
                </div>
                <div className="rel-card-info">
                  <div className="rel-card-title">{rel.title}</div>
                  <div className="rel-card-artist">{rel.artist}</div>
                  <div className="rel-card-meta">{rel.year || '—'} · {rel.format}</div>
                </div>
              </div>
            );
          })}

          {/* Upload new tile */}
          <div className="rel-card-empty" onClick={() => navigate('/upload')}>
            <Upload size={20} strokeWidth={1.5} />
            <span>Upload</span>
          </div>
        </div>
      )}

      {/* Detail overlay — slides up */}
      {selected && (
        <div
          className="rel-overlay"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="rel-panel glass">
            <button className="rel-panel-close" onClick={() => setSelected(null)}>
              <X size={14} />
            </button>

            {/* Header */}
            <div className="rdp-header">
              <div className="rdp-art" style={artBg(selected)}>
                {!selected.artworkUrl && (
                  <div className="rdp-art-fallback"><Music size={22} strokeWidth={1} /></div>
                )}
                <div className="rdp-art-accent" style={{ background: selected.accentColor }} />
              </div>
              <div className="rdp-meta">
                <div className="rdp-title">{selected.title}</div>
                <div className="rdp-album">{selected.artist} — {selected.albumName}</div>
                <div className="rdp-tags">
                  {selected.tags.map(t => <span key={t} className="rdp-tag">{t}</span>)}
                  <span className="rdp-tag rdp-tag--status">{selected.status}</span>
                </div>
                <div className="rdp-details">
                  {selected.year && <><span>{selected.year}</span><span>·</span></>}
                  <span>{selected.format}</span>
                  {selected.duration !== '—' && <><span>·</span><span>{selected.duration}</span></>}
                  <span>·</span>
                  {selected.visibility === 'public'
                    ? <span className="rdp-vis pub"><Eye size={10} /> Public</span>
                    : <span className="rdp-vis priv"><EyeOff size={10} /> Private</span>
                  }
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="rdp-stats">
              {[
                { icon: <Play size={15} fill="currentColor" />, val: selected.streams,   label: 'Streams' },
                { icon: <Download size={15} />,                  val: selected.downloads, label: 'Downloads' },
                { icon: <MessageSquare size={15} />,             val: selected.comments,  label: 'Comments' },
                { icon: <Star size={15} />,                      val: selected.feedback > 0 ? selected.feedback.toFixed(1) : 0, label: 'Rating' },
              ].map(({ icon, val, label }) => (
                <div key={label} className="rdp-stat">
                  <div className="rdp-stat-icon" style={{ color: selected.accentColor }}>{icon}</div>
                  <div className="rdp-stat-val">{val || '—'}</div>
                  <div className="rdp-stat-label">{label}</div>
                </div>
              ))}
            </div>

            {/* Revenue */}
            {selected.revenue > 0 && (
              <div className="rdp-revenue">
                <span className="rdp-revenue-label">Revenue generated</span>
                <span className="rdp-revenue-val" style={{ color: selected.accentColor }}>
                  €{selected.revenue.toLocaleString()}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="rdp-actions">
              <button className="rdp-btn">Edit Metadata</button>
              <button className="rdp-btn">Manage Credits</button>
              <button
                className={`rdp-btn rdp-btn--danger ${toggling ? 'loading' : ''}`}
                onClick={toggleVisibility}
                disabled={toggling}
              >
                {toggling
                  ? <Loader size={12} className="spin-sm" />
                  : (selected.visibility === 'public' ? 'Unpublish' : 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
