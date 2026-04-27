import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, Music2, Play, Pause, Trash2, Lock,
  ChevronDown, Check, X, ImagePlus, Disc3,
} from 'lucide-react';
import * as mm from 'music-metadata-browser';
import './UserUploads.css';

const ACCEPT = '.mp3,.wav,.flac,.aiff,.aif,audio/*';
const FORMATS = ['FLAC', 'WAV', 'AIFF', 'MP3'];

// ── Metadata extraction ──────────────────────────────────────
async function extractMeta(file) {
  try {
    const meta = await mm.parseBlob(file, { skipCovers: false, duration: false });
    const c = meta.common;

    let artworkUrl = null;
    if (c.picture?.length) {
      const pic = c.picture[0];
      const blob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
      artworkUrl = URL.createObjectURL(blob);
    }

    const ext = file.name.split('.').pop().toUpperCase();
    return {
      title:            c.title            || file.name.replace(/\.[^.]+$/, ''),
      artist:           c.artist           || '',
      album:            c.album            || '',
      genre:            c.genre?.[0]       || '',
      year:             c.year?.toString() || '',
      label:            c.label?.[0]       || '',
      mixingEngineer:   c.engineer         || '',
      masteringEngineer:'',
      artworkUrl,
      format: ext,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      fileUrl: URL.createObjectURL(file),
    };
  } catch {
    const ext = file.name.split('.').pop().toUpperCase();
    return {
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: '', album: '', genre: '', year: '',
      label: '', mixingEngineer: '', masteringEngineer: '',
      artworkUrl: null,
      format: ext,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      fileUrl: URL.createObjectURL(file),
    };
  }
}

