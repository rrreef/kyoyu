import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Shuffle, X, Music2 } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
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
          ? <img src={cover} alt={title}/>
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

/* ── album bottom-sheet modal ─────────────────────────────── */
function AlbumModal({ alb, onClose }) {
  const { playTrack } = usePlayer();
  const [activeId, setActiveId] = useState(null);

  /* Mark body so Player CSS can float above the sheet */
  useEffect(() => {
    document.body.classList.add('upl-album-open');
    return () => document.body.classList.remove('upl-album-open');
  }, []);

  function handlePlayTrack(t) {
    const pt    = toPlayerTrack(t, alb.artworkUrl);
    const queue = alb.tracks.map(x => toPlayerTrack(x, alb.artworkUrl));
    playTrack(pt, queue);
    setActiveId(t.id);
  }

  function handlePlayAll(shuffle) {
    const tracks = shuffle
      ? [...alb.tracks].sort(() => Math.random() - .5)
      : [...alb.tracks];
    const queue = tracks.map(x => toPlayerTrack(x, alb.artworkUrl));
    playTrack(queue[0], queue);
    setActiveId(queue[0].id);
  }

  const modal = (
    <div className="upl-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="upl-sheet" onClick={e=>e.stopPropagation()}>
        <div className="upl-handle"/>

        {/* ── Large square artwork ── */}
        <div className="upl-art-wrap">
          {alb.artworkUrl
            ? <img src={alb.artworkUrl} alt={alb.album} className="upl-art-big"/>
            : <div className="upl-art-big upl-art-big-ph"><Music2 size={52} strokeWidth={1}/></div>
          }
          <button className="upl-sheet-close" onClick={onClose}><X size={15}/></button>
        </div>

        {/* ── Metadata ── */}
        <div className="upl-sheet-meta">
          <div className="upl-sheet-album">{alb.album}</div>
          <div className="upl-sheet-artist">{alb.artist}</div>
          <div className="upl-sheet-count">{alb.tracks.length} tracks · Private</div>
        </div>

        {/* ── Play controls ── */}
        <div className="upl-sheet-ctrls">
          <button className="upl-ctrl upl-ctrl-primary" onClick={()=>handlePlayAll(false)}>
            <Play size={15} fill="currentColor"/> Play
          </button>
          <button className="upl-ctrl upl-ctrl-secondary" onClick={()=>handlePlayAll(true)}>
            <Shuffle size={15}/> Shuffle
          </button>
        </div>

        {/* ── Track list ── */}
        <div className="upl-sheet-tracks">
          {alb.tracks.map((t,i) => (
            <button key={t.id}
              className={`upl-track-row${activeId===t.id?' active':''}`}
              onClick={()=>handlePlayTrack(t)}>
              <span className="upl-track-n">
                {activeId===t.id ? <Play size={12} fill="currentColor"/> : i+1}
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

  return createPortal(modal, document.body);
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
