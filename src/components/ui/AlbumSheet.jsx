import { useLayoutEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';

export function openNativeAlbumFast(album) {
  if (!album) return null;
  const ts = Date.now();
  window.__lastFastOpenTs = ts;
  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      albumOpen: true,
      nativeAlbum: {
        _ts: String(ts),
        id: album.id || String(Date.now()),
        title: album.title || '',
        artist: album.artist || '',
        cover: album.cover || album.artworkUrl || null,
        genre: album.genre || null,
        year: album.year ? String(album.year) : null,
        label: album.label || null,
        tracks: (album.tracks || []).map(t => ({
          id: t.id || String(Date.now() + Math.random()),
          title: t.title || t.name || 'Unknown Track',
          artist: t.artist || '',
          url: t.url || t.streamUrl || t.audioUrl || ''
        }))
      }
    });
  } catch(e) {}
  return { ...album, _ts: ts };
}

export default function AlbumSheet({ album, onClose }) {
  const { playTrack } = usePlayer();

  useLayoutEffect(() => {
    if (!album) return;
    
    // Expose close handler so Swift can trigger it
    window.__kyoyuCloseNativeAlbum = (incomingTs) => {
      // If the MOST RECENT tap timestamp is different from the incoming close timestamp,
      // the user must have tapped the album again since this close command was issued!
      // Using window.__lastFastOpenTs protects against React stale closures holding old album._ts values.
      if (incomingTs && window.__lastFastOpenTs && String(incomingTs) !== String(window.__lastFastOpenTs)) {
         return;
      }
      onClose();
    };

    // Expose play handler so Swift can trigger it
    window.__kyoyuPlayNativeTrack = (albumId, trackObj) => {
      // Create a player track format from the raw track data
      const queue = album.tracks.map(t => ({
         id: t.id,
         title: t.title || t.name,
         artist: t.artist || album.artist,
         releaseCover: album.cover || album.artworkUrl,
         releaseTitle: album.title,
         src: t.url || t.streamUrl || t.audioUrl || t.src || '',
         audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
         url: t.url || t.streamUrl || t.audioUrl || t.src || '',
         duration: t.duration || ''
      }));
      
      const idx = queue.findIndex(q => q.id === trackObj.id);
      playTrack(queue[Math.max(idx, 0)], queue);
    };

    // Tell Swift to open the native overlay if not already sent
    if (window.__lastFastOpenTs !== album._ts) {
        window.__lastFastOpenTs = album._ts;
        try {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            nativeAlbum: {
              _ts: album._ts ? String(album._ts) : null,
              id: album.id || String(Date.now()),
              title: album.title || '',
              artist: album.artist || '',
              cover: album.cover || album.artworkUrl || null,
              genre: album.genre || null,
              year: album.year ? String(album.year) : null,
              label: album.label || null,
              tracks: (album.tracks || []).map(t => ({
                id: t.id || String(Date.now() + Math.random()),
                title: t.title || t.name || 'Unknown Track',
                artist: t.artist || '',
                url: t.url || t.streamUrl || t.audioUrl || ''
              }))
            }
          });
        } catch(e) {
          console.warn("Failed to open native album sheet", e);
        }
    }

    return () => {
      // Clean up global handlers
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuPlayNativeTrack;
      // Tell Swift to close overlay if it unmounts
      try {
        window.webkit?.messageHandlers?.player?.postMessage({ albumOpen: false });
      } catch(e) {}
    };
  }, [album, onClose, playTrack]);

  // Render nothing in DOM - it's fully native now
  return null;
}
