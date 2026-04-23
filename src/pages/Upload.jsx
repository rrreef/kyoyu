import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload as UploadIcon, Music, FileText, CheckCircle, ChevronRight, X, File, AlertCircle, Image, ChevronLeft, ChevronDown, Loader } from 'lucide-react';
import { uploadRelease } from '../lib/uploadPipeline';
import { AnimatedLogoMark } from './auth/EntryScreen';
import './Upload.css';

/* ─── Constants ─────────────────────────────────────────── */
const STEPS        = ['Audio Files', 'Track Info', 'Credits', 'Pricing', 'Contract', 'Review'];
const ACCEPTED_EXT = ['.wav', '.aiff', '.aif', '.mp3', '.flac'];
const ACCEPTED_MIME = ['audio/wav', 'audio/x-wav', 'audio/aiff', 'audio/x-aiff', 'audio/mpeg', 'audio/flac', 'audio/x-flac'];
const MAX_SIZE_MB   = 500;
const IMG_ACCEPT    = 'image/jpeg,image/png,image/webp,image/tiff';

function formatBytes(b) {
  if (b < 1024)          return b + ' B';
  if (b < 1024 * 1024)   return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
function getExt(name) { return name.split('.').pop().toUpperCase(); }
function stripExt(name) { return name.replace(/\.[^/.]+$/, ''); }
function isAccepted(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXT.includes(ext) || ACCEPTED_MIME.includes(file.type);
}
function emptyMeta() {
  return { title: '', artist: '', album: '', label: '', genre: '', year: String(new Date().getFullYear()), format: 'Digital', description: '', artwork: null, artworkUrl: null, visibility: 'private', credits: [] };
}

/* ─── Metadata extractor (ID3v2, FLAC, AIFF, WAV) ───────── */

function decodeTxt(enc, bytes, s, e) {
  let data = bytes.slice(s, Math.min(e, bytes.length));
  // strip trailing nulls
  let len = data.length;
  if (enc === 1 || enc === 2) { while (len >= 2 && !data[len-1] && !data[len-2]) len -= 2; }
  else                         { while (len > 0  && !data[len-1])                 len--;     }
  try {
    if (enc === 0) return new TextDecoder('iso-8859-1').decode(data.slice(0, len)).trim();
    if (enc === 1 || enc === 2) return new TextDecoder('utf-16').decode(data.slice(0, len)).trim();
    return new TextDecoder('utf-8').decode(data.slice(0, len)).trim();
  } catch { return ''; }
}

function cleanGenre(raw) {
  const m = raw.match(/^\((\d+)\)(.*)$/);
  return m ? (m[2].trim() || raw) : raw.trim();
}

function parseID3v2Into(bytes, view, id3Start, r) {
  const ver   = bytes[id3Start + 3];
  const flags = bytes[id3Start + 5];
  const id3Sz = ((bytes[id3Start+6]&0x7f)<<21)|((bytes[id3Start+7]&0x7f)<<14)
              | ((bytes[id3Start+8]&0x7f)<< 7)| (bytes[id3Start+9]&0x7f);

  let o = id3Start + 10;
  // skip extended header
  if (flags & 0x40) {
    const extSz = ver >= 4
      ? ((bytes[o]&0x7f)<<21)|((bytes[o+1]&0x7f)<<14)|((bytes[o+2]&0x7f)<<7)|(bytes[o+3]&0x7f)
      : view.getUint32(o) + 4;
    o += extSz;
  }
  const end = Math.min(id3Start + 10 + id3Sz, bytes.length);

  while (o + 10 < end) {
    const fid = String.fromCharCode(bytes[o],bytes[o+1],bytes[o+2],bytes[o+3]);
    if (fid === '\x00\x00\x00\x00') break;
    const fsz = ver >= 4
      ? ((bytes[o+4]&0x7f)<<21)|((bytes[o+5]&0x7f)<<14)|((bytes[o+6]&0x7f)<<7)|(bytes[o+7]&0x7f)
      : view.getUint32(o + 4);
    if (fsz <= 0 || fsz > end - o - 10) break;
    o += 10;
    const enc = bytes[o];

    const txt = () => decodeTxt(enc, bytes, o + 1, o + fsz);
    if      (fid==='TIT2' && !r.title)  r.title  = txt();
    else if (fid==='TPE1' && !r.artist) r.artist = txt();
    else if ((fid==='TALB'||fid==='TOAL') && !r.album) r.album = txt();
    else if (fid==='TPUB' && !r.label)  r.label  = txt();
    else if (fid==='TCON' && !r.genre)  r.genre  = cleanGenre(txt());
    else if ((fid==='TDRC'||fid==='TYER') && !r.year) r.year = txt().slice(0,4);
    else if (fid==='TBPM' && !r.bpm)    r.bpm    = txt();
    else if (fid==='APIC' && !r.artworkUrl && fsz > 4) {
      let p = o + 1;
      let mEnd = p; while (mEnd < o+fsz && bytes[mEnd]) mEnd++;
      const mime = String.fromCharCode(...bytes.slice(p, mEnd));
      p = mEnd + 2; // skip null + pic-type
      if (enc===1||enc===2) { while(p+1<o+fsz&&!(bytes[p]===0&&bytes[p+1]===0)) p+=2; p+=2; }
      else                  { while(p<o+fsz&&bytes[p]) p++; p++; }
      const pic = bytes.slice(p, o+fsz);
      if (pic.length > 0) r.artworkUrl = URL.createObjectURL(new Blob([pic],{type:mime||'image/jpeg'}));
    }
    o += fsz;
  }
}

async function extractFileMetadata(file) {
  const r = { title:null, artist:null, album:null, label:null, genre:null, year:null, bpm:null, artworkUrl:null };
  try {
    const buf   = await file.slice(0, 4*1024*1024).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const view  = new DataView(buf);
    const sig4  = o => String.fromCharCode(bytes[o],bytes[o+1],bytes[o+2],bytes[o+3]);

    const hdr = sig4(0);

    // ── AIFF / AIFC (IFF big-endian) ────────────────────────
    if (hdr === 'FORM' && (sig4(8)==='AIFF'||sig4(8)==='AIFC')) {
      // Walk front for small files or chunk headers that fit in the slice
      let o = 12;
      while (o + 8 < bytes.length) {
        const cid = sig4(o);
        const csz = view.getUint32(o + 4);
        o += 8;
        if ((cid==='ID3 '||cid==='id3 ') && bytes[o]===0x49&&bytes[o+1]===0x44&&bytes[o+2]===0x33)
          parseID3v2Into(bytes, view, o, r);
        if (!csz) break;
        o += csz + (csz % 2);
      }
      // AIFF files put audio data (SSND) before tags — the ID3 chunk is almost always
      // at the TAIL of the file, well beyond our front slice.  Read the last 512 KB.
      if (!r.artworkUrl && file.size > buf.byteLength) {
        const TAIL = 512 * 1024;
        const tailStart = Math.max(buf.byteLength, file.size - TAIL);
        const tailBuf   = await file.slice(tailStart).arrayBuffer();
        const tailBytes = new Uint8Array(tailBuf);
        const tailView  = new DataView(tailBuf);
        // Scan for the 4-byte IFF chunk ID 'ID3 ' followed 8 bytes later by ID3v2 'ID3'
        for (let i = 0; i + 12 < tailBytes.length; i++) {
          if (tailBytes[i]===0x49&&tailBytes[i+1]===0x44&&tailBytes[i+2]===0x33&&tailBytes[i+3]===0x20 &&
              tailBytes[i+8]===0x49&&tailBytes[i+9]===0x44&&tailBytes[i+10]===0x33) {
            parseID3v2Into(tailBytes, tailView, i + 8, r);
            break;
          }
        }
      }
    }

    // ── WAV (RIFF little-endian) ───────────────────────────
    else if (hdr === 'RIFF' && sig4(8)==='WAVE') {
      let o = 12;
      while (o + 8 < bytes.length) {
        const cid  = sig4(o);
        const csz  = view.getUint32(o + 4, true); // little-endian
        o += 8;
        if (cid==='id3 '||cid==='ID3 '||cid==='ID32') parseID3v2Into(bytes, view, o, r);
        if (!csz) break;
        o += csz + (csz % 2);
      }
    }

    // ── MP3 (ID3v2 at byte 0) ────────────────────────────
    else if (bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33)
      parseID3v2Into(bytes, view, 0, r);

    // ── FLAC ─────────────────────────────────────────
    else if (bytes[0]===0x66&&bytes[1]===0x4C&&bytes[2]===0x61&&bytes[3]===0x43) {
      let o = 4;
      while (o + 4 < bytes.length) {
        const bb   = bytes[o];
        const isLast  = (bb & 0x80) !== 0;
        const btype   = bb & 0x7f;
        const bsize   = (bytes[o+1]<<16)|(bytes[o+2]<<8)|bytes[o+3];
        o += 4;
        if (btype === 4 && bsize > 8) { // VORBIS_COMMENT
          const vLen = view.getUint32(o, true); let p = o + 4 + vLen;
          const cnt  = view.getUint32(p, true); p += 4;
          for (let i=0; i<cnt && p+4<=o+bsize; i++) {
            const cLen = view.getUint32(p, true); p += 4;
            if (cLen>0 && p+cLen<=o+bsize) {
              const kv  = new TextDecoder('utf-8').decode(bytes.slice(p, p+cLen));
              const eq  = kv.indexOf('=');
              if (eq>0) {
                const k = kv.slice(0,eq).toUpperCase(), v = kv.slice(eq+1).trim();
                if (k==='TITLE'  && !r.title)  r.title  = v;
                if (k==='ARTIST' && !r.artist) r.artist = v;
                if (k==='ALBUM'  && !r.album)  r.album  = v;
                if (k==='LABEL'  && !r.label)  r.label  = v;
                if (k==='GENRE'  && !r.genre)  r.genre  = v;
                if ((k==='DATE'||k==='YEAR') && !r.year) r.year = v.slice(0,4);
                if ((k==='BPM'||k==='TEMPO') && !r.bpm)  r.bpm  = v;
              }
              p += cLen;
            }
          }
        } else if (btype===6 && !r.artworkUrl && bsize>16) { // PICTURE
          let p = o+4;
          const mLen = view.getUint32(p); p+=4;
          const mime = new TextDecoder().decode(bytes.slice(p,p+mLen)); p+=mLen;
          const dLen = view.getUint32(p); p+=4+dLen; p+=16;
          const pLen = view.getUint32(p); p+=4;
          if (pLen>0&&p+pLen<=o+bsize) {
            const pic = bytes.slice(p,p+pLen);
            r.artworkUrl = URL.createObjectURL(new Blob([pic],{type:mime||'image/jpeg'}));
          }
        }
        if (isLast) break;
        o += bsize; // advance past block body
      }
    }
  } catch (_) { /* silently ignore parse errors */ }
  return r;
}

/* ─── Component ─────────────────────────────────────────── */
export default function Upload() {
  const [step,       setStep]       = useState(0);
  const [submitted,  setSubmitted]  = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { track, total, phase }
  const [uploadError,    setUploadError]    = useState(null);
  const [dragging,   setDragging]   = useState(false);
  const [audioFiles, setAudioFiles] = useState([]);  // [{ file, id }]
  const [rejected,   setRejected]   = useState([]);
  const [trackMetas, setTrackMetas] = useState([]);  // one entry per audioFile
  const [activeTrack, setActiveTrack] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* global fields (pricing, credits, contract) */
  const [globalForm, setGlobalForm] = useState({
    producer: '', mastering: '', artworkCredit: '',
    albumPrice: '', downloadPrice: '', vinylPrice: '', streamingEnabled: true, downloadsEnabled: true,
    exclusivity: false,
  });

  const fileInputRef  = useRef(null);
  const artworkRefs   = useRef([]);
  const [audioUrls,  setAudioUrls]  = useState({}); // { id: blobUrl } for in-browser playback

  /* Prevent browser from navigating when a file is dropped anywhere on the page */
  useEffect(() => {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop',     stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop',     stop);
    };
  }, []);

  /* sync artworkRefs array length */
  useEffect(() => { artworkRefs.current = artworkRefs.current.slice(0, audioFiles.length); }, [audioFiles]);

  /* create / revoke blob URLs for in-browser audio playback */
  useEffect(() => {
    setAudioUrls(prev => {
      const next = { ...prev };
      const ids  = new Set(audioFiles.map(f => f.id));
      // revoke removed
      Object.keys(next).forEach(id => { if (!ids.has(id)) { URL.revokeObjectURL(next[id]); delete next[id]; } });
      // create new
      audioFiles.forEach(({ file, id }) => { if (!next[id]) next[id] = URL.createObjectURL(file); });
      return next;
    });
  }, [audioFiles]);

  /* initialise / sync trackMetas — call extractFileMetadata for new files */
  useEffect(() => {
    const prevMap = new Map(trackMetas.map(m => [m.id, m]));
    const next = audioFiles.map(({ file, id }) => prevMap.get(id) ?? { ...emptyMeta(), title: stripExt(file.name), id });
    if (activeTrack >= audioFiles.length && audioFiles.length > 0) setActiveTrack(audioFiles.length - 1);
    setTrackMetas(next);

    // Hydrate metadata from embedded tags for brand-new files
    audioFiles.forEach(({ file, id }) => {
      if (prevMap.has(id)) return;
      extractFileMetadata(file).then(meta => {
        setTrackMetas(prev => prev.map(m => {
          if (m.id !== id) return m;
          return {
            ...m,
            title:      meta.title  || m.title,
            artist:     meta.artist || m.artist,
            label:      meta.label  || m.label,
            genre:      meta.genre  || m.genre,
            year:       meta.year   || m.year,
            // Only set artwork if not already manually set
            artworkUrl: m.artworkUrl || meta.artworkUrl || null,
            album:      meta.album  || '', // album / release title
          };
        }));
      });
    });
  }, [audioFiles]);

  /* revoke object URLs on unmount */
  useEffect(() => {
    return () => { trackMetas.forEach(m => { if (m.artworkUrl) URL.revokeObjectURL(m.artworkUrl); }); };
  }, []);

  /* ── Audio file handling ─────────────────────────────── */
  function processFiles(fileList) {
    const incoming = Array.from(fileList);
    const ok  = incoming.filter(f => isAccepted(f) && f.size <= MAX_SIZE_MB * 1024 * 1024);
    const bad = incoming.filter(f => !isAccepted(f) || f.size > MAX_SIZE_MB * 1024 * 1024);
    setAudioFiles(prev => {
      const existingNames = new Set(prev.map(f => f.file.name));
      const newOnes = ok.filter(f => !existingNames.has(f.name))
                        .map(f => ({ file: f, id: Math.random().toString(36).slice(2) }));
      return [...prev, ...newOnes];
    });
    if (bad.length) {
      setRejected(bad.map(f => ({ name: f.name, reason: !isAccepted(f) ? 'Unsupported format' : `Exceeds ${MAX_SIZE_MB} MB` })));
      setTimeout(() => setRejected([]), 5000);
    }
  }
  function handleDragOver(e)  { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }
  function handleDrop(e)  { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }
  function handlePick(e)  { processFiles(e.target.files); e.target.value = ''; }
  function removeFile(id) { setAudioFiles(prev => prev.filter(f => f.id !== id)); }

  /* ── Per-track metadata helpers ──────────────────────── */
  function updateMeta(idx, field, value) {
    setTrackMetas(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }
  function handleArtworkPick(idx, e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setTrackMetas(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      if (m.artworkUrl) URL.revokeObjectURL(m.artworkUrl);
      return { ...m, artwork: file, artworkUrl: url };
    }));
    e.target.value = '';
  }
  function removeArtwork(idx) {
    setTrackMetas(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      if (m.artworkUrl) URL.revokeObjectURL(m.artworkUrl);
      return { ...m, artwork: null, artworkUrl: null };
    }));
  }
  function copyFieldToAll(field, value) {
    setTrackMetas(prev => prev.map(m => ({ ...m, [field]: value })));
  }
  function updateGlobal(field, value) { setGlobalForm(prev => ({ ...prev, [field]: value })); }

  /* ── Per-track credits ───────────────────────────────── */
  function addCredit(trackIdx) {
    setTrackMetas(prev => prev.map((m, i) => i !== trackIdx ? m : {
      ...m, credits: [...(m.credits||[]), { id: Math.random().toString(36).slice(2), role: '', name: '' }]
    }));
  }
  function removeCredit(trackIdx, ci) {
    setTrackMetas(prev => prev.map((m, i) => i !== trackIdx ? m : {
      ...m, credits: (m.credits||[]).filter((_, j) => j !== ci)
    }));
  }
  function updateCredit(trackIdx, ci, field, value) {
    setTrackMetas(prev => prev.map((m, i) => i !== trackIdx ? m : {
      ...m, credits: (m.credits||[]).map((c, j) => j !== ci ? c : { ...c, [field]: value })
    }));
  }
  /** Copies the active track's credits to every other track (fresh IDs) */
  function copyCreditsToAll() {
    const src = trackMetas[activeTrack]?.credits || [];
    if (!src.length) return;
    setTrackMetas(prev => prev.map((m, i) => {
      if (i === activeTrack) return m;
      return { ...m, credits: src.map(c => ({ ...c, id: Math.random().toString(36).slice(2) })) };
    }));
  }
  const totalCredits = trackMetas.reduce((s, m) => s + (m.credits?.length || 0), 0);

  /* ── Navigation ──────────────────────────────────────── */
  function goNext() { setStep(s => s + 1); setActiveTrack(0); }
  function goBack() { setStep(s => s - 1); }

  /* ── Real upload handler ─────────────────────────────── */
  async function handleSubmitRelease() {
    setUploadError(null);
    setUploading(true);
    try {
      await uploadRelease({
        audioFiles,
        trackMetas,
        globalForm,
        onProgress: (p) => setUploadProgress(p),
      });
      setSubmitted(true);
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  /* ── Cancel / force-reset upload state ──────────────────── */
  function cancelUpload() {
    setUploading(false);
    setUploadProgress(null);
    setUploadError(null);
  }

  /* ── Uploading screen ────────────────────────────────── */
  if (uploading || (uploadError && !uploading === false)) { /* keep screen until user dismisses */ }
  if (uploading) {
    const phases = ['audio', 'artwork', 'saving'];
    const phaseLabels = {
      audio:   'Uploading audio file',
      artwork: 'Uploading artwork',
      saving:  'Saving to catalog',
    };
    const currentPhase = uploadProgress?.phase || 'audio';
    const trackNum  = uploadProgress ? uploadProgress.track + 1 : 1;
    const total     = Math.max(1, uploadProgress?.total ?? audioFiles.length);
    const phaseIdx  = Math.max(0, phases.indexOf(currentPhase));
    const overallPct = Math.min(99, Math.round(((trackNum - 1) / total + (phaseIdx + 0.5) / (phases.length * total)) * 100));
    const circumference = 2 * Math.PI * 36;

    return (
      <div className="upload-loading-screen animate-in">
        <div className="upload-loading-card glass">

          {uploadError ? (
            /* ── Error state inside loading card ── */
            <>
              <div className="upload-loading-error-icon">
                <AlertCircle size={36} style={{ color: 'rgba(255,100,100,0.85)' }} />
              </div>
              <div className="upload-loading-text">
                <h3 style={{ color: 'rgba(255,120,120,0.9)' }}>Upload Failed</h3>
                <p style={{ maxWidth: 280, textAlign: 'center' }}>{uploadError}</p>
              </div>
              <button className="upload-cancel-btn" onClick={cancelUpload}>
                ← Try Again
              </button>
            </>
          ) : (
            /* ── Normal progress state ── */
            <>
              <div className="upload-logo-ring">
                <svg className="upload-ring-svg" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" className="upload-ring-track" />
                  <circle
                    cx="40" cy="40" r="36"
                    className="upload-ring-fill"
                    style={{ strokeDashoffset: circumference - (circumference * overallPct / 100) }}
                  />
                </svg>
                <div className="upload-logo-center">
                  <AnimatedLogoMark size={28} spin={false} />
                </div>
              </div>

              <div className="upload-loading-text">
                <h3>Uploading{total > 1 ? ` — Track ${trackNum} / ${total}` : ''}</h3>
                <p>{phaseLabels[currentPhase] || 'Preparing…'}</p>
              </div>

              <div className="upload-loading-pct">{overallPct}%</div>
              <p className="upload-progress-note">Do not close this tab.</p>
              <button className="upload-cancel-btn upload-cancel-btn--subtle" onClick={cancelUpload}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Success screen ──────────────────────────────────── */
  if (submitted) {
    return (
      <div className="page upload-page upload-page--success animate-in">
        <div className="upload-success glass">
          <CheckCircle size={56} />
          <h2>Release Submitted!</h2>
          <p>Our team will verify the metadata and audio quality within 48 hours. You'll receive a notification when it's live.</p>
          <div className="upload-success-files">
            {audioFiles.map(({ file, id }, i) => (
              <div key={id} className="upload-success-file">
                {trackMetas[i]?.artworkUrl
                  ? <img src={trackMetas[i].artworkUrl} alt="" className="success-thumb" />
                  : <div className="success-thumb success-thumb--empty"><Music size={12} /></div>}
                <span className="file-ext-pill">{getExt(file.name)}</span>
                <span className="success-track-name">{trackMetas[i]?.title || file.name}</span>
              </div>
            ))}
          </div>
          <button className="upload-success-btn" onClick={() => { setSubmitted(false); setAudioFiles([]); setTrackMetas([]); setStep(0); }}>
            Upload Another Release
          </button>
        </div>
      </div>
    );
  }

  const meta = trackMetas[activeTrack] || emptyMeta();

  return (
    <div className="page upload-page animate-in">
      <div className="upload-header">
        <h1>Upload a Release</h1>
        <p>Your music. Your terms. Upload and distribute in minutes.</p>
      </div>

      {/* Progress */}
      <div className="upload-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`upload-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            <div className="upload-step-num">{i < step ? '✓' : i + 1}</div>
            <div className="upload-step-label">{s}</div>
          </div>
        ))}
      </div>

      <div className="upload-form glass">

        {/* ── STEP 0: Audio Files ───────────────────────── */}
        {step === 0 && (
          <div className="upload-step-content">
            <h3>Upload Audio Files</h3>
            <p className="step-intro">Drop your tracks below. WAV and AIFF recommended for best quality.</p>
            <input ref={fileInputRef} type="file" multiple accept=".wav,.aiff,.aif,.mp3,.flac" onChange={handlePick} style={{ display: 'none' }} />

            <div
              className={`upload-audio-drop ${dragging ? 'dragging' : ''} ${audioFiles.length > 0 ? 'has-files' : ''}`}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Upload audio files"
            >
              <UploadIcon size={32} strokeWidth={1.5} className="drop-icon" />
              <div className="upload-drop-text">{dragging ? 'Drop to add files' : 'Drag & drop your tracks here'}</div>
              <div className="upload-drop-sub">WAV · AIFF · FLAC · MP3 &nbsp;·&nbsp; Max {MAX_SIZE_MB} MB per file &nbsp;·&nbsp; Multiple files supported</div>
              <button className="upload-drop-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>Browse Files</button>
            </div>

            {rejected.length > 0 && (
              <div className="upload-rejected">
                {rejected.map((r, i) => (
                  <div key={i} className="rejected-item"><AlertCircle size={14} /><span><strong>{r.name}</strong> — {r.reason}</span></div>
                ))}
              </div>
            )}

            {audioFiles.length > 0 && (
              <div className="upload-file-list">
                <div className="upload-file-list-header">
                  <span>{audioFiles.length} track{audioFiles.length > 1 ? 's' : ''} ready</span>
                  <button className="upload-add-more" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>+ Add more</button>
                </div>
                {audioFiles.map(({ file, id }, idx) => (
                  <div key={id} className="file-item">
                    <div className="file-item-num">{idx + 1}</div>
                    <div className="file-item-icon"><File size={14} /></div>
                    <div className="file-item-info">
                      <div className="file-item-name">{file.name}</div>
                      <div className="file-item-meta">
                        <span className="file-ext-pill">{getExt(file.name)}</span>
                        <span className="file-size">{formatBytes(file.size)}</span>
                      </div>
                    </div>
                    <button className="file-item-remove" onClick={() => removeFile(id)} aria-label={`Remove ${file.name}`}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {audioFiles.length === 0 && (
              <div className="upload-format-note"><Music size={13} /><span>For DJ downloads, use lossless WAV or AIFF (44.1 kHz / 16-bit minimum)</span></div>
            )}
          </div>
        )}

        {/* ── STEP 1: Track Info (per-track) ───────────── */}
        {step === 1 && (
          <div className="upload-step-content">
            <h3>Track Info</h3>
            <p className="step-intro">
              {audioFiles.length > 1
                ? `Fill in metadata for each track separately. You can copy shared values to all tracks.`
                : 'Fill in the metadata for your track.'}
            </p>

            {/* Track selector tabs */}
            {audioFiles.length > 1 && (
              <div className="track-tabs">
                {audioFiles.map(({ file, id }, i) => (
                  <button
                    key={id}
                    className={`track-tab ${i === activeTrack ? 'active' : ''} ${trackMetas[i]?.artworkUrl ? 'has-art' : ''}`}
                    onClick={() => setActiveTrack(i)}
                  >
                    {trackMetas[i]?.artworkUrl
                      ? <img src={trackMetas[i].artworkUrl} alt="" className="track-tab-thumb" />
                      : <div className="track-tab-num">{i + 1}</div>}
                    <span className="track-tab-label">{trackMetas[i]?.title || stripExt(file.name)}</span>
                    <span className="track-tab-ext">{getExt(file.name)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Per-track form */}
            {audioFiles.length > 0 && (
              <div className="track-form-layout">
                {/* Artwork column */}
                <div className="track-artwork-col">
                  <div className="artwork-label">Artwork</div>
                  <input
                    type="file"
                    accept={IMG_ACCEPT}
                    style={{ display: 'none' }}
                    ref={el => artworkRefs.current[activeTrack] = el}
                    onChange={e => handleArtworkPick(activeTrack, e)}
                  />
                  {meta.artworkUrl ? (
                    <div className="artwork-preview-wrap">
                      <img src={meta.artworkUrl} alt="Artwork" className="artwork-preview-img" />
                      <div className="artwork-preview-actions">
                        <button className="artwork-change-btn" onClick={() => artworkRefs.current[activeTrack]?.click()}>Replace</button>
                        <button className="artwork-remove-btn" onClick={() => removeArtwork(activeTrack)}><X size={12} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="artwork-upload-box" onClick={() => artworkRefs.current[activeTrack]?.click()}>
                      <Image size={28} strokeWidth={1.5} />
                      <span>Upload artwork</span>
                      <span className="artwork-hint">JPG, PNG, WebP · min 800×800</span>
                    </div>
                  )}

                  {/* Track file info + inline player */}
                  <div className="track-file-chip">
                    <File size={12} />
                    <span>{audioFiles[activeTrack]?.file.name}</span>
                  </div>
                  <div className="track-file-chip track-file-chip--sub">
                    <span className="file-ext-pill">{getExt(audioFiles[activeTrack]?.file?.name ?? '')}</span>
                    <span>{formatBytes(audioFiles[activeTrack]?.file.size ?? 0)}</span>
                  </div>

                  {/* Inline audio player */}
                  {audioUrls[audioFiles[activeTrack]?.id] && (
                    <audio
                      key={audioFiles[activeTrack]?.id}
                      controls
                      src={audioUrls[audioFiles[activeTrack].id]}
                      className="track-inline-player"
                    />
                  )}

                  {/* Visibility toggle */}
                  <div className="visibility-row">
                    <div className="visibility-toggle visibility-toggle--full">
                      <button
                        className={`vis-btn ${meta.visibility === 'private' ? 'active' : ''}`}
                        onClick={() => updateMeta(activeTrack, 'visibility', 'private')}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Private
                      </button>
                      <button
                        className={`vis-btn ${meta.visibility === 'public' ? 'active active--pub' : ''}`}
                        onClick={() => updateMeta(activeTrack, 'visibility', 'public')}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        Public
                      </button>
                    </div>
                  </div>
                </div>

                {/* Metadata column */}
                <div className="track-meta-col">
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Track Title *</label>
                      <input type="text" placeholder="Track name" value={meta.title} onChange={e => updateMeta(activeTrack, 'title', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>
                        Artist / Band Name *
                        {audioFiles.length > 1 && (
                          <button className="copy-all-btn" onClick={() => copyFieldToAll('artist', meta.artist)} title="Copy to all tracks">Copy to all</button>
                        )}
                      </label>
                      <input type="text" placeholder="Artist name on Reef" value={meta.artist} onChange={e => updateMeta(activeTrack, 'artist', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>
                        Album / Release Title
                        {audioFiles.length > 1 && (
                          <button className="copy-all-btn" onClick={() => copyFieldToAll('album', meta.album)} title="Copy to all tracks">Copy to all</button>
                        )}
                      </label>
                      <input type="text" placeholder="Album or EP name" value={meta.album || ''} onChange={e => updateMeta(activeTrack, 'album', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>
                        Label
                        {audioFiles.length > 1 && (
                          <button className="copy-all-btn" onClick={() => copyFieldToAll('label', meta.label)} title="Copy to all tracks">Copy to all</button>
                        )}
                      </label>
                      <input type="text" placeholder="Label or 'Self-Released'" value={meta.label} onChange={e => updateMeta(activeTrack, 'label', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>
                        Genre
                        {audioFiles.length > 1 && (
                          <button className="copy-all-btn" onClick={() => copyFieldToAll('genre', meta.genre)} title="Copy to all tracks">Copy to all</button>
                        )}
                      </label>
                      <input type="text" placeholder="e.g. Techno, Jazz, Hip-Hop" value={meta.genre} onChange={e => updateMeta(activeTrack, 'genre', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>Release Year</label>
                      <input type="number" placeholder="2026" value={meta.year} onChange={e => updateMeta(activeTrack, 'year', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>
                        Format
                        {audioFiles.length > 1 && (
                          <button className="copy-all-btn" onClick={() => copyFieldToAll('format', meta.format)}>Copy to all</button>
                        )}
                      </label>
                      <select value={meta.format} onChange={e => updateMeta(activeTrack, 'format', e.target.value)}>
                        <option>Digital</option>
                        <option>Vinyl 12"</option>
                        <option>Vinyl LP</option>
                        <option>Digital + Vinyl</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Description</label>
                    <textarea
                      placeholder="Recording context, themes, story behind this track..."
                      value={meta.description}
                      onChange={e => updateMeta(activeTrack, 'description', e.target.value)}
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Multi-track navigation */}
            {audioFiles.length > 1 && (
              <div className="track-nav-arrows">
                <button
                  className="track-nav-btn"
                  disabled={activeTrack === 0}
                  onClick={() => setActiveTrack(i => i - 1)}
                >
                  <ChevronLeft size={14} /> Prev track
                </button>
                <span className="track-nav-counter">{activeTrack + 1} / {audioFiles.length}</span>
                <button
                  className="track-nav-btn"
                  disabled={activeTrack === audioFiles.length - 1}
                  onClick={() => setActiveTrack(i => i + 1)}
                >
                  Next track <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Credits ──────────────────────────── */}
        {step === 2 && (
          <div className="upload-step-content">
            <h3>Release Credits</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>Producer</label>
                <input type="text" placeholder="Who produced this release?" value={globalForm.producer} onChange={e => updateGlobal('producer', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Mastering Engineer</label>
                <input type="text" placeholder="Engineer name and studio" value={globalForm.mastering} onChange={e => updateGlobal('mastering', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Artwork / Design Credit</label>
                <input type="text" placeholder="Designer or photographer" value={globalForm.artworkCredit} onChange={e => updateGlobal('artworkCredit', e.target.value)} />
              </div>
            </div>

            {/* Advanced credits toggle */}
            <button
              className={`advanced-toggle ${showAdvanced ? 'open' : ''}`}
              onClick={() => setShowAdvanced(s => !s)}
            >
              <ChevronDown size={13} className="adv-chevron" />
              <span>Advanced Credits</span>
              {totalCredits > 0 && <span className="adv-badge">{totalCredits}</span>}
            </button>

            {/* Expandable panel */}
            <div className={`advanced-panel ${showAdvanced ? 'expanded' : ''}`}>
              <div className="advanced-panel-inner">

                {/* Track selector (only for multi-track) */}
                {audioFiles.length > 1 && (
                  <div className="adv-track-tabs">
                    {audioFiles.map(({ file, id }, i) => (
                      <button
                        key={id}
                        className={`adv-track-tab ${i === activeTrack ? 'active' : ''}`}
                        onClick={() => setActiveTrack(i)}
                      >
                        <span className="adv-tab-num">{i + 1}</span>
                        <span>{trackMetas[i]?.title || stripExt(file.name)}</span>
                        {(trackMetas[i]?.credits?.length || 0) > 0 && (
                          <span className="adv-badge sm">{trackMetas[i].credits.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Per-track credit rows */}
                <div className="ptc-section">
                  <div className="ptc-header">
                    <span className="ptc-title">
                      {audioFiles.length > 1
                        ? `${trackMetas[activeTrack]?.title || `Track ${activeTrack + 1}`} — Performers & Crew`
                        : 'Performers & Crew'}
                    </span>
                    <span className="ptc-hint">Musicians, session players, mixing &amp; mastering</span>
                    {audioFiles.length > 1 && (trackMetas[activeTrack]?.credits?.length || 0) > 0 && (
                      <button
                        className="copy-all-btn ptc-copy-all"
                        onClick={copyCreditsToAll}
                        title="Copy these credits to all other tracks"
                      >
                        Copy to all tracks
                      </button>
                    )}
                  </div>

                  {(trackMetas[activeTrack]?.credits || []).map((credit, ci) => (
                    <div key={credit.id} className="credit-row">
                      <input
                        type="text"
                        className="credit-role"
                        placeholder="Role (Guitar, Mixing…)"
                        value={credit.role}
                        onChange={e => updateCredit(activeTrack, ci, 'role', e.target.value)}
                      />
                      <input
                        type="text"
                        className="credit-name"
                        placeholder="Details (name, studio...)"
                        value={credit.name}
                        onChange={e => updateCredit(activeTrack, ci, 'name', e.target.value)}
                      />
                      <button className="credit-remove-btn" onClick={() => removeCredit(activeTrack, ci)} aria-label="Remove credit">
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  <button className="add-credit-btn" onClick={() => addCredit(activeTrack)}>
                    + Add performer / crew
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Pricing ──────────────────────────── */}
        {step === 3 && (
          <div className="upload-step-content">
            <h3>Pricing &amp; Distribution</h3>
            <div className="pricing-toggles">
              <div className="pricing-toggle-row glass-sm">
                <div>
                  <div className="toggle-label">Streaming</div>
                  <div className="toggle-sub">Available to all Reef subscribers</div>
                </div>
                <button className={`toggle-btn ${globalForm.streamingEnabled ? 'on' : ''}`} onClick={() => updateGlobal('streamingEnabled', !globalForm.streamingEnabled)}>
                  {globalForm.streamingEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <div className="pricing-toggle-row glass-sm">
                <div>
                  <div className="toggle-label">DJ Downloads</div>
                  <div className="toggle-sub">Paid per-track downloads in professional formats</div>
                </div>
                <button className={`toggle-btn ${globalForm.downloadsEnabled ? 'on' : ''}`} onClick={() => updateGlobal('downloadsEnabled', !globalForm.downloadsEnabled)}>
                  {globalForm.downloadsEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
            {globalForm.downloadsEnabled && (
              <div className="pricing-download-fields">
                <div className="form-field">
                  <label>Album Price (Download Bundle)</label>
                  <div className="price-input-wrap">
                    <span className="price-currency">€</span>
                    <input type="number" step="0.10" min="0" max="50.00" placeholder="" value={globalForm.albumPrice} onChange={e => updateGlobal('albumPrice', e.target.value)} />
                  </div>
                </div>
                <div className="form-field">
                  <label>Price per Track (Download)</label>
                  <div className="price-input-wrap">
                    <span className="price-currency">€</span>
                    <input type="number" step="0.10" min="0" max="5.00" placeholder="" value={globalForm.downloadPrice} onChange={e => updateGlobal('downloadPrice', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Contract ─────────────────────────── */}
        {step === 4 && (
          <div className="upload-step-content">
            <h3>Digital Contract</h3>
            <div className="contract-options">
              <div className={`contract-option glass ${!globalForm.exclusivity ? 'selected-contract' : ''}`} onClick={() => updateGlobal('exclusivity', false)}>
                <div className="contract-opt-header">
                  <div className="contract-opt-name">Standard — 70/30</div>
                  <div className="contract-opt-indicator">{!globalForm.exclusivity ? '✓ Selected' : ''}</div>
                </div>
                <ul className="contract-opt-features">
                  <li>Keep your music on all platforms</li>
                  <li>70% of streaming royalties</li>
                  <li>100% of download &amp; vinyl revenue (minus Reef 10%)</li>
                  <li>Cancel anytime with 30 days notice</li>
                </ul>
              </div>
              <div className={`contract-option glass ${globalForm.exclusivity ? 'selected-contract' : ''}`} onClick={() => updateGlobal('exclusivity', true)}>
                <div className="contract-opt-header">
                  <div className="contract-opt-name">Exclusive — 90/10</div>
                  <div className="contract-opt-indicator">{globalForm.exclusivity ? '✓ Selected' : ''}</div>
                </div>
                <ul className="contract-opt-features">
                  <li>Remove your catalog from all other platforms</li>
                  <li>90% of streaming royalties (20% more)</li>
                  <li>Priority placement and editorial support</li>
                  <li>Promotional support from Reef team</li>
                </ul>
              </div>
            </div>
            <div className="contract-consent glass-sm">
              By clicking Submit, you confirm you own the rights to this content and agree to the Reef Distribution Terms. A signed digital copy will be emailed to you.
            </div>
          </div>
        )}

        {/* ── STEP 5: Review ───────────────────────────── */}
        {step === 5 && (
          <div className="upload-step-content">
            <h3>Review &amp; Submit</h3>
            <div className="review-track-list">
              {audioFiles.map(({ file, id }, i) => {
                const m = trackMetas[i] || emptyMeta();
                return (
                  <div key={id} className="review-track-card glass-sm">
                    <div className="review-track-top">
                      {m.artworkUrl
                        ? <img src={m.artworkUrl} alt="" className="review-thumb" />
                        : <div className="review-thumb review-thumb--empty"><Music size={14} /></div>}
                      <div className="review-track-head">
                        <div className="review-track-title">{m.title || file.name}</div>
                        <div className="review-track-sub">
                          <span className="file-ext-pill sm">{getExt(file.name)}</span>
                          <span>{formatBytes(file.size)}</span>
                          {m.artist && <span>· {m.artist}</span>}
                          {m.genre && <span>· {m.genre}</span>}
                        </div>
                      </div>
                      <button className="review-edit-btn" onClick={() => { setStep(1); setActiveTrack(i); }}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="review-grid glass-sm">
              <div className="review-row"><span>Streaming</span><span>{globalForm.streamingEnabled ? 'Enabled' : 'Disabled'}</span></div>
              <div className="review-row"><span>Downloads</span><span>{globalForm.downloadsEnabled ? `€${globalForm.downloadPrice}/track` : 'Disabled'}</span></div>
              <div className="review-row"><span>Contract</span><span>{globalForm.exclusivity ? 'Exclusive (90/10)' : 'Standard (70/30)'}</span></div>
            </div>
          </div>
        )}

        {/* ── Navigation ───────────────────────────────── */}
        <div className="upload-nav">
          {step > 0 && <button className="upload-back-btn" onClick={goBack}>Back</button>}
          {step < STEPS.length - 1 ? (
            <button className="upload-next-btn" onClick={goNext} disabled={step === 0 && audioFiles.length === 0}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
          <button className="upload-next-btn" onClick={handleSubmitRelease} disabled={audioFiles.length === 0}>
            Submit Release
          </button>
          )}
        </div>
        {uploadError && (
          <div className="upload-error-banner">
            <AlertCircle size={14} /> {uploadError}
          </div>
        )}
      </div>
    </div>
  );
}
