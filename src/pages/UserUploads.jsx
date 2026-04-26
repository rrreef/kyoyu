import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Upload, Music, Play, Trash2, Lock } from 'lucide-react';
import './UserUploads.css';

export default function UserUploads() {
  const navigate  = useNavigate();
  const fileRef   = useRef();
  const [tracks,  setTracks]  = useState([]);
  const [playing, setPlaying] = useState(null);
  const audioRef  = useRef(new Audio());

  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    const newTracks = files
      .filter(f => f.type.startsWith('audio/'))
      .map(f => ({
        id:   Math.random().toString(36).slice(2),
        name: f.name.replace(/\.[^.]+$/, ''),
        size: (f.size / (1024 * 1024)).toFixed(1) + ' MB',
        url:  URL.createObjectURL(f),
        type: f.type,
      }));
    setTracks(ts => [...ts, ...newTracks]);
  }

  function playTrack(t) {
    if (playing === t.id) {
      audioRef.current.pause();
      setPlaying(null);
    } else {
      audioRef.current.src = t.url;
      audioRef.current.play();
      setPlaying(t.id);
      audioRef.current.onended = () => setPlaying(null);
    }
  }

  function removeTrack(id) {
    setTracks(ts => ts.filter(t => t.id !== id));
    if (playing === id) { audioRef.current.pause(); setPlaying(null); }
  }

  return (
    <div className="page uploads-page animate-in">

      <div className="uploads-header">
        <button className="uploads-back glass" onClick={() => navigate('/profile')}>
          <ChevronLeft size={18} />
        </button>
        <h1>My Uploads</h1>
        <button className="uploads-add-btn glass" onClick={() => fileRef.current.click()}>
          <Upload size={15} /> Add
        </button>
        <input ref={fileRef} type="file" accept="audio/*" multiple style={{ display:'none' }} onChange={handleFiles} />
      </div>

      {/* Privacy note */}
      <div className="uploads-privacy glass">
        <Lock size={13} />
        <span>Files are stored privately on this device only. Never shared or uploaded to servers.</span>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <div className="uploads-empty">
          <div className="uploads-empty-icon"><Music size={36} /></div>
          <div className="uploads-empty-title">No uploads yet</div>
          <div className="uploads-empty-sub">Add audio files from your device to listen privately</div>
          <button className="uploads-cta glass" onClick={() => fileRef.current.click()}>
            <Upload size={16} /> Choose Files
          </button>
        </div>
      ) : (
        <div className="uploads-list">
          {tracks.map(t => (
            <div key={t.id} className={`uploads-track glass${playing===t.id?' playing':''}`}>
              <button className="uploads-play" onClick={() => playTrack(t)}>
                {playing === t.id
                  ? <span className="uploads-eq"><span/><span/><span/></span>
                  : <Play size={16} fill="currentColor" />
                }
              </button>
              <div className="uploads-track-info">
                <div className="uploads-track-name">{t.name}</div>
                <div className="uploads-track-meta">{t.size}</div>
              </div>
              <button className="uploads-remove" onClick={() => removeTrack(t.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
