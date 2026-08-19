import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Shuffle, Music2, MoreHorizontal, Check, Heart } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLibrary } from '../../contexts/LibraryContext';
import './UploadShelf.css';

/* ── group by album ───────────────────────────────────────── */
function group(uploads, sort) {
  const c = [...uploads];
  if (sort==='oldest') c.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));
  else if (sort==='artist') c.sort((a,b)=>(a.artist||'').localeCompare(b.artist||''));
  else if (sort==='label')  c.sort((a,b)=>(a.label||'').localeCompare(b.label||''));
  else c.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));

  const map = new Map();
  const singles = [];
  c.forEach(t => {
    if (t.album) { if (!map.has(t.album)) map.set(t.album,[]); map.get(t.album).push(t); }
    else singles.push({ _type:'track', ...t });
  });
  const items = [];
  map.forEach((tracks, album) => {
    if (tracks.length > 1) {
      const art = tracks.find(t=>t.artworkUrl)?.artworkUrl || null;
      items.push({ _type:'album', id:`alb-${album}`, album, artist:tracks[0].artist||'', artworkUrl:art, tracks });
    } else singles.push({ _type:'track', ...tracks[0] });
  });
  return [...items, ...singles];
}

/* ── convert upload track to PlayerContext shape ─────────── */
function toPlayerTrack(t, albumCover) {
  return {
    id:           t.id,
    title:        t.title || 'Untitled',
    artistName:   t.artist || '',
    releaseCover: t.artworkUrl || albumCover || '',
    releaseTitle: t.album || t.title || '',
    src:          t.fileUrl || '',
  };
}

