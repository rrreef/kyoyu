import { useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { Play, Pause, SkipBack, SkipForward, Heart } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

/* Animated waveform bars */
function Waveform({ active }) {
  return (
    <div className={`pc-wave${active ? ' playing' : ''}`}>
      {[0,1,2,3].map(i => <span key={i} style={{ '--i': i }} />)}
    </div>
  );
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const trackRef = useRef(null);
  const { currentTrack, isPlaying, progress, duration, repeatMode, isShuffled } = state;

  if (!currentTrack) return null;

  const liked    = isLiked(currentTrack.id);
  const pct      = duration ? (progress / duration) * 100 : 0;
  const remaining= duration - progress;

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    dispatch({ type: 'SET_PROGRESS', value: Math.floor(((e.clientX - rect.left) / rect.width) * duration) });
  }

  return (
    <div className="pc-card">
      {/* Prismatic border ring */}
      <div className="pc-prism" />

      {/* Header row: title centred + waveform right */}
      <div className="pc-header">
        <div className="pc-text">
          <div className="pc-title">{currentTrack.title}</div>
          <div className="pc-artist">{currentTrack.artistName}</div>
        </div>
        <Waveform active={isPlaying} />
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
