import { useLayoutEffect, useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { findTrackSource } from '../../lib/resolveTrack';

export function openNativeAlbumFast(album) {
  if (!album) return null;
  const ts = Date.now();
  window.__lastFastOpenTs = ts;

  // Sanitize Discogs tracks unconditionally (covers groupByAlbum which drops album.provider)
  // Also make generic Discogs track ids ("discogs-track-0") unique per album, otherwise
  // the same id is shared by every album and History entries overwrite each other.
  if (album.tracks) {
    const albumKey = String(album.id || `${album.artist || ''}-${album.title || ''}`).replace(/\s+/g, '_');
    album.tracks = album.tracks.map(t => {
      let nt = t.provider === 'discogs' ? { ...t, provider: '' } : t;
      if (/^discogs-track-\d+$/.test(String(nt.id || ''))) nt = { ...nt, id: `${albumKey}::${nt.id}` };
      return nt;
    });
  }

  window.__kyoyuPlayNativeTrack = async (albumId, trackObj) => {
    window.__kyoyuPlayNativeTrackCounter = (window.__kyoyuPlayNativeTrackCounter || 0) + 1;
    const myCounter = window.__kyoyuPlayNativeTrackCounter;
    const queue = (album.tracks || []).map(t => ({
       id: t.id,
       title: t.title || t.name,
       artist: t.artist || album.artist,
       releaseCover: album.cover || album.artworkUrl,
       releaseTitle: album.title,
       src: t.url || t.streamUrl || t.audioUrl || t.src || '',
       audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
       url: t.url || t.streamUrl || t.audioUrl || t.src || '',
       duration: t.duration || '',
       provider: (t.provider || album.provider) === 'discogs' ? '' : (t.provider || album.provider || null),
       providerItemId: t.providerItemId || t.trackUrl || undefined,
    }));
    const idx = queue.findIndex(q => q.id === trackObj.id);
    const target = queue[Math.max(idx, 0)];

    if (target.url && target.url.startsWith('resolve:')) {
      // Immediately dispatch placeholder track so Web Player updates UI and stops sending old track ID to Swift
      if (window.__kyoyuGlobalPlayTrack) {
         window.__kyoyuGlobalPlayTrack({ ...target, src: '' }, queue);
      }
      const isCurrent = () => myCounter === window.__kyoyuPlayNativeTrackCounter;
      const play = (extra) => {
        if (!isCurrent() || !window.__kyoyuGlobalPlayTrack) return;
        window.__kyoyuGlobalPlayTrack({ ...target, ...extra, audioUrl: extra.src, url: extra.src, releaseCover: target.releaseCover }, queue);
      };

      // Playback priority: Bandcamp → SoundCloud → YouTube. Each source must actually be this song.
      try {
        const found = await findTrackSource({ artist: target.artist, title: target.title }, isCurrent);
        if (!isCurrent()) return;
        if (!found) { console.warn('[AlbumSheet] No matching source found for', target.artist, target.title); return; }
        if (found.provider === 'youtube') {
          if (window.__kyoyuGlobalPlayYouTube) {
            window.__kyoyuGlobalSetQueue(queue);
            window.__kyoyuGlobalPlayYouTube(found.videoId, { ...target, id: target.id, title: target.title, channelTitle: target.artist, thumbnail: target.releaseCover });
          }
          return;
        }
        // Keep the provider identity on the played track so History can replay the exact same source
        play({ provider: found.provider, providerItemId: found.providerItemId, scTrackId: found.scTrackId, src: found.src });
        return;
      } catch (e) { console.warn('Resolve play error:', e); return; }
    }
    if (myCounter !== window.__kyoyuPlayNativeTrackCounter) return;
    if (window.__kyoyuGlobalPlayTrack) window.__kyoyuGlobalPlayTrack(target, queue);
  };

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
        description: album.description || null,
        tracks: (album.tracks || []).map(t => ({
          id: t.id || String(Date.now() + Math.random()),
          title: t.title || t.name || 'Unknown Track',
          artist: t.artist || '',
          url: t.url || t.streamUrl || t.audioUrl || '',
          cover: t.cover || null,
          provider: t.provider || album.provider || null
        }))
      }
    });
  } catch(e) {}
  return { ...album, _ts: ts };
}

