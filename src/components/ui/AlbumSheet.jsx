import { useLayoutEffect, useRef } from 'react';
import { usePlayer, historyReplayInfo, trackIdentity } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';

const FRESH_STREAM_MS = 10 * 60 * 1000;

/**
 * Register the handler Swift calls when a track is tapped in the native album / playlist sheet.
 * - Real uploads and freshly fetched streams play directly.
 * - Everything else (Discogs "resolve:" tracks, saved Bandcamp/SoundCloud/YouTube items whose
 *   stream URL has expired) goes through playSaved, so it plays exactly like History / Likes.
 */
export function registerAlbumPlayback(album) {
  window.__kyoyuPlayNativeTrack = async (albumId, trackObj) => {
    const queue = (album.tracks || []).map(t => {
      const src = t.url || t.streamUrl || t.audioUrl || t.src || '';
      return {
        id: t.id,
        title: t.title || t.name,
        artist: t.artist || album.artist,
        releaseCover: album.cover || album.artworkUrl || t.cover,
        releaseTitle: album.title,
        src, audioUrl: src, url: src,
        duration: t.duration || '',
        provider: (t.provider || album.provider) === 'discogs' ? '' : (t.provider || album.provider || null),
        providerItemId: t.providerItemId || t.trackUrl || undefined,
        scTrackId: t.scTrackId || undefined,
        origin: t.origin || undefined,
        replay: t.replay || undefined,
        streamFetchedAt: t.streamFetchedAt || undefined,
      };
    });
    const idx = queue.findIndex(q => String(q.id) === String(trackObj.id));
    const target = queue[Math.max(idx, 0)];
    if (!target) return;

    const isResolve = target.src.startsWith('resolve:');
    const fresh = target.streamFetchedAt && Date.now() - target.streamFetchedAt < FRESH_STREAM_MS;
    const needsResolve = isResolve || !target.src || (!fresh && historyReplayInfo(target).provider !== 'native');
    if (needsResolve && window.__kyoyuPlaySaved) {
      window.__kyoyuPlaySaved({ ...target, src: '', audioUrl: '', url: isResolve ? target.src : target.url }, queue);
      return;
    }
    if (window.__kyoyuGlobalPlayTrack) window.__kyoyuGlobalPlayTrack(target, queue);
  };
}

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

  registerAlbumPlayback(album);

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

/**
 * Identity to store with a saved album track: if it is the track playing right now, use the
 * exact source it plays from (e.g. the Bandcamp page a Discogs track resolved to).
 */
function savedIdentity(t) {
  const cur = typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack ? window.__kyoyuGetCurrentTrack() : null;
  if (cur && String(cur.id) === String(t.id) && (cur.src || cur.provider === 'youtube')) return trackIdentity(cur);
  const own = { ...t, src: t.src || t.url || t.streamUrl || t.audioUrl || '' };
  if (t.trackUrl && !own.providerItemId) own.providerItemId = t.trackUrl;
  return trackIdentity(own);
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
        storageKey: t.storageKey || '',
        ...savedIdentity(t),
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
        ...savedIdentity(t),
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
        ...savedIdentity(t),
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

export function openNativeArtistFast(artist) {
  if (!artist) return null;
  const ts = Date.now();
  window.__lastFastOpenArtistTs = ts;
  
  // Normalize types for Swift JSONDecoder
  const safeArtist = {
    ...artist,
    id: String(artist.id || Math.random()),
    name: String(artist.name || 'Unknown'),
    realname: artist.realname ? String(artist.realname) : null,
    profile: artist.profile ? String(artist.profile) : null,
    urls: Array.isArray(artist.urls) ? artist.urls.map(String) : [],
    aliases: Array.isArray(artist.aliases) ? artist.aliases.map(String) : [],
    images: Array.isArray(artist.images) ? artist.images.map(String) : [],
    topReleases: (Array.isArray(artist.topReleases) ? artist.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage ? String(r.coverImage) : null,
      type: r.type ? String(r.type) : null
    }))
  };

  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_artist',
      artist: safeArtist
    });
  } catch (e) { console.error('Failed to open native artist sheet', e); }
  return artist;
}

export function openNativeLabelFast(label) {
  if (!label) return null;
  const ts = Date.now();
  window.__lastFastOpenLabelTs = ts;

  // Normalize types for Swift JSONDecoder
  const safeLabel = {
    ...label,
    id: String(label.id || Math.random()),
    name: String(label.name || 'Unknown'),
    profile: label.profile ? String(label.profile) : null,
    urls: Array.isArray(label.urls) ? label.urls.map(String) : [],
    images: Array.isArray(label.images) ? label.images.map(String) : [],
    topReleases: (Array.isArray(label.topReleases) ? label.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage ? String(r.coverImage) : null,
      type: r.type ? String(r.type) : null
    }))
  };

  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_label',
      label: safeLabel
    });
  } catch (e) { console.error('Failed to open native label sheet', e); }
  return label;
}