// ── Field row component ──────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="uu-field">
      <label className="uu-field-label">{label}</label>
      <input
        className="uu-field-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || label}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function UserUploads() {
  const navigate = useNavigate();
  const fileRef  = useRef();
  const audioRef = useRef(new Audio());

  const [tracks,   setTracks]   = useState([]);
  const [playing,  setPlaying]  = useState(null);
  const [stage,    setStage]    = useState('list');   // 'list' | 'processing' | 'review'
  const [draft,    setDraft]    = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [dragging, setDragging] = useState(false);

  // ── File handling ────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('audio/')) return;
    setStage('processing');
    const meta = await extractMeta(file);
    setDraft({ ...meta, id: Math.random().toString(36).slice(2) });
    setStage('review');
  }, []);

  function onFileInput(e) {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  // ── Draft helpers ────────────────────────────────────────
  function setField(key) { return val => setDraft(d => ({ ...d, [key]: val })); }

  function saveDraft() {
    setTracks(ts => [draft, ...ts]);
    setDraft(null);
    setStage('list');
    setAdvanced(false);
  }

  function cancelDraft() {
    setDraft(null);
    setStage('list');
    setAdvanced(false);
  }

  // ── Playback ─────────────────────────────────────────────
  function togglePlay(t) {
    if (playing === t.id) {
      audioRef.current.pause();
      setPlaying(null);
    } else {
      audioRef.current.src = t.fileUrl;
      audioRef.current.play();
      setPlaying(t.id);
      audioRef.current.onended = () => setPlaying(null);
    }
  }

  function removeTrack(id) {
    setTracks(ts => ts.filter(t => t.id !== id));
    if (playing === id) { audioRef.current.pause(); setPlaying(null); }
  }

  // ── REVIEW STAGE ────────────────────────────────────────
  if (stage === 'review' && draft) {
    return (
      <div className="page uu-page animate-in">
        <div className="uu-review-header">
          <button className="uu-icon-btn" onClick={cancelDraft}><X size={18} /></button>
          <span className="uu-review-title">Review Track</span>
          <button className="uu-save-btn" onClick={saveDraft}>
            <Check size={15} /> Save
          </button>
        </div>

        <div className="uu-review-scroll">
          {/* Artwork */}
          <div className="uu-artwork-wrap">
            {draft.artworkUrl
              ? <img src={draft.artworkUrl} alt="artwork" className="uu-artwork-img" />
              : (
                <div className="uu-artwork-placeholder">
                  <Disc3 size={48} strokeWidth={1} />
                  <span>No artwork</span>
                </div>
              )
            }
            <div className="uu-format-badge">{draft.format}</div>
          </div>

          {/* Core fields */}
          <div className="uu-fields glass">
            <Field label="Title"  value={draft.title}  onChange={setField('title')}  placeholder="Track title" />
            <Field label="Artist" value={draft.artist} onChange={setField('artist')} placeholder="Artist name" />
            <Field label="Album"  value={draft.album}  onChange={setField('album')}  placeholder="Album name" />
            <Field label="Genre"  value={draft.genre}  onChange={setField('genre')}  placeholder="Genre" />
            <Field label="Year"   value={draft.year}   onChange={setField('year')}   placeholder="Year" type="number" />
          </div>

          {/* Advanced settings */}
          <button className="uu-advanced-toggle" onClick={() => setAdvanced(a => !a)}>
            <span>Advanced Settings</span>
            <ChevronDown size={16} className={`uu-chevron${advanced ? ' open' : ''}`} />
          </button>

          {advanced && (
            <div className="uu-fields glass uu-fields-advanced animate-in">
              <Field label="Mixing Engineer"    value={draft.mixingEngineer}    onChange={setField('mixingEngineer')}    placeholder="Name" />
              <Field label="Mastering Engineer" value={draft.masteringEngineer} onChange={setField('masteringEngineer')} placeholder="Name" />
              <Field label="Label"              value={draft.label}             onChange={setField('label')}             placeholder="Record label" />
            </div>
          )}

          <button className="uu-save-full-btn" onClick={saveDraft}>
            <Check size={18} /> Save Track
          </button>
        </div>
      </div>
    );
  }

  // ── PROCESSING STAGE ────────────────────────────────────
  if (stage === 'processing') {
    return (
      <div className="page uu-page animate-in">
        <div className="uu-processing">
          <div className="uu-spinner" />
          <span>Reading metadata…</span>
        </div>
      </div>
    );
  }

  // ── LIST STAGE ───────────────────────────────────────────
  return (
    <div className="page uu-page animate-in">
      <div className="uu-header">
        <h1>My Uploads</h1>
        <button className="uu-add-btn glass" onClick={() => fileRef.current.click()}>
          <Upload size={14} /> Add
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={onFileInput}
      />

      {/* Drop zone */}
      <div
        className={`uu-dropzone glass${dragging ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
      >
        <div className="uu-drop-icon">
          <Upload size={26} strokeWidth={1.5} />
        </div>
        <div className="uu-drop-title">Drop an audio file</div>
        <div className="uu-drop-formats">
          {FORMATS.map(f => <span key={f} className="uu-format-pill">{f}</span>)}
        </div>
      </div>

      {/* Privacy note */}
      <div className="uu-privacy">
        <Lock size={11} />
        <span>Stored privately on this device · Never uploaded to servers</span>
      </div>

      {/* Track list */}
      {tracks.length > 0 && (
        <div className="uu-list">
          {tracks.map(t => (
            <div key={t.id} className={`uu-track glass${playing === t.id ? ' playing' : ''}`}>
              {t.artworkUrl
                ? <img src={t.artworkUrl} alt="" className="uu-track-art" />
                : <div className="uu-track-art-placeholder"><Music2 size={16} /></div>
              }
              <div className="uu-track-info">
                <div className="uu-track-title">{t.title}</div>
                <div className="uu-track-sub">{[t.artist, t.format, t.size].filter(Boolean).join(' · ')}</div>
              </div>
              <button className="uu-play-btn" onClick={() => togglePlay(t)}>
                {playing === t.id
                  ? <Pause size={15} fill="currentColor" />
                  : <Play  size={15} fill="currentColor" />
                }
              </button>
              <button className="uu-del-btn" onClick={() => removeTrack(t.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tracks.length === 0 && (
        <div className="uu-empty">
          <Music2 size={32} strokeWidth={1.2} />
          <div>No uploads yet</div>
          <div className="uu-empty-sub">Your private music lives here</div>
        </div>
      )}
    </div>
  );
}