// ── "Go to Album" bridge — called from Swift NativePlayerView ──
// Searches Discogs for the album, opens a full Discogs album sheet.
if (typeof window !== 'undefined') {
  window.__kyoyuGoToAlbum = async (artist, albumOrTitle) => {
    if (!artist && !albumOrTitle) return;
    const query = `${artist} ${albumOrTitle}`.trim();
    try {
      // First try Discogs track-info (gets full tracklist + metadata)
      const r = await fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track-info', title: albumOrTitle, artist, album: albumOrTitle }),
      });
      if (r.ok) {
        const info = await r.json();
        if (info.tracklist && info.tracklist.length > 0) {
          openNativeAlbumFast({
            id: info.discogsId || `discogs-${albumOrTitle}`,
            title: info.album || albumOrTitle || '',
            artist: info.artist || artist || '',
            cover: info.coverImage || info.thumb || '',
            year: info.year || null,
            genre: info.genre || '',
            label: info.label || '',
            provider: 'discogs',
            description: [
              info.formats?.length ? `Format: ${info.formats.join(' / ')}` : '',
              info.country ? `Country: ${info.country}` : '',
              info.description || '',
              info.credits?.mixing?.length ? `Mixed by: ${info.credits.mixing.join(', ')}` : '',
              info.credits?.mastering?.length ? `Mastered by: ${info.credits.mastering.join(', ')}` : '',
            ].filter(Boolean).join('\n'),
            tracks: (info.tracklist || []).map((t, i) => ({
              id: `discogs-track-${i}`,
              title: `${t.position ? t.position + '. ' : ''}${t.title || ''}`,
              artist: t.artists?.join(', ') || info.artist || artist || '',
              url: `resolve:${t.artists?.join(', ') || info.artist || artist} ${t.title || ''}`,
              cover: info.coverImage || info.thumb || '',
              provider: '',
            })),
          });
          return;
        }
      }

      // Fallback: search Discogs for the release
      const sr = await fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, perPage: 5, page: 1 }),
      });
      if (sr.ok) {
        const sd = await sr.json();
        const release = (sd.results || []).find(r => r.type === 'release' || r.type === 'master');
        if (release) {
          // Fetch full track info for this release
          const tr = await fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'track-info', discogsReleaseId: release.id || release.discogsId }),
          });
          if (tr.ok) {
            const tinfo = await tr.json();
            const parsed = (release.title || '').split(' - ');
            const releaseArtist = parsed.length >= 2 ? parsed[0].trim() : artist;
            const releaseTitle = parsed.length >= 2 ? parsed.slice(1).join(' - ').trim() : release.title;
            openNativeAlbumFast({
              id: `discogs-${release.id || release.discogsId}`,
              title: tinfo.album || releaseTitle || albumOrTitle || '',
              artist: tinfo.artist || releaseArtist || artist || '',
              cover: release.cover_image || release.coverImage || release.thumb || '',
              year: tinfo.year || release.year || null,
              genre: tinfo.genre || '',
              label: tinfo.label || '',
              provider: 'discogs',
              tracks: (tinfo.tracklist || []).map((t, i) => ({
                id: `discogs-track-${i}`,
                title: `${t.position ? t.position + '. ' : ''}${t.title || ''}`,
                artist: t.artists?.join(', ') || tinfo.artist || releaseArtist || '',
                url: `resolve:${t.artists?.join(', ') || tinfo.artist || releaseArtist} ${t.title || ''}`,
                cover: release.cover_image || release.coverImage || release.thumb || '',
                provider: '',
              })),
            });
          }
        }
      }
    } catch (e) {
      console.warn('[GoToAlbum] Error:', e);
    }
  };
}

