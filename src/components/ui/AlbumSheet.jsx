import { useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';

export default function AlbumSheet({ album, onClose }) {
  const { playTrack } = usePlayer();

  useEffect(() => {
    if (!album) return;
    
    // Expose close handler so Swift can trigger it
    window.__kyoyuCloseNativeAlbum = () => {
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
         url: t.url || t.streamUrl || t.audioUrl
      }));
      
      const idx = queue.findIndex(q => q.id === trackObj.id);
      playTrack(queue[Math.max(idx, 0)], queue);
    };

    // Tell Swift to open the native overlay
    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        albumOpen: true,
        nativeAlbum: {
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
