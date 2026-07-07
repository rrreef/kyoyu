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
  const { toggleLikeUpload, isLikedUpload, toggleDownload, isDownloaded, addToPlaylist, createPlaylist, getPlaylists } = useLibrary();

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const toggleLikeRef = useRef(toggleLikeUpload);
  toggleLikeRef.current = toggleLikeUpload;
  const toggleDownloadRef = useRef(toggleDownload);
  toggleDownloadRef.current = toggleDownload;
  const isDownloadedRef = useRef(isDownloaded);
  isDownloadedRef.current = isDownloaded;
  const addToPlaylistRef = useRef(addToPlaylist);
  addToPlaylistRef.current = addToPlaylist;
  const createPlaylistRef = useRef(createPlaylist);
  createPlaylistRef.current = createPlaylist;
  const getPlaylistsRef = useRef(getPlaylists);
  getPlaylistsRef.current = getPlaylists;

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
      if (!t) return;

      // Toggle in React LibraryContext (shows in Library > Likes)
      try { toggleLikeRef.current(t); } catch(e) { console.warn('toggleLikeUpload error:', e); }

      // Also toggle in the injected JS heart system (Supabase persistence + hearts in web UI)
      try {
        if (window.__kyoyuToggleLike) {
          window.__kyoyuToggleLike({
            id: t.id,
            title: t.title || t.name || '',
            artist: t.artist || album.artist || '',
            album: album.title || '',
            artworkUrl: album.cover || album.artworkUrl || ''
          });
        }
      } catch(e) { console.warn('__kyoyuToggleLike error:', e); }

      // Direct localStorage fallback: ensure it's in kyoyu-liked-uploads
      try {
        const LS_KEY = 'kyoyu-liked-uploads';
        const existing = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        const idx = existing.findIndex(x => x.id === t.id);
        if (idx >= 0) {
          existing.splice(idx, 1);
        } else {
          existing.push({
            id: t.id,
            title: t.title || t.name || '',
            artist: t.artist || album.artist || '',
            album: album.title || '',
            cover: album.cover || album.artworkUrl || '',
            genre: t.genre || album.genre || '',
            audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
            storageKey: t.storageKey || ''
          });
        }
        localStorage.setItem(LS_KEY, JSON.stringify(existing));
      } catch(e) {}
    };

    // Download toggle
    window.__kyoyuDownloadTrack = (trackId) => {
      const t = album.tracks.find(tr => tr.id === trackId);
      if (!t) return;
      const trackObj = {
        id: t.id,
        title: t.title || t.name || '',
        artist: t.artist || album.artist || '',
        album: album.title || '',
        cover: album.cover || album.artworkUrl || '',
        audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
      };
      toggleDownloadRef.current(trackObj);
      return !isDownloadedRef.current(trackId);
    };

    // Playlist bridge
    window.__kyoyuGetPlaylists = () => {
      return JSON.stringify(getPlaylistsRef.current());
    };

    window.__kyoyuAddToPlaylist = (playlistId, trackId) => {
      const t = album.tracks.find(tr => tr.id === trackId);
      if (!t) return;
      const trackObj = {
        id: t.id,
        title: t.title || t.name || '',
        artist: t.artist || album.artist || '',
        album: album.title || '',
        cover: album.cover || album.artworkUrl || '',
        audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
      };
      addToPlaylistRef.current(playlistId, trackObj);
    };

    window.__kyoyuCreatePlaylist = (name) => {
      const pl = createPlaylistRef.current(name);
      return JSON.stringify({ id: pl.id, name: pl.title, trackCount: 0 });
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
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuPlayNativeTrack;
      delete window.__kyoyuToggleLikeTrack;
      delete window.__kyoyuDownloadTrack;
      delete window.__kyoyuGetPlaylists;
      delete window.__kyoyuAddToPlaylist;
      delete window.__kyoyuCreatePlaylist;
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
