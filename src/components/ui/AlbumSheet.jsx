import { createPortal } from 'react-dom';
import { useEffect, useCallback } from 'react';
import { X, Music2, Play, Pause, PlayCircle } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import './AlbumSheet.css';

/** Map a public track to the shape PlayerContext.playTrack() expects. */
function toPlayerTrack(t, album) {
  return {
    id:           t.id,
    title:        t.title,
    artist:       t.artist,
    src:          t.audioUrl   || t.src   || '',
    fileUrl:      t.audioUrl   || t.src   || '',
    releaseCover: t.cover      || album.cover,
    releaseTitle: album.title,
    artistName:   t.artist,
  };
}

/**
 * AlbumSheet
 * iOS liquid-glass slide-up sheet — sits 3px above the native tab bar.
 *
 * Props:
 *   album   — { id, title, artist, cover, label, genre, year, tracks[] }
 *   onClose — () => void
 */
export default function AlbumSheet({ album, onClose }) {
  const { playTrack, state } = usePlayer();

  /* Close on Escape */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  /* Lock body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const playAll = useCallback(() => {
    if (!album.tracks.length) return;
    const queue = album.tracks.map(t => toPlayerTrack(t, album));
    playTrack(queue[0], queue);
  }, [album, playTrack]);

  const playOne = useCallback((track) => {
    const queue = album.tracks.map(t => toPlayerTrack(t, album));
    const idx   = queue.findIndex(q => q.id === track.id);
    playTrack(queue[Math.max(idx, 0)], queue);
  }, [album, playTrack]);

  const isPlaying = (t) => state.currentTrack?.id === t.id && state.isPlaying;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="album-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div className="album-sheet" role="dialog" aria-modal="true" aria-label={album.title}>

        {/* Handle + Close */}
        <div className="as-handle-row">
          <div className="as-handle" />
        </div>
        <button className="as-close" onClick={onClose} aria-label="Close">
          <X size={13} strokeWidth={2.5} />
        </button>

        {/* Scrollable content */}
        <div className="as-body">

          {/* Hero */}
          <div className="as-hero">
            <div className="as-art">
              {album.cover
                ? <img src={album.cover} alt={album.title} loading="eager" />
                : <Music2 size={30} color="rgba(255,255,255,.22)" />}
            </div>
            <div className="as-meta">
              <div className="as-album-title">{album.title}</div>
              <div className="as-artist">{album.artist}</div>
              <div className="as-badges">
                {album.tracks.length > 1 && (
                  <span className="as-badge">{album.tracks.length} tracks</span>
                )}
                {album.genre && <span className="as-badge">{album.genre}</span>}
                {album.year  && <span className="as-badge">{album.year}</span>}
                {album.label && <span className="as-badge">{album.label}</span>}
              </div>
            </div>
          </div>

          {/* Play All */}
          <button className="as-play-all" onClick={playAll}>
            <PlayCircle size={18} strokeWidth={2} />
            Play All
          </button>

          <div className="as-divider" />

          {/* Track list */}
          <div className="as-tracks" role="list">
            {album.tracks.map((t, i) => {
              const playing = isPlaying(t);
              return (
                <div
                  key={t.id}
                  className={`as-track${playing ? ' as-playing' : ''}`}
                  role="listitem"
                  onClick={() => playOne(t)}
                >
                  <span className="as-track-num">{i + 1}</span>
                  <div className="as-track-info">
                    <div className="as-track-title">{t.title}</div>
                    {t.artist && t.artist !== album.artist && (
                      <div className="as-track-artist">{t.artist}</div>
                    )}
                  </div>
                  <button
                    className="as-track-play"
                    onClick={(e) => { e.stopPropagation(); playOne(t); }}
                    aria-label={playing ? 'Playing' : `Play ${t.title}`}
                  >
                    {playing
                      ? <Pause size={13} fill="currentColor" strokeWidth={0} />
                      : <Play  size={13} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </>,
    document.body
  );
}
