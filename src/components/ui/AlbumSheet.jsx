import { useLayoutEffect, useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { cleanText, parseEntity, isSameTitle, stripTrackPosition, tokens } from '../../lib/musicMatch';

async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

/** Resolve a Bandcamp track page to an mp3 stream (native bridge in the iOS app, serverless API on web). */
async function resolveBandcampStream(trackUrl, title) {
  const bridge = typeof window !== 'undefined' && window.webkit?.messageHandlers?.bandcamp;
  if (!bridge) {
    const data = await postJson('/api/bandcamp-resolve', { url: trackUrl });
    return data?.streamUrl || null;
  }
  return new Promise((resolve) => {
    const callbackId = Math.random().toString(36).substring(7);
    window.__kyoyuBandcampCallback = window.__kyoyuBandcampCallback || ((id, data) => {
      if (window.__kyoyuBandcampCallbacks && window.__kyoyuBandcampCallbacks[id]) {
        window.__kyoyuBandcampCallbacks[id](data);
        delete window.__kyoyuBandcampCallbacks[id];
      }
    });
    window.__kyoyuBandcampCallbacks = window.__kyoyuBandcampCallbacks || {};
    const timeout = setTimeout(() => {
      if (window.__kyoyuBandcampCallbacks[callbackId]) {
        window.__kyoyuBandcampCallbacks[callbackId]({ error: 'Timeout' });
        delete window.__kyoyuBandcampCallbacks[callbackId];
      }
    }, 10000);
    window.__kyoyuBandcampCallbacks[callbackId] = (data) => {
      clearTimeout(timeout);
      resolve(data && data.streamUrl ? data.streamUrl : null);
    };
    bridge.postMessage({ url: trackUrl, callbackId, title });
  });
}

export function openNativeAlbumFast(album) {
  if (!album) return null;
  const ts = Date.now();
  window.__lastFastOpenTs = ts;

  // Sanitize Discogs tracks unconditionally (covers groupByAlbum which drops album.provider)
  if (album.tracks) {
    album.tracks = album.tracks.map(t => (t.provider === 'discogs' ? { ...t, provider: '' } : t));
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
       provider: (t.provider || album.provider) === 'discogs' ? '' : (t.provider || album.provider || null)
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
      const want = { artist: cleanText(target.artist), title: cleanText(stripTrackPosition(target.title)), uploader: '' };
      const searchText = `${target.artist || ''} ${stripTrackPosition(target.title)}`.trim();
      try {
        // 1. Bandcamp
        const bc = await postJson('/api/bandcamp-search', { query: searchText });
        const bcTrack = (bc?.results || []).find(r => r.type === 'track' && isSameTitle(parseEntity(r.title, r.artistName), want));
        if (bcTrack) {
          const streamUrl = await resolveBandcampStream(bcTrack.trackUrl, target.title);
          if (!isCurrent()) return;
          if (streamUrl) { play({ provider: 'bandcamp', providerItemId: bcTrack.trackUrl, src: streamUrl }); return; }
        }

        // 2. SoundCloud
        if (!isCurrent()) return;
        const sc = await postJson('/api/soundcloud-search', { query: searchText, limit: 15, offset: 0 });
        const scTrack = (sc?.results || []).find(r => isSameTitle(parseEntity(r.title, r.artistName), want));
        if (scTrack) {
          const scStream = await postJson('/api/soundcloud-search', { resolveTrackId: scTrack.trackId });
          if (!isCurrent()) return;
          if (scStream?.streamUrl) { play({ provider: 'soundcloud', providerItemId: scTrack.permalinkUrl, src: scStream.streamUrl }); return; }
        }

        // 3. YouTube (titles are messy: accept an exact match, else every title word + the artist present)
        if (!isCurrent()) return;
        const yt = await postJson('/api/youtube-search', { query: `${searchText} audio` });
        const ytResults = yt?.results || [];
        const ytEnt = (r) => parseEntity(r.title, r.channelTitle);
        const looseYt = (r) => {
          const all = tokens(`${r.title} ${r.channelTitle}`);
          const need = [...tokens(want.title), ...tokens(want.artist)];
          return need.length > 0 && need.every(w => all.has(w));
        };
        const ytTrack = ytResults.find(r => isSameTitle(ytEnt(r), want)) || ytResults.find(looseYt);
        if (ytTrack && isCurrent() && window.__kyoyuGlobalPlayYouTube) {
          window.__kyoyuGlobalSetQueue(queue);
          window.__kyoyuGlobalPlayYouTube(ytTrack.videoId, { ...target, id: target.id, title: target.title, channelTitle: target.artist, thumbnail: target.releaseCover });
          return;
        }
        console.warn('[AlbumSheet] No matching source found for', searchText);
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
