import { createPortal } from 'react-dom';
import { useEffect, useCallback } from 'react';
import { Play, Pause, X, Music2, PlayCircle } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import './AlbumSheet.css';

/**
 * Converts a public track object into the format expected by PlayerContext.playTrack().
 * The player looks for `src` or `fileUrl` for the audio URL.
 */
function toPlayerTrack(t, album) {
  return {
    id:           t.id,
    title:        t.title,
    artist:       t.artist,
    src:          t.audioUrl || '',
    fileUrl:      t.audioUrl || '',
    releaseCover: t.cover || album.cover,
    releaseTitle: album.title,
    artistName:   t.artist,
  };
}

/**
 * AlbumSheet — iOS-style slide-up sheet showing an album's tracks.
 *
 * Props:
 *   album   — { id, title, artist, cover, label, genre, year, tracks: [] }
 *   onClose — () => void
 */
export default function AlbumSheet({ album, onClose }) {
  const { playTrack, state } = usePlayer();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll while open
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
    playTrack(queue[idx], queue);
  }, [album, playTrack]);

  const isCurrentlyPlaying = (track) =>
    state.currentTrack?.id === track.id && state.isPlaying;

  const sheet = (
    <>
      <div className="album-sheet-backdrop" onClick={onClose} />
      <div className="album-sheet" role="dialog" aria-modal="true">
        <div className="as-handle-row">
          <div className="as-handle" />
        </div>
        <button className="as-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        <div className="as-body">
          {/* Hero */}
          <div className="as-hero">
            <div className="as-art">
              {album.cover
                ? <img src={album.cover} alt={album.title} />
                : <Music2 size={32} color="rgba(255,255,255,.25)" />}
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
            <PlayCircle size={20} />
            Play All
          </button>

          {/* Track list */}
          <div className="as-tracks">
            {album.tracks.map((t, i) => {
              const playing = isCurrentlyPlaying(t);
              return (
                <div
                  key={t.id}
                  className={`as-track${playing ? ' as-playing' : ''}`}
                  onClick={() => playOne(t)}
                >
                  <div className="as-track-num">{i + 1}</div>
                  <div className="as-track-info">
                    <div className="as-track-title">{t.title}</div>
                    {t.artist !== album.artist && (
                      <div className="as-track-artist">{t.artist}</div>
                    )}
                  </div>
                  <button
                    className="as-track-play"
                    onClick={(e) => { e.stopPropagation(); playOne(t); }}
                    aria-label={playing ? 'Now playing' : `Play ${t.title}`}
                  >
                    {playing
                      ? <Pause size={14} fill="currentColor" />
                      : <Play  size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
