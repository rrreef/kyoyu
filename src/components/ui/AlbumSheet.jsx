import { useLayoutEffect, useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';

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
  const { toggleLikeUpload, isLikedUpload } = useLibrary();

  // Keep stable refs so the effect cleanup doesn't fire when these change identity.
  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const toggleLikeRef = useRef(toggleLikeUpload);
  toggleLikeRef.current = toggleLikeUpload;
  const isLikedRef = useRef(isLikedUpload);
  isLikedRef.current = isLikedUpload;

  useLayoutEffect(() => {
    if (!album) return;

    // Expose close handler so Swift can trigger it
    window.__kyoyuCloseNativeAlbum = (incomingTs) => {
      if (incomingTs && window.__lastFastOpenTs && String(incomingTs) !== String(window.__lastFastOpenTs)) {
         return;
      }
      onCloseRef.current();
    };

    // Expose play handler so Swift can trigger it
    window.__kyoyuPlayNativeTrack = (albumId, trackObj) => {
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
      playTrackRef.current(queue[Math.max(idx, 0)], queue);
    };

    // Expose like handler so Swift can trigger it
    window.__kyoyuToggleLikeTrack = (trackId) => {
      const t = album.tracks.find(tr => tr.id === trackId);
      if (!t) return false;

      // Toggle in React LibraryContext (shows in Library > Likes)
      toggleLikeRef.current(t);

      // Also toggle in the injected JS heart system (Supabase persistence + hearts in web UI)
      if (window.__kyoyuToggleLike) {
        window.__kyoyuToggleLike({
          id: t.id,
          title: t.title || t.name || '',
          artist: t.artist || album.artist || '',
          album: album.title || '',
          artworkUrl: album.cover || album.artworkUrl || ''
        });
      }

      // Return new liked state so Swift can update the heart icon
      const nowLiked = !isLikedRef.current(trackId);
      try {
        window.webkit?.messageHandlers?.player?.postMessage({
          likeStateChanged: { trackId: trackId, liked: nowLiked }
        });
      } catch(e) {}
      return nowLiked;
    };

    // Send initial liked states to Swift so hearts show correctly on open
    const likedStates = {};
    album.tracks.forEach(t => {
      likedStates[t.id] = isLikedRef.current(t.id);
    });
    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        albumLikedStates: likedStates
      });
    } catch(e) {}

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
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuPlayNativeTrack;
      delete window.__kyoyuToggleLikeTrack;
      const myTs = album?._ts;
      if (!myTs || String(myTs) === String(window.__lastFastOpenTs)) {
        try {
          window.webkit?.messageHandlers?.player?.postMessage({ albumOpen: false });
        } catch(e) {}
      }
    };
  }, [album]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