export default function AlbumSheet({ album, onClose }) {
  const { playTrack } = usePlayer();
  const {
    toggleLikeUpload, isLikedUpload, toggleDownload, isDownloaded,
    addToPlaylist, createPlaylist, getPlaylists, updatePlaylistCover,
    deletePlaylist, removeFromPlaylist, reorderPlaylist, togglePlaylistPublic,
    getPlaylistPublic, toggleLike
  } = useLibrary();

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const toggleLikeRef = useRef(toggleLikeUpload);
  toggleLikeRef.current = toggleLikeUpload;
  const isLikedUploadRef = useRef(isLikedUpload);
  isLikedUploadRef.current = isLikedUpload;
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
  const updatePlaylistCoverRef = useRef(updatePlaylistCover);
  updatePlaylistCoverRef.current = updatePlaylistCover;
  const deletePlaylistRef = useRef(deletePlaylist);
  deletePlaylistRef.current = deletePlaylist;
  const removeFromPlaylistRef = useRef(removeFromPlaylist);
  removeFromPlaylistRef.current = removeFromPlaylist;
  const reorderPlaylistRef = useRef(reorderPlaylist);
  reorderPlaylistRef.current = reorderPlaylist;
  const togglePlaylistPublicRef = useRef(togglePlaylistPublic);
  togglePlaylistPublicRef.current = togglePlaylistPublic;

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

    const handleNativeLike = (e) => {
      if (e.detail.handled) return;
      const trackId = String(e.detail.trackId).split('?ts=')[0];
      const t = album.tracks.find(tr => String(tr.id) === trackId);
      if (!t) return;

      e.detail.handled = true;
      const trackObj = {
        ...t,
        cover: album.cover || album.artworkUrl || '',
        album: album.title || '',
        storageKey: t.storageKey || ''
      };

      try { toggleLikeRef.current(trackObj); } catch(err) { console.warn('toggleLikeUpload error:', err); }

      try {
        let saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
        if (!saved.some(x => String(x.id) === String(t.id))) {
          // eslint-disable-next-line no-unused-vars
          const { artworkUrl, artworkFile, ...slim } = trackObj;
          saved.push(slim);
          localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(saved));
        }
      } catch(err) {}
    };
    window.addEventListener('kyoyu-native-like', handleNativeLike);

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

    // Playlist cover update from native
    window.__kyoyuUpdatePlaylistCover = (playlistId, coverDataUrl) => {
      updatePlaylistCoverRef.current(playlistId, coverDataUrl || null);
    };

    // Playlist editing callbacks
    window.__kyoyuDeletePlaylist = (playlistId) => {
      deletePlaylistRef.current(playlistId);
    };
    window.__kyoyuRemoveFromPlaylist = (playlistId, trackId) => {
      removeFromPlaylistRef.current(playlistId, trackId);
    };
    window.__kyoyuReorderPlaylist = (playlistId, fromIndex, toIndex) => {
      reorderPlaylistRef.current(playlistId, fromIndex, toIndex);
    };
    window.__kyoyuTogglePlaylistPublic = (playlistId) => {
      togglePlaylistPublicRef.current(playlistId);
    };
    window.__kyoyuGetPlaylistPublic = (playlistId) => {
      const pl = getPlaylistsRef.current().find(p => p.id === playlistId);
      // need full playlist data for isPublic
      return false; // default
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
                url: t.url || t.streamUrl || t.audioUrl || '',
                provider: t.provider || album.provider || null
              }))
            }
          });
        } catch(e) {
          console.warn("Failed to open native album sheet", e);
        }
    }

    return () => {
      window.removeEventListener('kyoyu-native-like', handleNativeLike);
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuDownloadTrack;
      delete window.__kyoyuGetPlaylists;
      delete window.__kyoyuAddToPlaylist;
      delete window.__kyoyuCreatePlaylist;
      delete window.__kyoyuUpdatePlaylistCover;
      delete window.__kyoyuDeletePlaylist;
      delete window.__kyoyuRemoveFromPlaylist;
      delete window.__kyoyuReorderPlaylist;
      delete window.__kyoyuTogglePlaylistPublic;
      delete window.__kyoyuGetPlaylistPublic;
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
