import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
import './InlinePlayer.css';

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function Waveform({ active }) {
  return (
    <div className={`ip-wave${active ? ' playing' : ''}`}>
      {[0,1,2,3].map(i => <span key={i} />)}
    </div>
  );
}

export default function InlinePlayer({
  src, artworkUrl, title, artist,
  onPrev, onNext, hasPrev = false, hasNext = false,
}) {
  const audioRef   = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const dragging   = useRef(false);

  /* reset when src changes */
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [src]);

  function onLoaded()    { setDuration(audioRef.current?.duration || 0); }
  function onTimeUpdate(){ if (!dragging.current) setProgress(audioRef.current?.currentTime || 0); }
  function onEnded()     { setPlaying(false); setProgress(0); }

  function toggle() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  }

  function skip(delta) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
  }

  /* scrubber — value 0-1000 */
  function onScrubChange(e) {
    const t = (Number(e.target.value) / 1000) * duration;
    setProgress(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  }

  const pct = duration ? (progress / duration) * 100 : 0;  // 0-100 for CSS width
  const rangeVal = Math.round((pct / 100) * 1000);           // 0-1000 for range input

  return (
    <div className="ip-card">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />

      {/* Artwork blurred backdrop */}
      {artworkUrl && (
        <div className="ip-art-bg" style={{ backgroundImage: `url(${artworkUrl})` }} />
      )}

      {/* Top: artwork + info + waveform */}
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
          <div className="ip-track-fill" style={{ width: `${pct.toFixed(2)}%` }} />
          <input
            type="range"
            className="ip-range"
            min={0} max={1000} step={1}
            value={rangeVal}
            onChange={onScrubChange}
            onMouseDown={() => { dragging.current = true; }}
            onMouseUp={()   => { dragging.current = false; }}
            onTouchStart={() => { dragging.current = true; }}
            onTouchEnd={()   => { dragging.current = false; }}
          />
        </div>
        <span className="ip-time ip-time-right">{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="ip-controls">
        {/* Prev track — only when multiple tracks */}
        {hasPrev
          ? <button className="ip-ctrl ip-track-nav" onClick={onPrev} title="Previous track">
              <ChevronLeft size={20} />
            </button>
          : <span className="ip-ctrl-spacer" />
        }

        <button className="ip-ctrl" onClick={() => skip(-10)} title="Back 10s">
          <SkipBack size={17} fill="currentColor" />
        </button>

        <button className="ip-play-btn" onClick={toggle}>
          {playing
            ? <Pause size={22} fill="currentColor" />
            : <Play  size={22} fill="currentColor" style={{ marginLeft: 3 }} />
          }
        </button>

        <button className="ip-ctrl" onClick={() => skip(+10)} title="Forward 10s">
          <SkipForward size={17} fill="currentColor" />
        </button>

        {/* Next track */}
        {hasNext
          ? <button className="ip-ctrl ip-track-nav" onClick={onNext} title="Next track">
              <ChevronRight size={20} />
            </button>
          : <span className="ip-ctrl-spacer" />
        }
      </div>
    </div>
  );
}
