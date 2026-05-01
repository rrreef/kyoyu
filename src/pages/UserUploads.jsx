import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload as UploadIcon, Music2, File, X, Play, Pause, Trash2, ChevronLeft, ChevronRight, ChevronDown, Check, Image, Lock, AlertCircle, Clock, User, Tag, History, MoreHorizontal, Share2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadRelease, getSignedUrl } from '../lib/uploadPipeline';
import * as mm from 'music-metadata-browser';
import InlinePlayer from '../components/player/InlinePlayer';
import { useAuth } from '../contexts/AuthContext';
import './UserUploads.css';

/* ─── helpers ───────────────────────────────────────────────── */
const ACCEPTED = ['.wav','.aiff','.aif','.mp3','.flac'];
const fmtBytes = b => b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB';
const ext      = f => f.name.split('.').pop().toUpperCase();
const stripExt = n => n.replace(/\.[^/.]+$/,'');
const ok       = f => ACCEPTED.includes('.'+f.name.split('.').pop().toLowerCase());
const emptyMeta= id => ({ id, title:'', artist:'', album:'', genre:'', year:String(new Date().getFullYear()), label:'', mixEng:'', masterEng:'', artworkUrl:null, artworkFile:null });

/* Compress artwork to a high-quality 600×600 JPEG for localStorage.
   600px @ q=0.92 ≈ 40-80 KB per track — sharp enough for all UI uses. */
function compressArtwork(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return Promise.resolve(dataUrl);
  return new Promise(resolve => {
    const img = document.createElement('img');
    img.onload = () => {
      try {
        const SIZE = 600;
        const cv = document.createElement('canvas');
        cv.width = SIZE; cv.height = SIZE;
        cv.getContext('2d').drawImage(img, 0, 0, SIZE, SIZE);
        resolve(cv.toDataURL('image/jpeg', 0.92));
      } catch { resolve(dataUrl); } // if canvas fails, keep original
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ─── metadata extraction via music-metadata-browser ────────── */
/* MIME map needed because AIFF files may have wrong browser MIME type */
const MIME_MAP = {
  mp3:  'audio/mpeg',
  flac: 'audio/flac',
  wav:  'audio/wav',
  aiff: 'audio/aiff',
  aif:  'audio/aiff',
};

async function extractMeta(file) {
  const r = { title:null, artist:null, album:null, genre:null, year:null, label:null, artworkUrl:null };
  try {
    const ext  = file.name.split('.').pop().toLowerCase();
    const mime = MIME_MAP[ext] || file.type || 'audio/mpeg';
    // parseBuffer requires a Uint8Array — reads the FULL file so AIFF tail tags work
    const buf  = await file.arrayBuffer();
    const meta = await mm.parseBuffer(new Uint8Array(buf), mime, { skipCovers: false });
    const c    = meta.common;
    r.title  = c.title            || null;
    r.artist = c.artist           || null;
    r.album  = c.album            || null;
    r.genre  = c.genre?.[0]       || null;
    r.year   = c.year?.toString() || null;
    r.label  = c.label?.[0]       || null;
    if (c.picture?.length) {
      const pic = c.picture[0];
      r.artworkUrl = URL.createObjectURL(
        new Blob([pic.data], { type: pic.format || 'image/jpeg' })
      );
    }
  } catch (e) {
    console.warn('[extractMeta] failed:', e);
  }
  return r;
}


const STEPS = ['Files','Track Info','Review'];

const isNativeApp = () => navigator.userAgent.includes('KyoyuApp');

const SORT_OPTS = [
  { key:'newest', label:'Newest' },
  { key:'oldest', label:'Oldest' },
  { key:'artist', label:'Artist A–Z' },
  { key:'label',  label:'Label A–Z' },
];
function sortUploads(arr, s) {
  const c=[...arr];
  if(s==='oldest') return c.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));
  if(s==='artist') return c.sort((a,b)=>(a.artist||'').localeCompare(b.artist||''));
  if(s==='label')  return c.sort((a,b)=>(a.label||'').localeCompare(b.label||''));
  return c.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)); // newest
}

