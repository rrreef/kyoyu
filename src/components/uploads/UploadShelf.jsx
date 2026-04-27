import { useState, useRef } from 'react';
import { Play, Pause, Shuffle, X, Music2 } from 'lucide-react';
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

/* ── tiny card ────────────────────────────────────────────── */
function Card({ cover, title, sub, badge, onClick }) {
  return (
    <div className="shelf-card upl-shelf-card" onClick={onClick}>
      <div className="shelf-card-art">
        {cover ? <img src={cover} alt={title}/>
          : <div className="upl-card-ph"><Music2 size={20} strokeWidth={1.3}/></div>}
        {badge && <div className="shelf-card-badge">{badge}</div>}
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {sub && <div className="shelf-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ── album bottom-sheet modal ─────────────────────────────── */
function AlbumModal({ alb, onClose }) {
  const [playing, setPlaying] = useState(null);
  const ref = useRef(new Audio());

  function playTrack(t, fromQueue) {
    ref.current.pause();
    if (!fromQueue && playing === t.id) { setPlaying(null); return; }
    if (!t.fileUrl) return;
    ref.current.src = t.fileUrl;
    ref.current.play().catch(()=>{});
    setPlaying(t.id);
    ref.current.onended = () => setPlaying(null);
  }

  function playQueue(shuffle) {
    const q = shuffle ? [...alb.tracks].sort(()=>Math.random()-.5) : [...alb.tracks];
    let i = 0;
    function next() {
      if (i >= q.length) { setPlaying(null); return; }
      const t = q[i++];
      if (!t.fileUrl) { next(); return; }
      ref.current.src = t.fileUrl;
      ref.current.play().catch(()=>{});
      setPlaying(t.id);
      ref.current.onended = next;
    }
    next();
  }

  function close() { ref.current.pause(); onClose(); }

  return (
    <div className="upl-overlay" onClick={e=>{ if(e.target===e.currentTarget) close(); }}>
      <div className="upl-sheet">
        <div className="upl-handle"/>

        {/* header */}
        <div className="upl-sheet-hdr">
          {alb.artworkUrl
            ? <img src={alb.artworkUrl} alt={alb.album} className="upl-sheet-art"/>
            : <div className="upl-sheet-art upl-sheet-art-ph"><Music2 size={34} strokeWidth={1.2}/></div>
          }
          <div className="upl-sheet-meta">
            <div className="upl-sheet-album">{alb.album}</div>
            <div className="upl-sheet-artist">{alb.artist}</div>
            <div className="upl-sheet-count">{alb.tracks.length} tracks · Private</div>
          </div>
          <button className="upl-sheet-close" onClick={close}><X size={15}/></button>
        </div>

        {/* play controls */}
        <div className="upl-sheet-ctrls">
          <button className="upl-ctrl upl-ctrl-primary" onClick={()=>playQueue(false)}>
            <Play size={15} fill="currentColor"/> Play
          </button>
          <button className="upl-ctrl upl-ctrl-secondary" onClick={()=>playQueue(true)}>
            <Shuffle size={15}/> Shuffle
          </button>
        </div>

        {/* track list */}
        <div className="upl-sheet-tracks">
          {alb.tracks.map((t,i) => (
            <button key={t.id} className={`upl-track-row${playing===t.id?' active':''}`} onClick={()=>playTrack(t,false)}>
              <span className="upl-track-n">
                {playing===t.id ? <Pause size={13} fill="currentColor"/> : i+1}
              </span>
              <div className="upl-track-info">
                <div className="upl-track-title">{t.title||'Untitled'}</div>
                <div className="upl-track-sub">{[t.artist,t.format,t.size].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── main export ──────────────────────────────────────────── */
const SORTS = [{key:'newest',label:'Newest'},{key:'oldest',label:'Oldest'},{key:'artist',label:'Artist A–Z'},{key:'label',label:'Label'}];

export default function UploadShelf({ uploads }) {
  const [sort, setSort] = useState('newest');
  const [activeAlb, setActiveAlb] = useState(null);
  const items = group(uploads, sort);

  return (
    <>
      {/* sort pills */}
      <div className="upl-sorts">
        {SORTS.map(o => (
          <button key={o.key} className={`upl-sort-pill${sort===o.key?' active':''}`} onClick={()=>setSort(o.key)}>
            {o.label}
          </button>
        ))}
      </div>

      {/* cards */}
      <div className="scroll-row">
        {items.map(item =>
          item._type === 'album'
            ? <Card key={item.id} cover={item.artworkUrl} title={item.album} sub={item.artist} badge={`${item.tracks.length} tracks`} onClick={()=>setActiveAlb(item)}/>
            : <Card key={item.id} cover={item.artworkUrl} title={item.title||'Untitled'} sub={item.artist||''} onClick={null}/>
        )}
      </div>

      {activeAlb && <AlbumModal alb={activeAlb} onClose={()=>setActiveAlb(null)}/>}
    </>
  );
}
