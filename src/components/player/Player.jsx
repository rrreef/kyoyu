import { useRef, useState, useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { Play, Pause, SkipBack, SkipForward, Heart, Music2 } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

/* Animated waveform bars */
function Waveform({ active, size = 'md' }) {
  return (
    <div className={`pc-wave pc-wave--${size}${active ? ' playing' : ''}`}>
      {[0,1,2,3].map(i => <span key={i} style={{ '--i': i }} />)}
    </div>
  );
}

/* ── Dynamic Island mini (shown when player is dismissed) ── */
function DynamicIsland({ track, isPlaying, onTap }) {
  return (
    <div className="pc-island" onClick={onTap}>
      {track.releaseCover
        ? <img src={track.releaseCover} className="pc-island-art" alt=""/>
        : <div className="pc-island-art pc-island-art-ph"><Music2 size={10}/></div>
      }
      <div className="pc-island-info">
        <span className="pc-island-title">{track.title}</span>
      </div>
      <Waveform active={isPlaying} size="sm"/>
    </div>
  );
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const trackRef  = useRef(null);
  const swipeStart= useRef(0);
  const swiping   = useRef(false);

  const [dismissed, setDismissed] = useState(false);
  const [swipeX,    setSwipeX]    = useState(0);

  const { currentTrack, isPlaying, progress, duration } = state;

  /* Reset dismissed when a new track starts */
  useEffect(() => {
    if (currentTrack) setDismissed(false);
  }, [currentTrack?.id]);

  if (!currentTrack) return null;

  const liked    = isLiked(currentTrack.id);
  const pct      = duration ? (progress / duration) * 100 : 0;
  const remaining= duration - progress;

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    dispatch({ type: 'SET_PROGRESS', value: Math.floor(((e.clientX - rect.left) / rect.width) * duration) });
  }

  /* Swipe-left handlers */
  function onTouchStart(e) {
    swipeStart.current = e.touches[0].clientX;
    swiping.current = true;
  }
  function onTouchMove(e) {
    if (!swiping.current) return;
    const dx = e.touches[0].clientX - swipeStart.current;
    if (dx < 0) setSwipeX(dx);
  }
  function onTouchEnd() {
    swiping.current = false;
    if (swipeX < -80) setDismissed(true);
    setSwipeX(0);
  }

  const cardStyle = {
    transform: `translateX(${swipeX}px)`,
    opacity: Math.max(0, 1 + swipeX / 200),
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
      {/* Prismatic border ring */}
      <div className="pc-prism" />

      {/* Artwork row */}
      <div className="pc-artwork-row">
        {currentTrack.releaseCover
          ? <img src={currentTrack.releaseCover} className="pc-artwork" alt=""/>
          : <div className="pc-artwork pc-artwork-ph"><Music2 size={18} strokeWidth={1.3}/></div>
        }
      </div>

      {/* Header row: title + waveform */}
      <div className="pc-header">
        <div className="pc-text">
          <div className="pc-title">{currentTrack.title}</div>
          <div className="pc-artist">{currentTrack.artistName}</div>
        </div>
        <Waveform active={isPlaying}/>
      </div>

      {/* Progress row */}
      <div className="pc-progress-row">
        <span className="pc-time">{fmt(progress)}</span>
        <div className="pc-track" ref={trackRef} onClick={seek}>
          <div className="pc-fill" style={{ width: `${pct}%` }} />
          <div className="pc-thumb" style={{ left: `${pct}%` }} />
        </div>
        <span className="pc-time">-{fmt(remaining > 0 ? remaining : 0)}</span>
      </div>

      {/* Controls row */}
      <div className="pc-controls">
        <button
          className={`pc-btn pc-like${liked ? ' liked' : ''}`}
          onClick={() => toggleLike(currentTrack.id)}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </button>

        <button className="pc-btn" onClick={() => dispatch({ type: 'PREV_TRACK' })}>
          <SkipBack size={17} fill="currentColor" />
        </button>

        <button className="pc-play-btn" onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}>
          {isPlaying
            ? <Pause size={19} fill="currentColor" />
            : <Play  size={19} fill="currentColor" style={{ marginLeft: 2 }} />
          }
        </button>

        <button className="pc-btn" onClick={() => dispatch({ type: 'NEXT_TRACK' })}>
          <SkipForward size={17} fill="currentColor" />
        </button>

        {/* AirPods/output icon */}
        <button className="pc-btn pc-output" title="Audio output">
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="6"  cy="8" r="3" />
            <circle cx="14" cy="8" r="3" />
            <path d="M6 5V2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
