import { useLayoutEffect, useRef } from 'react';
import { usePlayer, historyReplayInfo, trackIdentity } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { syncProviderLike } from '../../lib/streaming';
import { isItemInConnectedLikes } from '../../lib/useConnectedLibrary';

const FRESH_STREAM_MS = 10 * 60 * 1000;

/**
 * Register the handler Swift calls when a track is tapped in the native album / playlist sheet.
 * - Real uploads and freshly fetched streams play directly.
 * - Everything else (Discogs "resolve:" tracks, saved Bandcamp/SoundCloud/YouTube items whose
 *   stream URL has expired) goes through playSaved, so it plays exactly like History / Likes.
 */
export function registerAlbumPlayback(album) {
  if (typeof window !== 'undefined') {
    window.__kyoyuCurrentNativeAlbum = album;
  }
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
  window.__kyoyuCurrentNativeAlbum = album;

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
        provider: album.provider || null,
        description: album.description || null,
        tracks: (album.tracks || []).map(t => ({
          id: t.id || String(Date.now() + Math.random()),
          title: t.title || t.name || 'Unknown Track',
          artist: t.artist || '',
          url: t.trackUrl || t.url || t.streamUrl || t.audioUrl || '',
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
    toggleSave, isSaved, playlists,
    addToPlaylist, createPlaylist, getPlaylists, updatePlaylistCover,
    deletePlaylist, removeFromPlaylist, reorderPlaylist, togglePlaylistPublic,
    getPlaylistPublic, toggleLike
  } = useLibrary();

  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const safeAlbumRef = useRef(album);
  safeAlbumRef.current = album;
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
    window.__kyoyuCurrentNativeAlbum = album;
    registerAlbumPlayback(album);

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
            provider: album.provider || null,
            tracks: (album.tracks || []).map(t => ({
              id: t.id || String(Date.now() + Math.random()),
              title: t.title || t.name || 'Unknown Track',
              artist: t.artist || '',
              url: t.trackUrl || t.url || t.streamUrl || t.audioUrl || '',
              cover: t.artworkUrl || t.cover || null,
              provider: t.provider || album.provider || null
            }))
          }
        });
      } catch(e) {
        console.warn("Failed to open native album sheet", e);
      }
    }
  }, [album]);

  useLayoutEffect(() => {
    // Expose close handler so Swift can trigger it
    window.__kyoyuCloseNativeAlbum = (incomingTs) => {
      if (incomingTs && window.__lastFastOpenTs && String(incomingTs) !== String(window.__lastFastOpenTs)) {
         return;
      }
      window.__lastFastOpenTs = 0;
      onCloseRef.current();
    };

    const handleNativeLike = (e) => {
      if (e.detail.handled) return;
      const trackId = String(e.detail.trackId).split('?ts=')[0];
      const curAlbum = safeAlbumRef.current || window.__kyoyuCurrentNativeAlbum;
      let t = (curAlbum?.tracks || []).find(tr => String(tr.id) === trackId);
      if (!t) return;

      e.detail.handled = true;
      const trackObj = {
        ...t,
        artist: t.artist || curAlbum?.artist || '',
        cover: curAlbum?.cover || curAlbum?.artworkUrl || t.cover || '',
        album: curAlbum?.title || '',
        albumId: curAlbum?.id || '',
        albumProvider: curAlbum?.provider || '',
        trackUrl: t.trackUrl || curAlbum?.trackUrl || curAlbum?.url || '',
        storageKey: t.storageKey || '',
        ...savedIdentity(t),
      };

      try {
        toggleLikeRef.current(trackObj, {
          skipProviderSync: !!e.detail.skipProviderSync,
          forceLiked: e.detail.forceLiked,
        });
      } catch(err) { console.warn('toggleLikeUpload error:', err); }

      try {
        let saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
        const shouldLike = typeof e.detail.forceLiked === 'boolean'
          ? e.detail.forceLiked
          : !saved.some(x => String(x.id) === String(t.id));
        if (!shouldLike) {
          saved = saved.filter(x => String(x.id) !== String(t.id));
        } else if (!saved.some(x => String(x.id) === String(t.id))) {
          // eslint-disable-next-line no-unused-vars
          const { artworkUrl, artworkFile, ...slim } = trackObj;
          saved.push(slim);
        }
        localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(saved));
      } catch(err) {}
    };
    window.addEventListener('kyoyu-native-like', handleNativeLike);

    window.__kyoyuIsTrackInAnyPlaylist = (trackId) => {
      const pls = getPlaylistsRef.current();
      return pls.some(pl => pl.tracks && pl.tracks.some(t => String(t.id) === String(trackId)));
    };
    window.__kyoyuToggleSaveAlbum = () => {
      const curAlbum = safeAlbumRef.current || window.__kyoyuCurrentNativeAlbum;
      if (!curAlbum || !curAlbum.tracks) return;
      const isSaved = window.__kyoyuIsSavedAlbum(null, curAlbum.id);
      const nextLiked = !isSaved;
      let saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
      
      for (const t of curAlbum.tracks) {
        const trackObj = {
          id: t.id,
          title: t.title,
          artistName: curAlbum.artist || '',
          artist: t.artist || curAlbum.artist || '',
          album: curAlbum.title || '',
          albumId: curAlbum.id || '',
          albumProvider: curAlbum.provider || '',
          trackUrl: t.trackUrl || curAlbum.trackUrl || curAlbum.url || '',
          cover: curAlbum.cover || curAlbum.artworkUrl || '',
          audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
          ...savedIdentity(t),
        };
        try { toggleLikeRef.current(trackObj, { skipProviderSync: true, forceLiked: nextLiked }); } catch (e) {}
        
        if (!nextLiked) {
            saved = saved.filter(x => String(x.id) !== String(t.id));
        } else {
            if (!saved.some(x => String(x.id) === String(t.id))) {
                const { artworkUrl, artworkFile, ...slim } = trackObj;
                saved.push(slim);
            }
        }
      }
      localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(saved));

      // Perform a single album-level provider sync
      try {
        syncProviderLike({
          id: curAlbum.id,
          albumId: curAlbum.id,
          kind: 'album',
          provider: curAlbum.provider || curAlbum.tracks?.[0]?.provider || '',
          title: curAlbum.title || '',
          artist: curAlbum.artist || '',
          album: curAlbum.title || '',
          cover: curAlbum.cover || curAlbum.artworkUrl || '',
          trackUrl: curAlbum.trackUrl || curAlbum.url || curAlbum.tracks?.[0]?.trackUrl || '',
          url: curAlbum.url || curAlbum.trackUrl || '',
        }, nextLiked);
      } catch (e) {}
    };
    window.__kyoyuIsSavedAlbum = (tracksJson, incomingAlbumId) => {
      const curAlbum = safeAlbumRef.current || window.__kyoyuCurrentNativeAlbum;
      const aid = incomingAlbumId || curAlbum?.id || '';
      if (aid && isItemInConnectedLikes({ id: aid, trackUrl: curAlbum?.trackUrl || curAlbum?.url || '' })) {
        return true;
      }
      let tracks = curAlbum?.tracks || [];
      if (tracksJson) {
        try { tracks = JSON.parse(tracksJson); } catch {}
      }
      if (!tracks || !tracks.length) return false;
      const saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
      return tracks.every(t => saved.some(x => String(x.id) === String(t.id)));
    };
    window.__kyoyuDownloadTrack = (trackId) => {
      const curAlbum = safeAlbumRef.current || window.__kyoyuCurrentNativeAlbum;
      const t = (curAlbum?.tracks || []).find(tr => String(tr.id) === String(trackId));
      if (!t) return;
      const trackObj = {
        id: t.id,
        title: t.title || t.name || '',
        artist: t.artist || curAlbum?.artist || '',
        album: curAlbum?.title || '',
        cover: curAlbum?.cover || curAlbum?.artworkUrl || '',
        audioUrl: t.url || t.streamUrl || t.audioUrl || t.src || '',
        ...savedIdentity(t),
      };
      toggleDownloadRef.current(trackObj);
      return !isDownloadedRef.current(trackId);
    };

    // Playlist bridge
    window.__kyoyuGetPlaylists = (trackId) => {
      const pls = getPlaylistsRef.current().map(pl => {
        // Find if this playlist contains ANY of the comma-separated track IDs
        const ids = trackId ? String(trackId).split(',') : [];
        const containsTrack = ids.length > 0 && ids.every(id => pl.tracks && pl.tracks.find(t => String(t.id) === String(id)));
        return {
          id: pl.id,
          name: pl.title || pl.name,
          trackCount: pl.trackCount || (pl.tracks || []).length,
          containsTrack
        };
      });
      return JSON.stringify(pls);
    };

    window.__kyoyuAddToPlaylist = (playlistId, trackId) => {
      const curAlbum = safeAlbumRef.current || window.__kyoyuCurrentNativeAlbum;
      if (!curAlbum || !curAlbum.tracks) return;
      const ids = String(trackId).split(',');
      for (const id of ids) {
        let trackObj = (curAlbum.tracks || []).find(t => String(t.id) === String(id));
        if (trackObj) {
          addToPlaylistRef.current(playlistId, trackObj);
        }
      }
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

    return () => {
      window.removeEventListener('kyoyu-native-like', handleNativeLike);
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuToggleSaveAlbum;
      delete window.__kyoyuIsSavedAlbum;
      delete window.__kyoyuIsTrackInAnyPlaylist;
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
      const myTs = safeAlbumRef.current?._ts;
      if (!myTs || (window.__lastFastOpenTs && String(myTs) === String(window.__lastFastOpenTs))) {
        window.__lastFastOpenTs = 0;
        try {
          window.webkit?.messageHandlers?.player?.postMessage({ albumOpen: false });
        } catch(e) {}
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    urls: Array.isArray(artist.urls) ? artist.urls.filter(Boolean).map(String) : [],
    aliases: Array.isArray(artist.aliases) ? artist.aliases.filter(Boolean).map(String) : [],
    images: Array.isArray(artist.images) ? artist.images.filter(Boolean).map(String) : [],
    topReleases: (Array.isArray(artist.topReleases) ? artist.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      artist: r.artist || r.artistName ? String(r.artist || r.artistName) : String(artist.name || ''),
      label: r.label ? String(r.label) : null,
      catno: r.catno ? String(r.catno) : null,
      format: r.format ? String(r.format) : null,
      provider: r.provider ? String(r.provider) : null,
      trackUrl: r.trackUrl || r.url ? String(r.trackUrl || r.url) : null,
      discogsId: r.discogsId ? String(r.discogsId) : null,
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage || r.artworkUrl || r.thumb ? String(r.coverImage || r.artworkUrl || r.thumb) : null,
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
    parentLabel: label.parentLabel ? String(label.parentLabel) : null,
    sublabels: Array.isArray(label.sublabels) ? label.sublabels.filter(Boolean).map(String) : [],
    contactInfo: label.contactInfo ? String(label.contactInfo) : null,
    country: label.country ? String(label.country) : null,
    location: label.location ? String(label.location) : null,
    genres: Array.isArray(label.genres) ? label.genres.filter(Boolean).map(String) : [],
    sources: Array.isArray(label.sources) ? label.sources.filter(Boolean).map(String) : [],
    urls: Array.isArray(label.urls) ? label.urls.filter(Boolean).map(String) : [],
    images: Array.isArray(label.images) ? label.images.filter(Boolean).map(String) : [],
    topReleases: (Array.isArray(label.topReleases) ? label.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      artist: r.artist || r.artistName ? String(r.artist || r.artistName) : null,
      label: r.label ? String(r.label) : String(label.name || ''),
      catno: r.catno ? String(r.catno) : null,
      format: r.format ? String(r.format) : null,
      provider: r.provider ? String(r.provider) : null,
      trackUrl: r.trackUrl || r.url ? String(r.trackUrl || r.url) : null,
      discogsId: r.discogsId ? String(r.discogsId) : null,
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage || r.artworkUrl || r.thumb ? String(r.coverImage || r.artworkUrl || r.thumb) : null,
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

const _normStr = (s) => String(s || '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function openRichArtistSheet(artistInput) {
  const isObj = artistInput && typeof artistInput === 'object';
  const rawName = isObj ? (artistInput.name || artistInput.artistName || artistInput.title || '') : String(artistInput || '');
  const cleanName = String(rawName).replace(/\s*\(\d+\)\s*$/, '').trim();
  if (!cleanName) return;

  const initialArtist = {
    id: (isObj && artistInput.id) ? String(artistInput.id) : `artist-${_normStr(cleanName)}`,
    name: cleanName,
    realname: isObj ? (artistInput.realname || null) : null,
    profile: isObj ? (artistInput.profile || null) : null,
    urls: isObj && Array.isArray(artistInput.urls) ? artistInput.urls : (isObj && artistInput.url ? [artistInput.url] : []),
    aliases: isObj && Array.isArray(artistInput.aliases) ? artistInput.aliases : [],
    images: isObj && Array.isArray(artistInput.images) && artistInput.images.length
      ? artistInput.images
      : (isObj && (artistInput.profileAvatar || artistInput.cover || artistInput.artworkUrl) ? [artistInput.profileAvatar || artistInput.cover || artistInput.artworkUrl] : []),
    topReleases: isObj && Array.isArray(artistInput.topReleases) ? artistInput.topReleases : [],
  };

  // Show sheet immediately
  openNativeArtistFast(initialArtist);

  try {
    const artistId = (isObj && artistInput.provider === 'discogs' && /^\d+$/.test(String(artistInput.id || '')))
      ? artistInput.id
      : (isObj && artistInput.discogsId ? artistInput.discogsId : null);

    const r = await fetch('/api/discogs-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'artist-profile', artistId, artistName: cleanName }),
    });
    if (r.ok) {
      const profile = await r.json();
      if (profile && !profile.error) {
        const mergedUrls = Array.from(new Set([...(initialArtist.urls || []), ...(profile.urls || []), profile.id ? `https://www.discogs.com/artist/${profile.id}` : ''])).filter(Boolean);
        const mergedImages = (profile.images && profile.images.length) ? profile.images : initialArtist.images;
        const mergedReleases = (profile.topReleases || []).map(rel => ({
          ...rel,
          id: String(rel.id || `discogs-a-${rel.discogsId || Math.random()}`),
          discogsId: rel.discogsId ? String(rel.discogsId) : null,
          title: rel.title || 'Unknown',
          artist: rel.artist || rel.artistName || cleanName,
          label: Array.isArray(rel.labels) ? rel.labels[0] : (rel.label || null),
          year: rel.year ? String(rel.year) : null,
          thumb: rel.thumb || rel.coverImage || null,
          coverImage: rel.coverImage || rel.thumb || null,
          type: rel.type || 'release',
          provider: 'discogs',
        }));

        openNativeArtistFast({
          ...initialArtist,
          ...profile,
          name: (profile.name || cleanName).replace(/\s*\(\d+\)\s*$/, ''),
          images: mergedImages,
          urls: mergedUrls,
          topReleases: mergedReleases.length ? mergedReleases : initialArtist.topReleases,
        });
      }
    }
  } catch (err) {
    console.warn('[openRichArtistSheet] error:', err);
  }
}

export async function openRichLabelSheet(labelInput) {
  const isObj = labelInput && typeof labelInput === 'object';
  const rawName = isObj ? (labelInput.name || labelInput.label || labelInput.title || labelInput.artistName || '') : String(labelInput || '');
  const cleanName = String(rawName).replace(/\s*\(\d+\)\s*$/, '').trim();
  if (!cleanName) return;

  const initialUrls = [];
  if (isObj) {
    if (Array.isArray(labelInput.urls)) initialUrls.push(...labelInput.urls);
    if (labelInput.url) initialUrls.push(labelInput.url);
    if (labelInput.trackUrl) initialUrls.push(labelInput.trackUrl);
  }
  const initialImages = [];
  if (isObj) {
    if (Array.isArray(labelInput.images)) initialImages.push(...labelInput.images);
    const singleImg = labelInput.profileAvatar || labelInput.cover || labelInput.artworkUrl || labelInput.coverImage || labelInput.thumb;
    if (singleImg) initialImages.push(singleImg);
  }

  let currentLabel = {
    id: (isObj && labelInput.id) ? String(labelInput.id) : `label-${_normStr(cleanName)}`,
    name: cleanName,
    profile: isObj ? (labelInput.profile || null) : null,
    parentLabel: isObj ? (labelInput.parentLabel || null) : null,
    sublabels: isObj && Array.isArray(labelInput.sublabels) ? labelInput.sublabels : [],
    contactInfo: isObj ? (labelInput.contactInfo || null) : null,
    country: isObj ? (labelInput.country || null) : null,
    location: isObj ? (labelInput.location || null) : null,
    genres: isObj && Array.isArray(labelInput.genres) ? labelInput.genres : [],
    sources: isObj && labelInput.provider ? [String(labelInput.provider)] : [],
    urls: Array.from(new Set(initialUrls)).filter(Boolean),
    images: Array.from(new Set(initialImages)).filter(Boolean),
    topReleases: isObj && Array.isArray(labelInput.topReleases) ? labelInput.topReleases : [],
  };

  // Open immediately so user sees the sheet right away
  openNativeLabelFast(currentLabel);

  const labelId = (isObj && labelInput.provider === 'discogs' && /^\d+$/.test(String(labelInput.id || '')))
    ? labelInput.id
    : (isObj && labelInput.discogsId ? labelInput.discogsId : null);

  let bcUrl = initialUrls.find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';

  // 1. Fetch Discogs label profile & releases, and Bandcamp search in parallel
  const discogsPromise = fetch('/api/discogs-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'label-profile', labelId, labelName: cleanName }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  const bcSearchPromise = (!bcUrl)
    ? fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanName }),
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  const [discogsData, bcSearchData] = await Promise.all([discogsPromise, bcSearchPromise]);

  // Discover Bandcamp URL from Discogs urls or Bandcamp search results if not yet known
  if (!bcUrl && discogsData && Array.isArray(discogsData.urls)) {
    bcUrl = discogsData.urls.find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';
  }
  if (!bcUrl && bcSearchData && Array.isArray(bcSearchData.results)) {
    const targetNorm = _normStr(cleanName);
    const bcHit = bcSearchData.results.find(item =>
      (item.type === 'label' || item.type === 'artist') &&
      (_normStr(item.title) === targetNorm || _normStr(item.artistName) === targetNorm || _normStr(item.title).includes(targetNorm))
    );
    if (bcHit && (bcHit.trackUrl || bcHit.url)) {
      bcUrl = bcHit.trackUrl || bcHit.url;
      if (bcHit.artworkUrl && !currentLabel.images.includes(bcHit.artworkUrl)) {
        currentLabel.images.push(bcHit.artworkUrl);
      }
      if (bcHit.location && !currentLabel.location) {
        currentLabel.location = bcHit.location;
      }
    }
  }

  // Merge Discogs data right away and push an intermediate update
  const mergeAndEmit = (dc, bc) => {
    const sources = new Set(currentLabel.sources || []);
    const urls = new Set(currentLabel.urls || []);
    const images = new Set(currentLabel.images || []);
    const genres = new Set(currentLabel.genres || []);

    let profileParts = [];
    if (dc && !dc.error) {
      sources.add('Discogs');
      if (dc.profile) profileParts.push(dc.profile.trim());
      (dc.urls || []).forEach(u => urls.add(u));
      if (dc.discogsUrl) urls.add(dc.discogsUrl);
      (dc.images || []).forEach(img => images.add(img));
    }
    if (bc && !bc.error) {
      sources.add('Bandcamp');
      if (bc.bio && (!profileParts[0] || !profileParts[0].toLowerCase().includes(bc.bio.slice(0, 40).toLowerCase()))) {
        profileParts.push(bc.bio.trim());
      }
      if (bc.imageUrl) images.add(bc.imageUrl);
      (bc.links || []).forEach(u => urls.add(u));
    }
    if (bcUrl) urls.add(bcUrl.replace(/\/music\/?$/, ''));

    // Merge releases from Discogs and Bandcamp (deduplicated by title)
    const releaseMap = new Map();
    const addRelease = (rel) => {
      if (!rel || !rel.title) return;
      let titleStr = String(rel.title).trim();
      let artistStr = String(rel.artist || rel.artistName || '').trim();
      // Sometimes Bandcamp title is "Artist - Title" when artist is empty
      if (!artistStr && titleStr.includes(' - ')) {
        const parts = titleStr.split(' - ');
        artistStr = parts[0].trim();
        titleStr = parts.slice(1).join(' - ').trim();
      }
      const key = _normStr(titleStr);
      if (!key) return;
      const existing = releaseMap.get(key);
      if (!existing) {
        releaseMap.set(key, {
          id: String(rel.id || `rel-${key}-${Math.random()}`),
          title: titleStr,
          artist: artistStr || cleanName,
          label: cleanName,
          catno: rel.catno || null,
          format: rel.format || null,
          provider: rel.provider || 'discogs',
          trackUrl: rel.trackUrl || rel.url || null,
          discogsId: rel.discogsId ? String(rel.discogsId) : null,
          year: rel.year ? String(rel.year) : null,
          thumb: rel.artworkUrl || rel.coverImage || rel.thumb || null,
          coverImage: rel.artworkUrl || rel.coverImage || rel.thumb || null,
          type: rel.type || 'release',
        });
      } else {
        // Enrich existing release with Bandcamp URL / high-res artwork or Discogs year/catno
        if (!existing.trackUrl && (rel.trackUrl || rel.url)) {
          existing.trackUrl = rel.trackUrl || rel.url;
          existing.provider = 'bandcamp';
        }
        if ((rel.artworkUrl || '').includes('bcbits.com')) {
          existing.coverImage = rel.artworkUrl;
          existing.thumb = rel.artworkUrl;
        } else if (!existing.coverImage && (rel.coverImage || rel.thumb || rel.artworkUrl)) {
          existing.coverImage = rel.coverImage || rel.thumb || rel.artworkUrl;
          existing.thumb = existing.coverImage;
        }
        if (!existing.year && rel.year) existing.year = String(rel.year);
        if (!existing.catno && rel.catno) existing.catno = rel.catno;
        if (!existing.format && rel.format) existing.format = rel.format;
        if (!existing.discogsId && rel.discogsId) existing.discogsId = String(rel.discogsId);
        if ((!existing.artist || existing.artist === cleanName) && artistStr) existing.artist = artistStr;
      }
    };

    if (bc && Array.isArray(bc.releases)) {
      bc.releases.forEach(r => addRelease({
        id: `bc-lbl-${_normStr(r.title)}`,
        title: r.title,
        artist: r.artist || cleanName,
        artworkUrl: r.artworkUrl ? r.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : '',
        trackUrl: r.url,
        provider: 'bandcamp',
        type: 'release',
      }));
    }
    if (dc && Array.isArray(dc.topReleases)) {
      dc.topReleases.forEach(r => addRelease(r));
    }
    (currentLabel.topReleases || []).forEach(r => addRelease(r));

    const mergedReleases = Array.from(releaseMap.values());

    currentLabel = {
      ...currentLabel,
      id: (dc && dc.id) ? String(dc.id) : currentLabel.id,
      name: (dc && dc.name) ? dc.name : currentLabel.name,
      profile: profileParts.filter(Boolean).join('\n\n') || currentLabel.profile || null,
      parentLabel: (dc && dc.parentLabel) ? dc.parentLabel : currentLabel.parentLabel,
      sublabels: (dc && Array.isArray(dc.sublabels) && dc.sublabels.length) ? dc.sublabels : currentLabel.sublabels,
      contactInfo: (dc && dc.contactInfo) ? dc.contactInfo : currentLabel.contactInfo,
      location: (bc && bc.location) ? bc.location : currentLabel.location,
      genres: Array.from(genres),
      sources: Array.from(sources),
      urls: Array.from(urls).filter(Boolean),
      images: Array.from(images).filter(Boolean),
      topReleases: mergedReleases,
    };

    openNativeLabelFast(currentLabel);
  };

  if (discogsData && !discogsData.error) {
    mergeAndEmit(discogsData, null);
  }

  // 2. If we have a Bandcamp URL, resolve Bandcamp label releases, bio, location, and links
  if (bcUrl) {
    try {
      const bcRes = await fetch('/api/bandcamp-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'label-releases', url: bcUrl }),
      });
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        mergeAndEmit(discogsData, bcData);
      }
    } catch (e) {}
  }
}

export async function openReleaseFromSheet(releaseObj) {
  if (!releaseObj) return;
  const title = releaseObj.title || '';
  const artist = releaseObj.artist || releaseObj.artistName || '';
  const label = releaseObj.label || '';
  const cover = releaseObj.coverImage || releaseObj.thumb || releaseObj.artworkUrl || '';
  const year = releaseObj.year ? String(releaseObj.year) : null;
  const trackUrl = releaseObj.trackUrl || releaseObj.url || '';
  const discogsId = releaseObj.discogsId || (String(releaseObj.id || '').match(/^discogs-[a-z]-([a-z]+)-(\d+)$/)?.[2]) || '';
  const discogsType = releaseObj.type || (String(releaseObj.id || '').match(/^discogs-[a-z]-([a-z]+)-(\d+)$/)?.[1]) || 'release';

  // 1. Open native album sheet immediately with skeleton/known metadata so transition is instant
  const tempAlbumId = releaseObj.id || `sheet-rel-${Date.now()}`;
  openNativeAlbumFast({
    id: tempAlbumId,
    title,
    artist,
    cover,
    year,
    label,
    provider: releaseObj.provider || (trackUrl.includes('bandcamp.com') ? 'bandcamp' : 'discogs'),
    tracks: [
      {
        id: `${tempAlbumId}-0`,
        title: title || 'Loading tracks...',
        artist,
        url: trackUrl || `resolve:${artist} ${title}`.trim(),
        cover,
        provider: trackUrl.includes('bandcamp.com') ? 'bandcamp' : '',
      }
    ],
  });

  try {
    // 2. Bandcamp album/track URL
    if (trackUrl && trackUrl.includes('bandcamp.com')) {
      const [bcRes, dcInfoRes] = await Promise.all([
        fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-album', albumUrl: trackUrl }),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'track-info', title, artist, album: title }),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      let tracks = [];
      if (bcRes && Array.isArray(bcRes.tracks) && bcRes.tracks.length > 0) {
        tracks = bcRes.tracks.map((t, idx) => ({
          id: `bc-${t.trackId || idx}-${Date.now()}`,
          title: t.title || `Track ${idx + 1}`,
          artist: t.artist || artist,
          url: t.streamUrl || t.trackUrl || trackUrl,
          trackUrl: t.trackUrl || trackUrl,
          providerItemId: t.trackUrl || trackUrl,
          cover: t.artworkUrl || cover,
          provider: 'bandcamp',
        }));
      }

      const info = dcInfoRes || {};
      openNativeAlbumFast({
        id: tempAlbumId,
        title: info.album || title,
        artist: info.artist || artist,
        cover: cover || info.coverImage || info.thumb || '',
        year: info.year || year,
        genre: info.genre || '',
        label: info.label || label,
        provider: 'bandcamp',
        description: info.description || '',
        tracks: tracks.length > 0 ? tracks : [
          {
            id: `${tempAlbumId}-0`,
            title,
            artist,
            url: trackUrl,
            trackUrl,
            providerItemId: trackUrl,
            cover,
            provider: 'bandcamp',
          }
        ],
      });
      return;
    }

    // 3. Discogs release or master ID
    if (discogsId) {
      const r = await fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release-details', releaseId: discogsId, releaseType: discogsType }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d && Array.isArray(d.tracks) && d.tracks.length > 0) {
          openNativeAlbumFast({
            id: `discogs-${discogsId}`,
            title: d.title || title,
            artist: d.artist || artist,
            cover: d.cover || cover,
            year: d.year || year,
            genre: d.genre || '',
            label: d.label || label,
            provider: 'discogs',
            description: d.notes || '',
            tracks: d.tracks.map((t, i) => ({
              id: `discogs-${discogsId}-track-${i}`,
              title: `${t.position ? t.position + '. ' : ''}${t.title || ''}`,
              artist: t.artist || d.artist || artist,
              url: `resolve:${t.artist || d.artist || artist} ${t.title || ''}`.trim(),
              cover: d.cover || cover,
              provider: '',
            })),
          });
          return;
        }
      }
    }

    // 4. Fallback to __kyoyuGoToAlbum
    if (window.__kyoyuGoToAlbum) {
      await window.__kyoyuGoToAlbum(artist, title);
    }
  } catch (e) {
    console.warn('[openReleaseFromSheet] error:', e);
  }
}

if (typeof window !== 'undefined') {
  window.__kyoyuOpenArtist = openRichArtistSheet;
  window.__kyoyuOpenLabel = openRichLabelSheet;
  window.__kyoyuOpenReleaseFromSheet = openReleaseFromSheet;
}

