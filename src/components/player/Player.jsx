import { useRef, useState, useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { Play, Pause, SkipBack, SkipForward, Music2 } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

/* Animated equalizer bars */
function EqBars({ active, bars = 5, size = 'md' }) {
  return (
    <div className={`eq-bars eq-bars--${size}${active ? ' playing' : ''}`}>
      {Array.from({length: bars}).map((_,i) => (
        <span key={i} style={{'--i': i}}/>
      ))}
    </div>
  );
}

/* AirPlay SVG icon */
function AirPlayIcon() {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>
      <polygon points="11 13 16 20 6 20 11 13" fill="currentColor" stroke="none"/>
    </svg>
  );
}

/* ── Dynamic Island mini ── */
function DynamicIsland({ track, isPlaying, onTap }) {
  return (
    <div className="di-pill" onClick={onTap}>
      {/* Artwork left */}
      <div className="di-art-wrap">
        {track.releaseCover
          ? <img src={track.releaseCover} className="di-art" alt=""/>
          : <div className="di-art di-art-ph"><Music2 size={16}/></div>
        }
      </div>
      {/* Waveform right */}
      <EqBars active={isPlaying} bars={5} size="di"/>
    </div>
  );
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const trackRef   = useRef(null);
  const swipeStart = useRef(0);
  const swiping    = useRef(false);

  const [dismissed, setDismissed] = useState(false);
  const [swipeX,    setSwipeX]    = useState(0);

  const { currentTrack, isPlaying, progress, duration } = state;

  /* Reset dismissed whenever a new track starts */
  useEffect(() => {
    if (currentTrack) setDismissed(false);
  }, [currentTrack?.id]);

  if (!currentTrack) return null;

  const pct       = duration ? (progress / duration) * 100 : 0;
  const remaining = Math.max(0, duration - progress);

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    dispatch({ type: 'SET_PROGRESS', value: Math.floor(((e.clientX - rect.left) / rect.width) * duration) });
  }

  /* Swipe-left to dismiss */
  function onTouchStart(e) { swipeStart.current = e.touches[0].clientX; swiping.current = true; }
  function onTouchMove(e)  { if (!swiping.current) return; const dx = e.touches[0].clientX - swipeStart.current; if (dx < 0) setSwipeX(dx); }
  function onTouchEnd()    { swiping.current = false; if (swipeX < -80) setDismissed(true); setSwipeX(0); }

  const cardStyle = {
    transform:  `translateX(${swipeX}px)`,
    opacity:    Math.max(0, 1 + swipeX / 200),
    transition: swipeX === 0 ? 'transform .3s, opacity .3s' : 'none',
  };

  /* ── Dynamic Island when dismissed ── */
  if (dismissed) {
    return <DynamicIsland track={currentTrack} isPlaying={isPlaying} onTap={() => setDismissed(false)}/>;
  }

  return (
    <div
      className="pc-card"
      style={cardStyle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Row 1: artwork + info + eq bars ── */}
      <div className="pc-row1">
        <div className="pc-art-wrap">
          {currentTrack.releaseCover
            ? <img src={currentTrack.releaseCover} className="pc-art" alt=""/>
            : <div className="pc-art pc-art-ph"><Music2 size={20} strokeWidth={1.2}/></div>
          }
        </div>
        <div className="pc-info">
          <div className="pc-title">{currentTrack.title}</div>
          <div className="pc-artist">{currentTrack.artistName}</div>
        </div>
        <EqBars active={isPlaying} bars={5} size="sm"/>
      </div>

      {/* ── Row 2: scrubber ── */}
      <div className="pc-scrubber-row">
        <span className="pc-time">{fmt(progress)}</span>
        <div className="pc-track" ref={trackRef} onClick={seek}>
          <div className="pc-fill" style={{ width: `${pct}%` }}/>
          <div className="pc-thumb" style={{ left: `${pct}%` }}/>
        </div>
        <span className="pc-time">-{fmt(remaining)}</span>
      </div>

      {/* ── Row 3: controls ── */}
      <div className="pc-controls">
        <button className="pc-ctrl" onClick={() => dispatch({ type: 'PREV_TRACK' })}>
          <SkipBack size={26} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="pc-ctrl pc-ctrl--play" onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}>
          {isPlaying
            ? <Pause size={28} fill="currentColor" strokeWidth={0}/>
            : <Play  size={28} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>
          }
        </button>
        <button className="pc-ctrl" onClick={() => dispatch({ type: 'NEXT_TRACK' })}>
          <SkipForward size={26} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="pc-ctrl pc-ctrl--airplay" title="AirPlay">
          <AirPlayIcon/>
        </button>
      </div>
    </div>
  );
}
