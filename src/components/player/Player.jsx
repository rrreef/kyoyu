import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, Heart, ChevronUp, List
} from 'lucide-react';
import './Player.css';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function WaveBar({ delay }) {
  return <div className="wave-bar" style={{ animationDelay: `${delay}ms` }} />;
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const { currentTrack, isPlaying, progress, duration, volume, isMuted, isShuffled, repeatMode } = state;

  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);
  const progressPercent = duration ? (progress / duration) * 100 : 0;

  return (
    <div className="player-bar glass">
      {/* Track info */}
      <div className="player-info">
        <div className="player-cover">
          <img src={currentTrack.releaseCover} alt={currentTrack.releaseTitle} />
          {isPlaying && (
            <div className="player-cover-waves">
              <WaveBar delay={0} />
              <WaveBar delay={150} />
              <WaveBar delay={300} />
              <WaveBar delay={150} />
            </div>
          )}
        </div>
        <div className="player-meta">
          <div className="player-title">{currentTrack.title}</div>
          <div className="player-artist">{currentTrack.artistName}</div>
        </div>
        <button
          className={`player-like-btn ${liked ? 'liked' : ''}`}
          onClick={() => toggleLike(currentTrack.id)}
          title="Like"
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Controls */}
      <div className="player-center">
        <div className="player-controls">
          <button
            className={`ctrl-btn ${isShuffled ? 'active-ctrl' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
            title="Shuffle"
          >
            <Shuffle size={16} />
          </button>
          <button className="ctrl-btn" onClick={() => dispatch({ type: 'PREV_TRACK' })} title="Previous">
            <SkipBack size={18} />
          </button>
          <button
            className="play-btn"
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="ctrl-btn" onClick={() => dispatch({ type: 'NEXT_TRACK' })} title="Next">
            <SkipForward size={18} />
          </button>
          <button
            className={`ctrl-btn ${repeatMode !== 'none' ? 'active-ctrl' : ''}`}
            onClick={() => dispatch({ type: 'CYCLE_REPEAT' })}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>
        <div className="player-progress">
          <span className="player-time">{formatTime(progress)}</span>
          <div
            className="progress-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              dispatch({ type: 'SET_PROGRESS', value: Math.floor(pct * duration) });
            }}
          >
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
          </div>
          <span className="player-time">{currentTrack.duration || formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="player-right">
        <button className="ctrl-btn" onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}>
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          className="volume-slider"
          min="0" max="1" step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => dispatch({ type: 'SET_VOLUME', value: parseFloat(e.target.value) })}
        />
      </div>
    </div>
  );
}