/* ── SwipeDeleteRow — iOS swipe-to-reveal delete ──────────────── */
function SwipeDeleteRow({ onDelete, children, disabled }) {
  const wrapRef     = useRef(null);
  const contentRef  = useRef(null);
  const [offset, setOffset] = useState(0);
  const [snapped, setSnapped] = useState(false);
  const startX      = useRef(null);
  const startY      = useRef(null);      // track vertical too
  const startOff    = useRef(0);
  const liveOffset  = useRef(0);
  const dragging    = useRef(false);
  const direction   = useRef(null);      // 'h' | 'v' | null
  const THRESHOLD   = 36;
  const DIR_LOCK    = 6;                 // px to confirm direction

  function maxW() { return Math.round((wrapRef.current?.offsetWidth || 340) * 0.25); }

  /* Non-passive listener — only blocks native scroll for confirmed horizontal swipes */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e) => {
      if (dragging.current && direction.current === 'h' && !disabled) e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, [disabled]);

  function onTouchStart(e) {
    if (disabled) return;
    startX.current    = e.touches[0].clientX;
    startY.current    = e.touches[0].clientY;
    startOff.current  = liveOffset.current;
    dragging.current  = true;
    direction.current = null;
  }
  function onTouchMove(e) {
    if (!dragging.current || disabled) return;
    const dx = startX.current - e.touches[0].clientX;  // positive = left
    const dy = startY.current - e.touches[0].clientY;  // positive = up

    // Wait until enough movement to determine direction
    if (direction.current === null) {
      if (Math.abs(dx) < DIR_LOCK && Math.abs(dy) < DIR_LOCK) return;
      direction.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (direction.current === 'v') return; // vertical scroll — do nothing

    const next = Math.max(0, Math.min(startOff.current + dx, maxW() + 6));
    liveOffset.current = next;
    setOffset(next);
  }
  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    const wasH = direction.current === 'h';
    direction.current = null;
    if (!wasH) return;  // vertical or undetermined — no snap
    const m = maxW();
    const snap = liveOffset.current >= THRESHOLD ? m : 0;
    liveOffset.current = snap;
    setOffset(snap);
    setSnapped(snap > 0);
  }
  function close(e) { e?.stopPropagation(); liveOffset.current = 0; setOffset(0); setSnapped(false); }

  return (
    <div ref={wrapRef} className="sdr-wrap" onClick={snapped ? close : undefined}>
      <div className="sdr-bg" style={{ width: `${offset}px`, visibility: offset > 0 ? 'visible' : 'hidden' }}>
        {offset > 20 && (
          <button className="sdr-btn" onClick={(e) => { e.stopPropagation(); onDelete(); close(); }}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div
        ref={contentRef}
        className="sdr-content"
        style={{
          transform: `translateX(-${offset}px)`,
          transition: dragging.current ? 'none' : 'transform 0.28s cubic-bezier(.25,.46,.45,.94)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default function UserUploads() {
  const { user } = useAuth();
  const UPLOAD_KEY = `kyoyu-uploads-${user?.id||'anon'}`;
  const [step,        setStep]        = useState(0);
  const [files,       setFiles]       = useState([]);
  const [metas,       setMetas]       = useState([]);
  const [active,      setActive]      = useState(0);
  const [saved,       setSaved]       = useState([]);
  const [playing,     setPlaying]     = useState(null);
  const [dragging,    setDragging]    = useState(false);
  const [rejected,    setRejected]    = useState([]);
  const [advanced,    setAdvanced]    = useState(false);
  const [audioUrls,   setAudioUrls]   = useState({});
  const [showPrev,    setShowPrev]    = useState(false);
  const [prevSort,    setPrevSort]    = useState('newest');
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [saveErr,       setSaveErr]       = useState('');
  const [editingTrack,  setEditingTrack]  = useState(null);
  const [editMeta,      setEditMeta]      = useState({});
  const [shareEmail,    setShareEmail]    = useState('');
  const [shareList,     setShareList]     = useState([]);
  const [sharing,       setSharing]       = useState(false);
  const [shareMsg,      setShareMsg]      = useState({ text:'', ok:true });
  const [trackUploadState, setTrackUploadState] = useState({}); // {[fileId]: 'uploading'|'done'|'error'}
  const [trackUploadError, setTrackUploadError] = useState({}); // {[fileId]: errorString}
  const [uploadedTracks,   setUploadedTracks]   = useState({}); // {[fileId]: {storage_key,fileUrl,supabaseId,artworkUrl}}
  const fileRef       = useRef();
  const artRefs       = useRef([]);
  const audioRef      = useRef(new Audio());
  const editHandleRef = useRef(null);

  /* Load saved uploads from localStorage once user ID is known */
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    try {
      const s = localStorage.getItem(`kyoyu-uploads-${uid}`);
      if (s) {
        const parsed = JSON.parse(s);
        // Migrate any artwork still embedded in the main JSON to per-art keys
        let needsRewrite = false;
        parsed.forEach(t => {
          if (t.artworkUrl && !localStorage.getItem(`kyoyu-art-${uid}-${t.id}`)) {
            try { localStorage.setItem(`kyoyu-art-${uid}-${t.id}`, t.artworkUrl); needsRewrite = true; }
            catch {}
          }
        });
        // Rewrite main JSON without artwork blobs if we migrated anything
        if (needsRewrite) {
          try { localStorage.setItem(`kyoyu-uploads-${uid}`, JSON.stringify(parsed.map(t => ({ ...t, artworkUrl: null })))); }
          catch {}
        }
        // Rehydrate artworkUrls from per-track keys
        const hydrated = parsed.map(t => ({
          ...t,
          artworkUrl: localStorage.getItem(`kyoyu-art-${uid}-${t.id}`) || t.artworkUrl || null,
        }));
        setSaved(hydrated);
        if (hydrated.length > 0) setShowPrev(true);
      }
    } catch {}
    setStorageLoaded(true);
  }, [user?.id]);

  /* Refresh expired signed URLs for cloud-stored tracks */
  useEffect(() => {
    if (!user?.id || !storageLoaded) return;
    const key = `kyoyu-uploads-${user.id}`;
    let current = [];
    try { current = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    const needRefresh = current.filter(t => t.storage_key);
    if (!needRefresh.length) return;
    (async () => {
      const refreshed = await Promise.all(current.map(async t => {
        if (!t.storage_key) return t;
        const { data } = await supabase.storage.from('audio').createSignedUrl(t.storage_key, 7 * 24 * 3600);
        return data?.signedUrl ? { ...t, fileUrl: data.signedUrl } : t;
      }));
      setSaved(refreshed);
      try { localStorage.setItem(key, JSON.stringify(refreshed)); } catch {}
    })();
  }, [storageLoaded, user?.id]);

  /* Auto-upload each track to Supabase Storage as soon as Review step opens */
  useEffect(() => {
    if (step !== 2 || !files.length) return;
    const initial = {};
    files.forEach(f => { initial[f.id] = 'uploading'; });
    setTrackUploadState(initial);
    setTrackUploadError({});
    setUploadedTracks({});
    (async () => {
      for (let i = 0; i < files.length; i++) {
        const { file, id } = files[i];
        // Fix artwork: blob URL → data URL while blob is still alive
        let artworkUrl = metas[i]?.artworkUrl;
        if (metas[i]?.artworkFile) {
          artworkUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(metas[i].artworkFile); });
        } else if (artworkUrl?.startsWith('blob:')) {
          try { const b = await fetch(artworkUrl).then(r => r.blob()); artworkUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(b); }); }
          catch { artworkUrl = null; }
        }
        artworkUrl = await compressArtwork(artworkUrl);
        // Native / no-file tracks: mark done immediately
        if (!file || file.native || !user?.id) {
          setUploadedTracks(prev => ({ ...prev, [id]: { artworkUrl, fileUrl: audioUrls[id] || null } }));
          setTrackUploadState(prev => ({ ...prev, [id]: 'done' }));
          continue;
        }
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const audioKey = `${user.id}/${Date.now()}-${safeName}`;
          const { error: audioErr } = await supabase.storage.from('audio').upload(audioKey, file, {
            contentType: file.type || 'application/octet-stream', upsert: false,
          });
          if (audioErr) throw new Error(`Storage: ${audioErr.message}`);
          const { data: urlData } = await supabase.storage.from('audio').createSignedUrl(audioKey, 7 * 24 * 3600);
          const m = metas[i];
          const { data: track, error: trackErr } = await supabase.from('tracks').insert({
            creator_id: user.id, title: m.title?.trim() || file.name, artist: m.artist?.trim() || null,
            album: m.album?.trim() || null, genre: m.genre?.trim() || null,
            year: m.year ? parseInt(m.year) : null, format: ext(file),
            visibility: 'private', status: 'pending', storage_key: audioKey,
          }).select('id').single();
          if (trackErr) console.warn('[autoUpload] tracks insert:', trackErr.message);
          setUploadedTracks(prev => ({ ...prev, [id]: { storage_key: audioKey, fileUrl: urlData?.signedUrl || null, supabaseId: track?.id || null, artworkUrl } }));
          setTrackUploadState(prev => ({ ...prev, [id]: 'done' }));
        } catch (err) {
          console.error('[autoUpload]', err);
          // Still save with local blob URL so track appears in Previously Uploaded
          setUploadedTracks(prev => ({ ...prev, [id]: { artworkUrl, fileUrl: audioUrls[id] || null } }));
          setTrackUploadError(prev => ({ ...prev, [id]: err.message }));
          setTrackUploadState(prev => ({ ...prev, [id]: 'error' }));
        }
      }
    })();
  }, [step]); // eslint-disable-line

  /* Register native upload result handler */
  useEffect(() => {
    window.__kyoyuUploadResult = (tracks) => {
      // tracks: [{id, fileName, fileUrl, format, size, title, artist, album, genre, year, artworkDataUrl?}]
      const newFiles = tracks.map(t => ({ file:{ name:t.fileName, size:t.size, native:true }, id:t.id }));
      const newMetas = tracks.map(t => ({
        ...emptyMeta(t.id),
        title:  t.title  || stripExt(t.fileName),
        artist: t.artist || '',
        album:  t.album  || '',
        genre:  t.genre  || '',
        year:   t.year   || String(new Date().getFullYear()),
        artworkUrl: t.artworkDataUrl || null,
      }));
      const newUrls = Object.fromEntries(tracks.map(t => [t.id, t.fileUrl]));
      setFiles(p => [...p, ...newFiles]);
      setMetas(p => [...p, ...newMetas]);
      setAudioUrls(p => ({ ...p, ...newUrls }));
      setStep(1); setActive(0);
    };
    return () => { window.__kyoyuUploadResult = undefined; };
  }, []);

  /* blob URLs — only for non-native JS File objects */
  useEffect(() => {
    setAudioUrls(prev => {
      const next={...prev};
      const ids=new Set(files.map(f=>f.id));
      Object.keys(next).forEach(id=>{
        if(!ids.has(id)&&!next[id]?.startsWith('kyoyu-file://'))
          {URL.revokeObjectURL(next[id]);delete next[id];}
        else if(!ids.has(id)) delete next[id];
      });
      files.forEach(({file,id})=>{
        if(!next[id] && !file.native) next[id]=URL.createObjectURL(file);
      });
      return next;
    });
  },[files]);

  /* sync metas + extract tags for new non-native files */
  useEffect(() => {
    const prev=new Map(metas.map(m=>[m.id,m]));
    const next=files.map(({file,id})=>prev.get(id)??{...emptyMeta(id),title:stripExt(file.name)});
    if(active>=files.length&&files.length>0)setActive(files.length-1);
    setMetas(next);
    files.forEach(({file,id})=>{
      if(prev.has(id)||file.native)return; // skip already-processed or native files
      extractMeta(file).then(r=>{
        setMetas(m=>m.map(t=>t.id!==id?t:{...t,
          title:r.title||t.title, artist:r.artist||t.artist,
          album:r.album||t.album, genre:r.genre||t.genre,
          year:r.year||t.year,   label:r.label||t.label,
          artworkUrl:t.artworkUrl||r.artworkUrl||null,
        }));
      });
    });
  },[files]);

  function addFiles(fl) {
    const incoming=Array.from(fl);
    const good=incoming.filter(f=>ok(f));
    const bad=incoming.filter(f=>!ok(f));
    setFiles(prev=>{const names=new Set(prev.map(f=>f.file.name));return[...prev,...good.filter(f=>!names.has(f.name)).map(f=>({file:f,id:Math.random().toString(36).slice(2)}))];});
    if(bad.length){setRejected(bad.map(f=>f.name));setTimeout(()=>setRejected([]),4000);}
  }
  function removeFile(id){setFiles(p=>p.filter(f=>f.id!==id));}
  function setField(i,k){return v=>setMetas(m=>m.map((t,j)=>j===i?{...t,[k]:v}:t));}
  function copyAll(k,v){setMetas(m=>m.map(t=>({...t,[k]:v})));}
  function copyArtToAll(){
    const src = metas[active];
    if (!src?.artworkUrl) return;
    setMetas(prev => prev.map(t => ({
      ...t,
      artworkUrl:  src.artworkUrl,
      artworkFile: src.artworkFile ?? null,
    })));
  }
  function pickArt(i,e){const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);setMetas(m=>m.map((t,j)=>j===i?{...t,artworkFile:f,artworkUrl:url}:t));e.target.value='';}
  function rmArt(i){setMetas(m=>m.map((t,j)=>j===i?{...t,artworkFile:null,artworkUrl:null}:t));}

  /* saveAll: tracks are already uploaded — just persist metadata */
  async function saveAll() {
    setSaveErr('');
    try {
      const items = files.map((f, i) => {
        const m  = metas[i];
        const up = uploadedTracks[f.id] || {};
        return {
          ...m, artworkFile: undefined,
          artworkUrl:  up.artworkUrl  || m.artworkUrl  || null,
          fileUrl:     up.fileUrl     || audioUrls[f.id] || null,
          storage_key: up.storage_key || null,
          supabaseId:  up.supabaseId  || null,
          format: f.file ? ext(f.file) : '',
          size:   f.file ? fmtBytes(f.file.size) : '',
          savedAt: Date.now(),
        };
      });
      const uid = user?.id;
      if (uid) {
        const key = `kyoyu-uploads-${uid}`;
        const artKey = id => `kyoyu-art-${uid}-${id}`;

        // Read existing tracks and immediately rehydrate their artwork from per-art keys
        let existingRaw = [];
        try { existingRaw = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
        const existing = existingRaw.map(t => ({
          ...t,
          artworkUrl: localStorage.getItem(artKey(t.id)) || t.artworkUrl || null,
        }));

        // Push every track's artwork into its own key (best-effort; existing tracks already in per-art keys)
        [...items, ...existing].forEach(t => {
          if (t.artworkUrl && !localStorage.getItem(artKey(t.id))) {
            try { localStorage.setItem(artKey(t.id), t.artworkUrl); } catch {}
          }
        });

        // Build React state — always has artworkUrls for immediate display
        const nextSaved = [...items, ...existing];

        // Persist slim metadata — only null artworkUrl if per-art key confirmed to exist
        const toStore = nextSaved.map(t => ({
          ...t,
          artworkUrl: localStorage.getItem(artKey(t.id)) ? null : (t.artworkUrl || null),
        }));
        try {
          localStorage.setItem(key, JSON.stringify(toStore));
        } catch(qe) {
          setSaveErr(`⚠️ Could not save track list: ${qe.message}`);
        }
        setSaved(nextSaved); // all tracks have artwork here — no flash of missing art
      } else {
        setSaveErr('⚠️ Not signed in — tracks saved for this session only.');
        setSaved(prev => [...items, ...prev]);
      }
      setFiles([]); setMetas([]); setStep(0); setActive(0); setShowPrev(true);
      setTrackUploadState({}); setUploadedTracks({});
      window.dispatchEvent(new CustomEvent('kyoyu-uploads-changed'));
    } catch(err) {
      console.error('[saveAll]', err);
      setSaveErr(`Save failed: ${err.message}`);
    }
  }
  function removeSaved(id) {
    if (playing === id) { audioRef.current.pause(); setPlaying(null); }
    if (user?.id) try { localStorage.removeItem(`kyoyu-art-${user.id}-${id}`); } catch {} // clean up art key
    setSaved(prev => {
      const next = prev.filter(t => t.id !== id);
      if (user?.id) try { localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next.map(t => ({ ...t, artworkUrl: null })))); } catch {}
      return next;
    });
    window.dispatchEvent(new CustomEvent('kyoyu-uploads-changed'));
  }
  function toggleSelect(id){
    setSelectedIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  }
  function selectAll(){ setSelectedIds(new Set(saved.map(t=>t.id))); }
  function deleteSelected() {
    const ids = selectedIds;
    // Clean up per-track art keys for deleted items
    if (user?.id) ids.forEach(id => { try { localStorage.removeItem(`kyoyu-art-${user.id}-${id}`); } catch {} });
    setSaved(prev => {
      const next = prev.filter(t => !ids.has(t.id));
      if (user?.id) try { localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next.map(t => ({ ...t, artworkUrl: null })))); } catch {}
      return next;
    });
    setSelectedIds(new Set()); setSelectMode(false);
    window.dispatchEvent(new CustomEvent('kyoyu-uploads-changed'));
  }
  function openEdit(t) {
    window.webkit?.messageHandlers?.overlay?.postMessage('open');
    setEditingTrack(t);
    setEditMeta({ title:t.title||'', artist:t.artist||'', album:t.album||'', genre:t.genre||'', year:t.year||'', label:t.label||'' });
    setShareEmail(''); setShareList([]); setShareMsg({ text:'', ok:true });
    // Load existing shares if track is in cloud
    if (t.supabaseId) {
      supabase
        .from('track_shares')
        .select('id, shared_with, profiles!track_shares_shared_with_fkey(display_name, email)')
        .eq('track_id', t.supabaseId)
        .then(({ data }) => {
          setShareList((data||[]).map(s => ({
            shareId: s.id,
            id: s.shared_with,
            display_name: s.profiles?.display_name,
            email: s.profiles?.email,
          })));
        });
    }
  }
  function closeEdit() {
    window.webkit?.messageHandlers?.overlay?.postMessage('close');
    setEditingTrack(null); setShareEmail(''); setShareList([]); setShareMsg({ text:'', ok:true });
  }
  function saveEdit() {
    if (!editingTrack) return;
    setSaved(prev => {
      const next = prev.map(t => t.id === editingTrack.id ? { ...t, ...editMeta } : t);
      if (user?.id) try { localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
    window.dispatchEvent(new CustomEvent('kyoyu-uploads-changed'));
    closeEdit();
  }
  function togglePlay(t){if(playing===t.id){audioRef.current.pause();setPlaying(null);}else{audioRef.current.src=t.fileUrl;audioRef.current.play();setPlaying(t.id);audioRef.current.onended=()=>setPlaying(null);}}

  /* ── Swipe-to-close edit handle ── */
  useEffect(() => {
    const el = editHandleRef.current;
    if (!el || !editingTrack) return;
    let sy = 0;
    const onTS = e => { sy = e.touches[0].clientY; };
    const onTE = e => { if (e.changedTouches[0].clientY - sy > 60) closeEdit(); };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchend',   onTE, { passive: true });
    return () => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchend', onTE); };
  }, [editingTrack]);

  /* ── Cloud upload after save ── */
  async function pushToCloud(savedItems, fileObjs, metaObjs) {
    if (!user?.id) return;
    try {
      const cloudTracks = await uploadRelease({
        audioFiles: fileObjs,
        trackMetas: metaObjs.map((m, i) => ({
          ...m,
          artwork: m.artworkFile || undefined,
          visibility: 'private',
        })),
        globalForm: {},
        onProgress: null,
      });
      setSaved(prev => {
        const updated = prev.map((t, i) => {
          const match = savedItems.find(s => s.id === t.id);
          if (!match) return t;
          const idx = savedItems.indexOf(match);
          return cloudTracks[idx] ? { ...t, supabaseId: cloudTracks[idx].id } : t;
        });
        const key = `kyoyu-uploads-${user.id}`;
        try { localStorage.setItem(key, JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (e) {
      console.warn('[UserUploads] Cloud upload failed (local copy kept):', e.message);
    }
  }

  /* ── Share with user ── */
  async function addShare(track) {
    const email = shareEmail.trim().toLowerCase();
    if (!email) return;
    setSharing(true); setShareMsg({ text:'', ok:true });
    try {
      // Ensure track is in cloud first
      let sid = track.supabaseId;
      if (!sid) {
        setShareMsg({ text: 'Syncing to cloud first…', ok: true });
        const fileEntry = files.find(f => f.id === track.id);
        if (fileEntry) {
          const results = await uploadRelease({
            audioFiles: [{ file: fileEntry.file, id: fileEntry.id }],
            trackMetas: [{ ...track, artwork: track.artworkFile, visibility: 'private' }],
            globalForm: {}, onProgress: null,
          });
          sid = results[0]?.id;
          if (sid) {
            setSaved(prev => {
              const next = prev.map(t => t.id === track.id ? { ...t, supabaseId: sid } : t);
              try { localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next)); } catch {}
              return next;
            });
            setEditingTrack(t => ({ ...t, supabaseId: sid }));
          }
        }
        if (!sid) throw new Error('Could not sync track. Try again.');
      }
      // Lookup recipient
      const { data: recipient, error: rpErr } = await supabase
        .from('profiles').select('id, display_name, email').eq('email', email).single();
      if (rpErr || !recipient) throw new Error('No user found with that email.');
      if (recipient.id === user.id) throw new Error('You cannot share with yourself.');
      // Create share
      const { data: shareRow, error: shareErr } = await supabase
        .from('track_shares')
        .insert({ track_id: sid, shared_by: user.id, shared_with: recipient.id })
        .select('id').single();
      if (shareErr) throw new Error(shareErr.code === '23505' ? 'Already shared with this user.' : shareErr.message);
      setShareList(prev => [...prev, { shareId: shareRow.id, id: recipient.id, display_name: recipient.display_name, email: recipient.email }]);
      setShareEmail('');
      setShareMsg({ text: `Shared with ${recipient.display_name || recipient.email}`, ok: true });
    } catch (e) {
      setShareMsg({ text: e.message, ok: false });
    } finally {
      setSharing(false);
    }
  }

  async function removeShare(shareId) {
    const { error } = await supabase.from('track_shares').delete().eq('id', shareId);
    if (!error) setShareList(prev => prev.filter(s => s.shareId !== shareId));
  }

  const m=metas[active]||emptyMeta('_');

  /* ── STEP 0 ─────────────────────────────────────────── */
  if(step===0) return (
    <div className="page uu-page animate-in">
      <div className="uu-header"><h1>My Uploads</h1></div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      <input ref={fileRef} type="file" multiple accept=".wav,.aiff,.aif,.mp3,.flac" style={{display:'none'}} onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>

      <div className={`uu-dropzone glass${dragging?' dragging':''}`}
        onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);}}
        onClick={()=>{
          if(isNativeApp()) window.webkit?.messageHandlers?.upload?.postMessage({action:'pick'});
          else fileRef.current.click();
        }}>
        <UploadIcon size={28} strokeWidth={1.5}/>
        <div className="uu-drop-title">{dragging?'Drop to add': isNativeApp() ? 'Tap to select from Files' : 'Drag & drop audio files'}</div>
        <div className="uu-drop-formats">{['FLAC','WAV','AIFF','MP3'].map(f=><span key={f} className="uu-fmt">{f}</span>)}</div>
      </div>

      {rejected.length>0&&<div className="uu-rejected"><AlertCircle size={13}/><span>{rejected.join(', ')} — unsupported format</span></div>}

      {files.length>0&&(
        <div className="uu-file-list glass">
          <div className="uu-file-list-hdr"><span>{files.length} track{files.length>1?'s':''} selected</span><button onClick={()=>{
            if(isNativeApp()) window.webkit?.messageHandlers?.upload?.postMessage({action:'pick'});
            else fileRef.current.click();
          }}>+ Add more</button></div>
          {files.map(({file,id},i)=>(
            <div key={id} className="uu-file-row">
              <span className="uu-file-num">{i+1}</span>
              <File size={13}/><span className="uu-file-name">{file.name}</span>
              <span className="uu-fmt">{ext(file)}</span><span className="uu-fsz">{fmtBytes(file.size)}</span>
              <button onClick={()=>removeFile(id)}><X size={13}/></button>
            </div>
          ))}
        </div>
      )}

      <div className="uu-privacy"><Lock size={11}/><span>Stored privately · never uploaded to servers</span></div>

      {files.length>0&&<button className="uu-next-btn" onClick={()=>setStep(1)}>Next — Track Info <ChevronRight size={15}/></button>}

      {/* ── Previously Uploaded ── */}
      {saved.length>0&&(
        <div className="uu-prev-section">
          <button className="uu-prev-toggle glass" onClick={()=>setShowPrev(v=>!v)}>
            <History size={14}/>
            <span>Previously uploaded</span>
            <span className="uu-prev-count">{saved.length}</span>
            <ChevronDown size={14} className={`uu-chev${showPrev?' open':''}`}/>
          </button>

          {showPrev&&(
            <>
              {/* Sort + Select row */}
              <div className="uu-sort-select-row">
                {selectMode ? (
                  <button className="uu-prev-sort uu-select-cancel" onClick={()=>{setSelectMode(false);setSelectedIds(new Set());}}>✕ Select</button>
                ) : (
                  <div className="uu-prev-sorts">
                    {SORT_OPTS.map(o=>(
                      <button key={o.key} className={`uu-prev-sort${prevSort===o.key?' active':''}`}
                        onClick={()=>setPrevSort(o.key)}>{o.label}</button>
                    ))}
                  </div>
                )}
                {selectMode ? (
                  <button className="uu-select-all-btn" onClick={selectAll}>Select All</button>
                ) : (
                  <button className="uu-select-trigger" onClick={()=>setSelectMode(true)}>Select</button>
                )}
              </div>

              {/* Bulk delete bar */}
              {selectMode&&selectedIds.size>0&&(
                <button className="uu-delete-sel" onClick={deleteSelected}>
                  <Trash2 size={15}/> Delete {selectedIds.size} Track{selectedIds.size>1?'s':''}
                </button>
              )}

              {/* List */}
              <div className="uu-prev-list">
                {sortUploads(saved,prevSort).map(t=>(
                  selectMode ? (
                    <div key={t.id} className={`uu-track glass uu-selectable${selectedIds.has(t.id)?' sel':''}`} onClick={()=>toggleSelect(t.id)}>
                      <div className={`uu-chk${selectedIds.has(t.id)?' checked':''}`}/>
                      {t.artworkUrl?<img src={t.artworkUrl} alt="" className="uu-art"/>:<div className="uu-art-ph"><Music2 size={15}/></div>}
                      <div className="uu-track-info">
                        <div className="uu-track-title">{t.title}</div>
                        <div className="uu-track-sub">{[t.artist,t.format,t.size].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ) : (
                    <SwipeDeleteRow key={t.id} onDelete={()=>removeSaved(t.id)}>
                      <div className={`uu-track glass${playing===t.id?' playing':''}`}>
                        {t.artworkUrl?<img src={t.artworkUrl} alt="" className="uu-art"/>:<div className="uu-art-ph"><Music2 size={15}/></div>}
                        <div className="uu-track-info">
                          <div className="uu-track-title">{t.title}</div>
                          <div className="uu-track-sub">{[t.artist,t.format,t.size].filter(Boolean).join(' · ')}</div>
                        </div>
                        <button className="uu-more-btn" onClick={(e)=>{ e.stopPropagation(); openEdit(t); }}><MoreHorizontal size={16}/></button>
                        <button className="uu-play" onClick={()=>togglePlay(t)}>{playing===t.id?<Pause size={14} fill="currentColor"/>:<Play size={14} fill="currentColor"/>}</button>
                      </div>
                    </SwipeDeleteRow>
                  )
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {saved.length===0&&files.length===0&&<div className="uu-empty"><Music2 size={32} strokeWidth={1.2}/><div>No uploads yet</div><div className="uu-empty-sub">Your private music lives here</div></div>}

      {/* ── Edit Track — full screen via portal (escapes parent transform) ── */}
      {editingTrack && createPortal(
        <div className="uu-edit-overlay">
          {/* Handle row — swipe down to close */}
          <div className="uu-edit-handle-row" ref={editHandleRef}>
            <div className="uu-edit-handle"/>
          </div>
          <div className="uu-edit-scroll">
            <div className="uu-edit-header">
              <h3 className="uu-edit-title">
                Edit Track
                {editingTrack.supabaseId && <span className="uu-cloud-badge">☁ Synced</span>}
              </h3>
            </div>
            {editingTrack.artworkUrl && <img src={editingTrack.artworkUrl} alt="" className="uu-edit-art"/>}
            <div className="uu-fields glass" style={{margin:'0 16px 16px'}}>
              {[{k:'title',l:'Title'},{k:'artist',l:'Artist'},{k:'album',l:'Album'},{k:'genre',l:'Genre'},{k:'year',l:'Year'},{k:'label',l:'Label'}].map(({k,l})=>(
                <div key={k} className="uu-field">
                  <label>{l}</label>
                  <input value={editMeta[k]||''} onChange={e=>setEditMeta(p=>({...p,[k]:e.target.value}))} placeholder={l}/>
                </div>
              ))}
            </div>
            <button className="uu-save-full" onClick={saveEdit}><Check size={18}/> Save Changes</button>

            {/* Share section */}
            <div className="uu-share-section">
              <div className="uu-share-header"><Share2 size={15}/> Share with a user</div>
              {!editingTrack.supabaseId && (
                <div className="uu-share-note">Track will be synced to the platform when you share it for the first time.</div>
              )}
              <div className="uu-share-input-row">
                <input
                  className="uu-share-email"
                  type="email"
                  placeholder="Email or username…"
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addShare(editingTrack)}
                />
                <button className="uu-share-btn" onClick={() => addShare(editingTrack)} disabled={sharing}>
                  {sharing ? '…' : <UserPlus size={16}/>}
                </button>
              </div>
              {shareMsg.text && <div className={shareMsg.ok ? 'uu-share-ok' : 'uu-share-err'}>{shareMsg.text}</div>}
              {shareList.length > 0 && (
                <div className="uu-share-list">
                  {shareList.map(s => (
                    <div key={s.shareId} className="uu-share-item">
                      <div className="uu-share-avatar">{(s.display_name||s.email||'?')[0].toUpperCase()}</div>
                      <div className="uu-share-name">
                        <div>{s.display_name || s.email}</div>
                        <div className="uu-share-sub">{s.email}</div>
                      </div>
                      <button className="uu-share-remove" onClick={() => removeShare(s.shareId)}><X size={13}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );

  /* ── STEP 1: Track Info ──────────────────────────────── */
  if(step===1) return (
    <div className="page uu-page animate-in">
      <div className="uu-header">
        <button className="uu-back-btn" onClick={()=>setStep(0)}><ChevronLeft size={18}/></button>
        <h1>Track Info</h1>
        <button className="uu-next-sm" onClick={()=>setStep(2)}>Review <ChevronRight size={14}/></button>
      </div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      {files.length>1&&(
        <div className="uu-tabs">
          {files.map(({file,id},i)=>(
            <button key={id} className={`uu-tab${i===active?' active':''}`} onClick={()=>setActive(i)}>
              {metas[i]?.artworkUrl?<img src={metas[i].artworkUrl} alt="" className="uu-tab-art"/>:<span className="uu-tab-num">{i+1}</span>}
              <span className="uu-tab-frac">{i+1}/{files.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="uu-track-form">
        {/* Artwork */}
        <input type="file" accept="image/*" style={{display:'none'}} ref={el=>artRefs.current[active]=el} onChange={e=>pickArt(active,e)}/>
        <div className="uu-art-section">
          {m.artworkUrl?(
            <div className="uu-art-preview">
              <img src={m.artworkUrl} alt="artwork" className="uu-art-big"/>
              <div className="uu-art-btns">
                {files.length > 1 && (
                  <button className="uu-art-copy-all" onClick={copyArtToAll}>Copy to all</button>
                )}
                <button onClick={()=>artRefs.current[active]?.click()}>Replace</button>
                <button onClick={()=>rmArt(active)}><X size={12}/></button>
              </div>
            </div>
          ):(
            <div className="uu-art-empty" onClick={()=>artRefs.current[active]?.click()}>
              <Image size={24} strokeWidth={1.5}/>
              <span>Add artwork</span>
              <span className="uu-art-hint">JPG, PNG · min 800×800</span>
            </div>
          )}
          <div className="uu-file-chip"><File size={11}/>{files[active]?.file.name}<span className="uu-fmt">{ext(files[active]?.file??{name:'x.mp3'})}</span></div>
          <InlinePlayer
            src={audioUrls[files[active]?.id]}
            artworkUrl={m.artworkUrl}
            title={m.title}
            artist={m.artist}
            hasPrev={active > 0}
            hasNext={active < files.length - 1}
            onPrev={() => setActive(a => Math.max(0, a - 1))}
            onNext={() => setActive(a => Math.min(files.length - 1, a + 1))}
          />
        </div>

        {/* Fields */}
        <div className="uu-fields glass">
          {[
            {k:'title',  label:'Title'},
            {k:'artist', label:'Artist', copy:true},
            {k:'album',  label:'Album',  copy:true},
            {k:'genre',  label:'Genre',  copy:true},
            {k:'year',   label:'Year',   copy:true, type:'number'},
          ].map(({k,label,copy,type})=>(
            <div key={k} className="uu-field">
              <label>{label}{copy&&files.length>1&&<button className="uu-copy-all" onClick={()=>copyAll(k,m[k])}>Copy to all</button>}</label>
              <input type={type||'text'} value={m[k]||''} onChange={e=>setField(active,k)(e.target.value)} placeholder={label}/>
            </div>
          ))}
        </div>

        {/* Advanced */}
        <button className="uu-adv-toggle" onClick={()=>setAdvanced(a=>!a)}>
          <ChevronDown size={14} className={`uu-chev${advanced?' open':''}`}/> Advanced
        </button>
        {advanced&&(
          <div className="uu-fields glass uu-fields-adv animate-in">
            {[{k:'mixEng',label:'Mixing Engineer'},{k:'masterEng',label:'Mastering Engineer'},{k:'label',label:'Label',copy:true}].map(({k,label,copy})=>(
              <div key={k} className="uu-field">
                <label>{label}{copy&&files.length>1&&<button className="uu-copy-all" onClick={()=>copyAll(k,m[k])}>Copy to all</button>}</label>
                <input value={m[k]||''} onChange={e=>setField(active,k)(e.target.value)} placeholder={label}/>
              </div>
            ))}
          </div>
        )}

        {files.length>1&&(
          <div className="uu-track-nav">
            <button disabled={active===0} onClick={()=>setActive(i=>i-1)}><ChevronLeft size={14}/> Prev</button>
            <span>{active+1} / {files.length}</span>
            <button disabled={active===files.length-1} onClick={()=>setActive(i=>i+1)}>Next <ChevronRight size={14}/></button>
          </div>
        )}
      </div>
    </div>
  );

  /* ── STEP 2: Review ──────────────────────────────────── */
  const allDone = files.length > 0 && files.every(f =>
    trackUploadState[f.id] === 'done' || trackUploadState[f.id] === 'error'
  );
  const doneCount  = files.filter(f => trackUploadState[f.id] === 'done').length;
  const errorCount = files.filter(f => trackUploadState[f.id] === 'error').length;

  return (
    <div className="page uu-page animate-in">
      <div className="uu-header">
        <button className="uu-back-btn" onClick={()=>setStep(1)}><ChevronLeft size={18}/></button>
        <h1>Review</h1>
        <button className="uu-save-hdr" onClick={saveAll} disabled={!allDone}><Check size={14}/> Save All</button>
      </div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      <div className="uu-review-list">
        {metas.map((t,i) => {
          const fid    = files[i]?.id;
          const status = trackUploadState[fid];
          const errMsg = trackUploadError[fid];
          return (
            <div key={t.id} className="uu-review-card glass" style={status==='error'?{border:'.5px solid rgba(239,68,68,.4)'}:{}}>
              <div className="uu-review-art-wrap">
                {t.artworkUrl
                  ? <img src={t.artworkUrl} alt="" className="uu-review-art"/>
                  : <div className="uu-review-art uu-art-ph"><Music2 size={20}/></div>
                }
                {status === 'uploading' && <div className="uu-track-status uploading"><div className="uu-card-spinner"/></div>}
                {status === 'done'      && <div className="uu-track-status done"><Check size={12} strokeWidth={3}/></div>}
                {status === 'error'     && <div className="uu-track-status error">!</div>}
              </div>
              <div className="uu-review-info">
                <div className="uu-review-title">{t.title||'Untitled'}</div>
                <div className="uu-review-sub">{t.artist}{t.album?' — '+t.album:''}</div>
                {errMsg
                  ? <div className="uu-review-err">{errMsg}</div>
                  : <div className="uu-review-tags">{[t.genre,t.year,files[i]?.file ? ext(files[i].file) : ''].filter(Boolean).map(v=><span key={v} className="uu-fmt">{v}</span>)}</div>
                }
              </div>
              <button className="uu-review-edit" onClick={()=>{setActive(i);setStep(1);}} disabled={status==='uploading'}><ChevronRight size={16}/></button>
            </div>
          );
        })}
      </div>

      {saveErr && <div className="uu-save-err">{saveErr}</div>}

      <button className="uu-save-full" onClick={saveAll} disabled={!allDone}>
        {!allDone ? (
          <><div className="uu-inline-spinner"/> Uploading {doneCount}/{files.length}…</>
        ) : errorCount > 0 ? (
          <><Check size={18}/> Save {files.length - errorCount} Track{files.length - errorCount !== 1 ? 's' : ''} to Library</>
        ) : (
          <><Check size={18}/> Save {files.length} Track{files.length > 1 ? 's' : ''} to Library</>
        )}
      </button>
    </div>
  );
}
