import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import './InlinePlayer.css';

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function Waveform({ active }) {
  return (
    <div className={`ip-wave${active ? ' playing' : ''}`}>
      {[0,1,2,3].map(i => <span key={i} style={{ '--i': i }} />)}
    </div>
  );
}

export default function InlinePlayer({ src, artworkUrl, title, artist }) {
  const audioRef    = useRef(null);
  const [playing,   setPlaying]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [dragging,  setDragging]  = useState(false);

  /* sync when src changes */
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [src]);

  function onLoaded() { setDuration(audioRef.current?.duration || 0); }
  function onTimeUpdate() {
    if (!dragging) setProgress(audioRef.current?.currentTime || 0);
  }
  function onEnded() { setPlaying(false); setProgress(0); }

  function toggle() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  }

  function skip(delta) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
  }

  /* scrubber helpers */
  function onScrub(e) {
    const pct = Number(e.target.value) / 1000;
    const t   = pct * duration;
    setProgress(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  }

  const pct = duration ? (progress / duration) * 1000 : 0;

  return (
    <div className="ip-card">
      {/* hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />

      {/* Prismatic border overlay */}
      <div className="ip-prism" />

      {/* Artwork blur backdrop */}
      {artworkUrl && (
        <div className="ip-art-bg" style={{ backgroundImage: `url(${artworkUrl})` }} />
      )}

      {/* Top row: artwork + info + waveform */}
      <div className="ip-header">
        {artworkUrl
          ? <img src={artworkUrl} alt="" className="ip-art" />
          : <div className="ip-art ip-art-ph" />
        }
        <div className="ip-info">
          <div className="ip-title">{title || 'Untitled'}</div>
          <div className="ip-artist">{artist || 'Unknown Artist'}</div>
        </div>
        <Waveform active={playing} />
      </div>

      {/* Scrubber */}
      <div className="ip-scrubber-row">
        <span className="ip-time">{fmt(progress)}</span>
        <div className="ip-track-wrap">
          <div className="ip-track-bg" />
          <div className="ip-track-fill" style={{ width: `${(pct / 10).toFixed(2)}%` }} />
          <input
            type="range"
            className="ip-scrubber"
            min={0} max={1000} step={1}
            value={Math.round(pct)}
            onChange={onScrub}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onTouchStart={() => setDragging(true)}
            onTouchEnd={() => setDragging(false)}
          />
        </div>
        <span className="ip-time">{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="ip-controls">
        <button className="ip-ctrl" onClick={() => skip(-10)} title="Back 10s">
          <SkipBack size={18} fill="currentColor" />
        </button>

        <button className="ip-play-btn" onClick={toggle}>
          {playing
            ? <Pause size={22} fill="currentColor" />
            : <Play  size={22} fill="currentColor" style={{ marginLeft: 3 }} />
          }
        </button>

        <button className="ip-ctrl" onClick={() => skip(+10)} title="Forward 10s">
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