/* ── tiny shelf card ─────────────────────────────────────── */
function Card({ cover, title, sub, badge, onClick }) {
  return (
    <div className="shelf-card upl-shelf-card" onClick={onClick}>
      <div className="shelf-card-art">
        {cover
          ? <img src={cover} alt={title} loading="lazy" decoding="async"/>
          : <div className="upl-card-ph"><Music2 size={20} strokeWidth={1.3}/></div>
        }
        {badge && <div className="shelf-card-badge">{badge}</div>}
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {sub && <div className="shelf-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ── notify native layer ──────────────────────────────────── */
function postNative(obj) {
  window.webkit?.messageHandlers?.player?.postMessage(obj);
}

/* ── module-level colour cache (persists across modal opens) ─ */
const _colorCache = new Map();

/* ── extract dominant colour via a fresh programmatic Image ── */
function extractColor(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    if (_colorCache.has(url)) return resolve(_colorCache.get(url));
    const img = new Image();
    // Allow canvas to read external (Supabase/CDN) artwork without CORS taint
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const SIZE = 64;
        const cv = document.createElement('canvas');
        cv.width = SIZE; cv.height = SIZE;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        const counts = {};
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 100) continue;
          const r = Math.round(data[i]     / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          const k = `${r},${g},${b}`;
          counts[k] = (counts[k] || 0) + 1;
        }
        let max = 0, best = null;
        for (const [k, n] of Object.entries(counts)) { if (n > max) { max = n; best = k; } }
        if (best) _colorCache.set(url, best);
        resolve(best);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ── album full-screen modal ──────────────────────────────── */
function AlbumModal({ alb, onClose }) {
  const { playTrack } = usePlayer();
  const [activeId, setActiveId] = useState(null);
  // Initialise from cache immediately — 2nd+ opens get colour before first paint
  const [accent, setAccent] = useState(() => _colorCache.get(alb.artworkUrl) ?? null);
  const startY    = useRef(0);
  const panelRef  = useRef(null);
  const handleRef = useRef(null);
  const imgRef    = useRef(null);

  /* Tell Swift to hide top cluster; restore on unmount */
  useEffect(() => {
    postNative({ albumOpen: true });
    return () => postNative({ albumOpen: false });
  }, []);

  /* Extract colour via programmatic Image — works on first open,
     caches result so subsequent opens are instant (no async at all). */
  useEffect(() => {
    if (!alb.artworkUrl || _colorCache.has(alb.artworkUrl)) return;
    extractColor(alb.artworkUrl).then(c => { if (c) setAccent(c); });
  }, [alb.artworkUrl]);

  /* Swipe-down-to-close — HANDLE ROW ONLY */
  useEffect(() => {
    const el = handleRef.current; if (!el) return;
    const onTS = e => { startY.current = e.touches[0].clientY; };
    const onTE = e => { if (e.changedTouches[0].clientY - startY.current > 50) onClose(); };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchend',   onTE, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchend',   onTE);
    };
  }, [onClose]);

  function handlePlayTrack(t) {
    const pt    = toPlayerTrack(t, alb.artworkUrl);
    const queue = alb.tracks.map(x => toPlayerTrack(x, alb.artworkUrl));
    playTrack(pt, queue); setActiveId(t.id);
  }
  function handlePlayAll(shuffle) {
    const tracks = shuffle ? [...alb.tracks].sort(() => Math.random() - .5) : [...alb.tracks];
    const queue  = tracks.map(x => toPlayerTrack(x, alb.artworkUrl));
    playTrack(queue[0], queue); setActiveId(queue[0].id);
  }

  /* Solid flat background + adaptive text theme */
  const isLight = accent
    ? (() => { const [r,g,b] = accent.split(',').map(Number); return 0.299*r + 0.587*g + 0.114*b > 128; })()
    : false;
  const panelStyle = accent ? { background: `rgb(${accent})` } : {};
  const themeClass = isLight ? ' upl-theme-light' : ''

  /* Tell the native pill player to flip its text/icon colour to match */
  useEffect(() => {
    postNative({ lightBg: isLight });
  }, [isLight]);

  const panel = (
    <div ref={panelRef} className={`upl-fullscreen${themeClass}`} style={panelStyle}>
      {/* handle row — swipe DOWN here to close */}
      <div ref={handleRef} className="upl-fs-handle-row">
        <div className="upl-handle"/>
      </div>

      {/* scrollable content */}
      <div className="upl-fs-scroll">
        {/* Artwork */}
        <div className="upl-art-wrap">
          {alb.artworkUrl
            ? <img ref={imgRef} src={alb.artworkUrl} alt={alb.album} className="upl-art-big" loading="eager" decoding="async"/>
            : <div className="upl-art-big upl-art-big-ph"><Music2 size={64} strokeWidth={1}/></div>
          }
        </div>

        {/* Metadata */}
        <div className="upl-sheet-meta">
          <div className="upl-sheet-album">{alb.album}</div>
          <div className="upl-sheet-artist">{alb.artist}</div>
          <div className="upl-sheet-count">{alb.tracks.length} tracks · Private</div>
        </div>

        {/* Play controls */}
        <div className="upl-sheet-ctrls">
          <button className="upl-ctrl upl-ctrl-primary"   onClick={() => handlePlayAll(false)}><Play size={15} fill="currentColor"/> Play</button>
          <button className="upl-ctrl upl-ctrl-secondary" onClick={() => handlePlayAll(true)}><Shuffle size={15}/> Shuffle</button>
        </div>

        {/* Track list */}
        <div className="upl-sheet-tracks">
          {alb.tracks.map((t, i) => (
            <button key={t.id}
              className={`upl-track-row${activeId === t.id ? ' active' : ''}`}
              onClick={() => handlePlayTrack(t)}>
              <span className="upl-track-n">
                {activeId === t.id ? <Play size={12} fill="currentColor"/> : i + 1}
              </span>
              <div className="upl-track-info">
                <div className="upl-track-title">{t.title || 'Untitled'}</div>
                <div className="upl-track-sub">{[t.artist, t.format, (Number(t.size) > 0) ? (Number(t.size)/1048576).toFixed(1)+' MB' : null].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

/* ── main export ──────────────────────────────────────────── */
const SORTS = [
  {key:'newest',label:'Newest'},
  {key:'oldest',label:'Oldest'},
  {key:'artist',label:'Artist A–Z'},
  {key:'label', label:'Label'},
];

export default function UploadShelf({ uploads }) {
  const { playTrack } = usePlayer();
  const [sort, setSort]         = useState('newest');
  const [activeAlb, setActiveAlb] = useState(null);
  const items = group(uploads, sort);

  function handleSingleTrack(item) {
    const pt      = toPlayerTrack(item, null);
    const singles = items.filter(x=>x._type==='track').map(x=>toPlayerTrack(x,null));
    playTrack(pt, singles);
  }

  return (
    <>
      {/* sort pills */}
      <div className="upl-sorts">
        {SORTS.map(o => (
          <button key={o.key}
            className={`upl-sort-pill${sort===o.key?' active':''}`}
            onClick={()=>setSort(o.key)}>
            {o.label}
          </button>
        ))}
      </div>

      {/* cards */}
      <div className="scroll-row">
        {items.map(item =>
          item._type === 'album'
            ? <Card key={item.id} cover={item.artworkUrl} title={item.album}
                sub={item.artist} badge={`${item.tracks.length} tracks`}
                onClick={()=>setActiveAlb(item)}/>
            : <Card key={item.id} cover={item.artworkUrl} title={item.title||'Untitled'}
                sub={item.artist||''} onClick={()=>handleSingleTrack(item)}/>
        )}
      </div>

      {activeAlb && (
        <AlbumModal alb={activeAlb} onClose={()=>setActiveAlb(null)}/>
      )}
    </>
  );
}

/* ── Named export: vertical track list reused in Home & Library ── */
export function UploadExpandedList({ uploads }) {
  const { playTrack } = usePlayer();
  const { user } = useAuth();
  const { toggleLikeUpload, isLikedUpload } = useLibrary();
  const [activeId,     setActiveId]     = useState(null);
  const [editingTrack, setEditingTrack] = useState(null);
  const [editMeta,     setEditMeta]     = useState({});
  const sorted = [...uploads].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  function play(t) {
    const queue = sorted.map(u => ({
      id: u.id, title: u.title || 'Untitled', artistName: u.artist || '', artist: u.artist || '',
      releaseCover: u.artworkUrl || u.cover || '', releaseTitle: u.album || u.title || '', src: u.fileUrl || u.audioUrl || '',
    }));
    playTrack(queue.find(q => q.id === t.id) || queue[0], queue);
    setActiveId(t.id);
  }
  function openEdit(t) {
    setEditingTrack(t);
    setEditMeta({ title:t.title||'', artist:t.artist||'', album:t.album||'', genre:t.genre||'', year:t.year||'', label:t.label||'' });
  }
  function closeEdit() { setEditingTrack(null); }
  function saveEdit() {
    if (!editingTrack || !user?.id) return;
    try {
      const key = `kyoyu-uploads-${user.id}`;
      const all = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify(all.map(t => t.id === editingTrack.id ? { ...t, ...editMeta } : t)));
      window.dispatchEvent(new CustomEvent('kyoyu-uploads-changed'));
    } catch {}
    closeEdit();
  }

  return (
    <>
      <div className="upl-expanded-list">
        {sorted.map(t => (
          <div key={t.id} className={`upl-exp-row${activeId === t.id ? ' active' : ''}`}>
            {((t.artworkUrl && t.artworkUrl !== 'undefined' && t.artworkUrl !== 'null') || (t.cover && t.cover !== 'undefined' && t.cover !== 'null'))
              ? <img src={(t.artworkUrl !== 'undefined' && t.artworkUrl !== 'null' ? t.artworkUrl : null) || (t.cover !== 'undefined' && t.cover !== 'null' ? t.cover : null)} alt="" className="upl-exp-art" loading="lazy" decoding="async"/>
              : <div className="upl-exp-art upl-exp-art-ph"><Music2 size={15}/></div>
            }
            <div className="upl-exp-info">
              <div className="upl-exp-title">{t.title || 'Untitled'}</div>
              <div className="upl-exp-sub">{t.artist || ''}</div>
            </div>
            <button
              className={`upl-exp-heart${isLikedUpload(t.id) ? ' liked' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleLikeUpload(t); }}
              aria-label={isLikedUpload(t.id) ? 'Unlike' : 'Like'}
              data-kyoyu-injected="1"
            >
              <Heart size={15} fill={isLikedUpload(t.id) ? '#ffffff' : 'none'} color={isLikedUpload(t.id) ? '#ffffff' : 'currentColor'} strokeWidth={2}/>
            </button>
            <button className="upl-exp-more" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
              <MoreHorizontal size={16}/>
            </button>
            <button className="upl-exp-play" onClick={() => play(t)}>
              {activeId === t.id ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
            </button>
          </div>
        ))}
      </div>

      {editingTrack && (
        <div className="upl-edit-overlay" onClick={closeEdit}>
          <div className="upl-edit-sheet" onClick={e => e.stopPropagation()}>
            <div className="upl-edit-handle"/>
            <div className="upl-edit-header">
              <h3 className="upl-edit-title">Edit Track</h3>
              <button className="upl-edit-close" onClick={closeEdit}><X size={18}/></button>
            </div>
            {editingTrack.artworkUrl && <img src={editingTrack.artworkUrl} alt="" className="upl-edit-art"/>}
            <div className="upl-edit-fields">
              {[{k:'title',l:'Title'},{k:'artist',l:'Artist'},{k:'album',l:'Album'},{k:'genre',l:'Genre'},{k:'year',l:'Year'},{k:'label',l:'Label'}].map(({k,l}) => (
                <div key={k} className="upl-edit-field">
                  <label>{l}</label>
                  <input value={editMeta[k]||''} onChange={e => setEditMeta(p => ({...p,[k]:e.target.value}))} placeholder={l}/>
                </div>
              ))}
            </div>
            <button className="upl-edit-save" onClick={saveEdit}><Check size={18}/> Save Changes</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Named export: grid view for configurable N-column layout ── */
export function UploadGridView({ uploads, cols = 2 }) {
  const { playTrack, state } = usePlayer();
  const { toggleLikeUpload, isLikedUpload } = useLibrary();
  const sorted = [...uploads].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  function play(t) {
    const queue = sorted.map(u => ({
      id: u.id, title: u.title || 'Untitled', artistName: u.artist || '', artist: u.artist || '',
      releaseCover: u.artworkUrl || u.cover || '', releaseTitle: u.album || u.title || '', src: u.fileUrl || u.audioUrl || '',
    }));
    playTrack(queue.find(q => q.id === t.id) || queue[0], queue);
  }

  const safeCols = Math.min(5, Math.max(1, cols));

  return (
    <div className={`upl-grid upl-grid-${safeCols}`}>
      {sorted.map(t => {
        const isActive = state.currentTrack?.id === t.id;
        const liked    = isLikedUpload(t.id);
        return (
          <div key={t.id} className={`upl-grid-cell${isActive ? ' active' : ''}`} onClick={() => play(t)}>
            <div className="upl-grid-art">
              {((t.artworkUrl && t.artworkUrl !== 'undefined' && t.artworkUrl !== 'null') || (t.cover && t.cover !== 'undefined' && t.cover !== 'null'))
                ? <img src={(t.artworkUrl !== 'undefined' && t.artworkUrl !== 'null' ? t.artworkUrl : null) || (t.cover !== 'undefined' && t.cover !== 'null' ? t.cover : null)} alt={t.title} loading="lazy" decoding="async"/>
                : <div className="upl-grid-art-ph"><Music2 size={safeCols >= 4 ? 12 : 22} strokeWidth={1.2}/></div>
              }
              {isActive && (
                <div className="upl-grid-playing">
                  <Pause size={safeCols >= 4 ? 10 : 16} fill="currentColor"/>
                </div>
              )}
              <button
                className={`upl-grid-heart${liked ? ' liked' : ''}`}
                onClick={e => { e.stopPropagation(); toggleLikeUpload(t); }}
                aria-label={liked ? 'Unlike' : 'Like'}
                data-kyoyu-injected="1"
              >
                <Heart size={safeCols >= 4 ? 9 : 12} fill={liked ? '#ffffff' : 'none'} color={liked ? '#ffffff' : 'currentColor'} strokeWidth={2}/>
              </button>
            </div>
            <div className="upl-grid-title">{t.title || 'Untitled'}</div>
            {safeCols <= 3 && <div className="upl-grid-artist">{t.artist || ''}</div>}
          </div>
        );
      })}
    </div>
  );
}
