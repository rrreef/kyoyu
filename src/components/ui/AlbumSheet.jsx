import { useLayoutEffect, useRef } from 'react';
import { usePlayer, historyReplayInfo, trackIdentity } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { syncProviderLike } from '../../lib/streaming';
import { isItemInConnectedLikes } from '../../lib/useConnectedLibrary';
import { buildInitialGenreSheetPayload, resolveGenreNode } from '../../lib/genreIntelligence';

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
    foundedYear: label.foundedYear ? String(label.foundedYear) : null,
    founders: Array.isArray(label.founders) ? label.founders.filter(Boolean).map(String) : [],
    labelType: label.labelType ? String(label.labelType) : null,
    labelCode: label.labelCode ? String(label.labelCode) : null,
    aliases: Array.isArray(label.aliases) ? label.aliases.filter(Boolean).map(String) : [],
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
const _normLabelCore = (s) => {
  const full = _normStr(s);
  const stripped = full.replace(/\b(records|recordings|record|label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos)\b/g, '').replace(/\s+/g, ' ').trim();
  return stripped || full;
};

function _prioritizeAndDedupeLinks(rawUrls) {
  const cleaned = [];
  const seenKey = new Set();
  const seenPlatform = new Set();

  const platformOf = (u) => {
    const l = u.toLowerCase();
    if (l.includes('discogs.com')) return 'discogs';
    if (l.includes('musicbrainz.org')) return 'musicbrainz';
    if (l.includes('instagram.com')) return 'instagram';
    if (l.includes('bandcamp.com')) return 'bandcamp';
    if (l.includes('soundcloud.com')) return 'soundcloud';
    if (l.includes('ra.co') || l.includes('residentadvisor.')) return 'ra';
    if (l.includes('youtube.com') || l.includes('youtu.be')) return 'youtube';
    if (l.includes('facebook.com')) return 'facebook';
    if (l.includes('twitter.com') || l.includes('x.com')) return 'twitter';
    if (l.includes('wikidata.org') || l.includes('wikipedia.org')) return 'wiki';
    return null;
  };

  const rankOf = (u) => {
    const p = platformOf(u);
    if (p === 'discogs') return 1;
    if (p === 'musicbrainz') return 2;
    if (p === 'instagram') return 3;
    if (p === 'bandcamp') return 4;
    if (p === 'soundcloud') return 5;
    if (p === 'ra') return 6;
    if (p === 'youtube') return 7;
    if (!p) return 8; // Official website
    if (p === 'facebook') return 9;
    if (p === 'twitter') return 10;
    return 11;
  };

  for (const raw of (rawUrls || [])) {
    if (!raw || typeof raw !== 'string') continue;
    let u = raw.trim().replace(/[.,;]+$/, '');
    if (!/^https?:\/\//i.test(u)) continue;
    // Upgrade http -> https for known platforms
    u = u.replace(/^http:\/\//i, 'https://');
    if (u.includes('bandcamp.com')) {
      u = u.replace(/\/music\/?$/i, '');
    }
    const normKey = u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    if (!normKey || seenKey.has(normKey)) continue;
    const plat = platformOf(u);
    // Keep only one link per major platform (e.g., avoid two Discogs or two Bandcamp links)
    if (plat && ['discogs', 'musicbrainz', 'instagram', 'bandcamp', 'soundcloud', 'ra'].includes(plat)) {
      if (seenPlatform.has(plat)) continue;
      seenPlatform.add(plat);
    }
    seenKey.add(normKey);
    cleaned.push(u);
  }

  return cleaned.sort((a, b) => rankOf(a) - rankOf(b));
}

export async function openRichArtistSheet(artistInput) {
  const isObj = artistInput && typeof artistInput === 'object';
  const rawName = isObj ? (artistInput.name || artistInput.artistName || artistInput.title || '') : String(artistInput || '');
  const cleanName = String(rawName).replace(/\s*\(\d+\)\s*$/, '').trim();
  if (!cleanName) return;

  // If the item is already marked as a label or its name clearly indicates a record label, open the Label Sheet directly
  if (isObj && (artistInput.entityType === 'label' || artistInput.type === 'label')) {
    return openRichLabelSheet(artistInput);
  }
  const hasExplicitArtistDiscogsId = isObj && artistInput.provider === 'discogs' && artistInput.entityType === 'artist' && /^\d+$/.test(String(artistInput.discogsId || artistInput.id || ''));
  if (!hasExplicitArtistDiscogsId && /\b(records|recordings|record label|disques|schallplatten)\b/i.test(cleanName)) {
    return openRichLabelSheet(artistInput);
  }

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
      // If Discogs determined that this name is actually a Record Label (not an artist), switch to Label Sheet immediately!
      if (profile && profile.isLabel) {
        return openRichLabelSheet({
          ...(isObj ? artistInput : {}),
          id: profile.labelId || initialArtist.id,
          discogsId: profile.labelId || null,
          name: profile.labelName || cleanName,
          provider: 'discogs',
        });
      }
      if (profile && !profile.error) {
        const mergedUrls = _prioritizeAndDedupeLinks([
          ...(initialArtist.urls || []),
          ...(profile.urls || []),
          profile.id ? `https://www.discogs.com/artist/${profile.id}` : '',
        ]);
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
    foundedYear: isObj ? (labelInput.foundedYear || null) : null,
    founders: isObj && Array.isArray(labelInput.founders) ? labelInput.founders : [],
    labelType: isObj ? (labelInput.labelType || null) : null,
    labelCode: isObj ? (labelInput.labelCode || null) : null,
    aliases: isObj && Array.isArray(labelInput.aliases) ? labelInput.aliases : [],
    country: isObj ? (labelInput.country || null) : null,
    location: isObj ? (labelInput.location || null) : null,
    genres: isObj && Array.isArray(labelInput.genres) ? labelInput.genres : [],
    sources: isObj && labelInput.provider ? [
      labelInput.provider === 'discogs' ? 'Discogs'
      : labelInput.provider === 'bandcamp' ? 'Bandcamp'
      : String(labelInput.provider)
    ] : [],
    urls: _prioritizeAndDedupeLinks(initialUrls),
    images: Array.from(new Set(initialImages)).filter(Boolean),
    topReleases: isObj && Array.isArray(labelInput.topReleases) ? labelInput.topReleases : [],
  };

  // Open immediately so user sees the sheet right away
  openNativeLabelFast(currentLabel);

  const labelId = (isObj && labelInput.provider === 'discogs' && /^\d+$/.test(String(labelInput.id || '')))
    ? labelInput.id
    : (isObj && labelInput.discogsId ? labelInput.discogsId : null);

  let bcUrl = initialUrls.find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';

  // 1. Fetch Discogs + MusicBrainz label profile & releases, and Bandcamp search in parallel
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

  // Discover Bandcamp URL from Discogs/MusicBrainz urls or Bandcamp search results if not yet known
  if (!bcUrl && discogsData) {
    if (discogsData.bandcampUrl) bcUrl = discogsData.bandcampUrl;
    else if (Array.isArray(discogsData.urls)) {
      bcUrl = discogsData.urls.find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';
    }
  }
  if (bcSearchData && Array.isArray(bcSearchData.results)) {
    const targetNorm = _normStr(cleanName);
    const targetCore = _normLabelCore(cleanName);
    const bcHit = bcSearchData.results.find(item =>
      (item.type === 'label' || item.type === 'artist') &&
      (_normStr(item.title) === targetNorm ||
       _normLabelCore(item.title) === targetCore ||
       _normStr(item.artistName) === targetNorm ||
       _normStr(item.title).includes(targetCore) ||
       targetCore.includes(_normLabelCore(item.title)))
    );
    if (bcHit) {
      if (!bcUrl && (bcHit.trackUrl || bcHit.url)) {
        bcUrl = bcHit.trackUrl || bcHit.url;
      }
      if (bcHit.artworkUrl && !currentLabel.images.includes(bcHit.artworkUrl)) {
        currentLabel.images.push(bcHit.artworkUrl);
      }
      if (bcHit.location && !currentLabel.location) {
        currentLabel.location = bcHit.location;
      }
    }
  }

  // Merge Discogs + MusicBrainz + Bandcamp data and emit to native LabelSheetView
  const mergeAndEmit = (dc, bc) => {
    const sources = new Set(currentLabel.sources || []);
    const rawUrls = [...(currentLabel.urls || [])];
    const images = new Set(currentLabel.images || []);
    const genres = new Set(currentLabel.genres || []);

    let profileParts = [];
    if (dc && !dc.error) {
      if (Array.isArray(dc.sources) && dc.sources.length) {
        dc.sources.forEach(s => sources.add(s));
      } else {
        sources.add('Discogs');
      }
      if (dc.profile) profileParts.push(dc.profile.trim());
      if (dc.discogsUrl) rawUrls.push(dc.discogsUrl);
      if (dc.mbUrl) rawUrls.push(dc.mbUrl);
      if (dc.bandcampUrl) rawUrls.push(dc.bandcampUrl);
      (dc.urls || []).forEach(u => rawUrls.push(u));
      (dc.images || []).forEach(img => images.add(img));
      (dc.genres || []).forEach(g => genres.add(g));
    }
    if (bc && !bc.error) {
      sources.add('Bandcamp');
      if (bc.bio) {
        const bcBioClean = bc.bio.trim();
        const alreadyIncluded = profileParts.some(p =>
          p.toLowerCase().includes(bcBioClean.slice(0, 45).toLowerCase()) ||
          bcBioClean.toLowerCase().includes(p.slice(0, 45).toLowerCase())
        );
        if (!alreadyIncluded) {
          profileParts.push(bcBioClean);
        } else if (bcBioClean.length > (profileParts[0]?.length || 0)) {
          profileParts[0] = bcBioClean;
        }
      }
      if (bc.imageUrl) images.add(bc.imageUrl);
      (bc.links || []).forEach(u => rawUrls.push(u));
    }
    if (bcUrl) {
      sources.add('Bandcamp');
      rawUrls.push(bcUrl.replace(/\/music\/?$/, ''));
    }

    const canonicalLabelName = (dc && dc.name) ? dc.name : ((bc && bc.name) ? bc.name : currentLabel.name);

    // Merge releases from Discogs and Bandcamp (deduplicated by normalized title)
    const releaseMap = new Map();
    const addRelease = (rel) => {
      if (!rel || !rel.title) return;
      let titleStr = String(rel.title).trim();
      let artistStr = String(rel.artist || rel.artistName || '').trim();
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
          artist: artistStr || canonicalLabelName,
          label: canonicalLabelName,
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
        if ((!existing.artist || existing.artist === canonicalLabelName) && artistStr) existing.artist = artistStr;
      }
    };

    if (bc && Array.isArray(bc.releases)) {
      bc.releases.forEach(r => addRelease({
        id: `bc-lbl-${_normStr(r.title)}`,
        title: r.title,
        artist: r.artist || canonicalLabelName,
        year: r.year || null,
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

    // If label has no profile image yet, fall back to the first release's cover
    const finalImages = Array.from(images).filter(Boolean);
    if (finalImages.length === 0 && mergedReleases.length > 0) {
      const firstCover = mergedReleases.find(r => r.coverImage || r.thumb)?.coverImage;
      if (firstCover) finalImages.push(firstCover);
    }

    // Order sources cleanly: Discogs, MusicBrainz, Bandcamp
    const sourceOrder = ['Discogs', 'MusicBrainz', 'Bandcamp'];
    const orderedSources = Array.from(sources).sort((a, b) => {
      const ia = sourceOrder.indexOf(a);
      const ib = sourceOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    currentLabel = {
      ...currentLabel,
      id: (dc && dc.id) ? String(dc.id) : currentLabel.id,
      name: canonicalLabelName,
      profile: profileParts.filter(Boolean).join('\n\n') || currentLabel.profile || null,
      parentLabel: (dc && dc.parentLabel) ? dc.parentLabel : currentLabel.parentLabel,
      sublabels: (dc && Array.isArray(dc.sublabels) && dc.sublabels.length) ? dc.sublabels : currentLabel.sublabels,
      contactInfo: (dc && dc.contactInfo) ? dc.contactInfo : currentLabel.contactInfo,
      foundedYear: (dc && dc.foundedYear) ? String(dc.foundedYear) : currentLabel.foundedYear,
      founders: (dc && Array.isArray(dc.founders) && dc.founders.length) ? dc.founders : currentLabel.founders,
      labelType: (dc && dc.labelType) ? dc.labelType : currentLabel.labelType,
      labelCode: (dc && dc.labelCode) ? dc.labelCode : currentLabel.labelCode,
      aliases: (dc && Array.isArray(dc.aliases) && dc.aliases.length) ? dc.aliases : currentLabel.aliases,
      country: (dc && dc.country) ? dc.country : currentLabel.country,
      location: (bc && bc.location) ? bc.location : ((dc && dc.location) ? dc.location : currentLabel.location),
      genres: Array.from(genres),
      sources: orderedSources,
      urls: _prioritizeAndDedupeLinks(rawUrls),
      images: finalImages,
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

export function openNativeGenreFast(genreObj) {
  if (!genreObj) return null;
  const ts = Date.now();
  window.__lastFastOpenGenreTs = ts;

  const safeGenre = {
    id: String(genreObj.id || `genre-${Math.random()}`),
    name: String(genreObj.name || 'Electronic'),
    superGenre: String(genreObj.superGenre || 'Electronic'),
    secondarySuperGenre: genreObj.secondarySuperGenre ? String(genreObj.secondarySuperGenre) : null,
    aliases: Array.isArray(genreObj.aliases) ? genreObj.aliases.filter(Boolean).map(String) : [],
    siblingGroup: genreObj.siblingGroup ? String(genreObj.siblingGroup) : null,
    originYear: String(genreObj.originYear || ''),
    originPlace: String(genreObj.originPlace || ''),
    bpmRange: String(genreObj.bpmRange || ''),
    rhythmProfile: String(genreObj.rhythmProfile || ''),
    sonicTraits: Array.isArray(genreObj.sonicTraits) ? genreObj.sonicTraits.filter(Boolean).map(String) : [],
    description: String(genreObj.description || ''),
    parentGenres: Array.isArray(genreObj.parentGenres) ? genreObj.parentGenres.filter(Boolean).map(String) : [],
    influences: Array.isArray(genreObj.influences) ? genreObj.influences.filter(Boolean).map(String) : [],
    subgenres: Array.isArray(genreObj.subgenres) ? genreObj.subgenres.filter(Boolean).map(String) : [],
    adjacentGenres: Array.isArray(genreObj.adjacentGenres) ? genreObj.adjacentGenres.filter(Boolean).map(String) : [],
    backlashAgainst: Array.isArray(genreObj.backlashAgainst) ? genreObj.backlashAgainst.filter(Boolean).map(String) : [],
    pioneerArtists: Array.isArray(genreObj.pioneerArtists) ? genreObj.pioneerArtists.filter(Boolean).map(String) : [],
    classicLabels: Array.isArray(genreObj.classicLabels) ? genreObj.classicLabels.filter(Boolean).map(String) : [],
    eventContexts: Array.isArray(genreObj.eventContexts) ? genreObj.eventContexts.filter(Boolean).map(String) : [],
    provenance: Array.isArray(genreObj.provenance) ? genreObj.provenance.filter(Boolean).map(String) : [],
    contextTrackTitle: genreObj.contextTrackTitle ? String(genreObj.contextTrackTitle) : null,
    contextArtistName: genreObj.contextArtistName ? String(genreObj.contextArtistName) : null,
    similarTracks: (Array.isArray(genreObj.similarTracks) ? genreObj.similarTracks : []).map(t => ({
      id: String(t.id || Math.random()),
      title: String(t.title || 'Unknown'),
      artist: t.artist || t.artistName ? String(t.artist || t.artistName) : null,
      label: t.label ? String(t.label) : null,
      catno: t.catno ? String(t.catno) : null,
      format: t.format ? String(t.format) : null,
      provider: t.provider ? String(t.provider) : null,
      trackUrl: t.trackUrl || t.url ? String(t.trackUrl || t.url) : null,
      discogsId: t.discogsId ? String(t.discogsId) : null,
      year: t.year ? String(t.year) : null,
      thumb: t.thumb || t.cover ? String(t.thumb || t.cover) : null,
      coverImage: t.coverImage || t.cover || t.artworkUrl || t.thumb ? String(t.coverImage || t.cover || t.artworkUrl || t.thumb) : null,
      type: t.type ? String(t.type) : 'track',
    })),
  };

  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_genre',
      genre: safeGenre,
    });
  } catch (e) {
    console.error('Failed to open native genre sheet', e);
  }
  try {
    window.dispatchEvent(new CustomEvent('kyoyu-open-web-genre', { detail: safeGenre }));
  } catch (e) {}
  return safeGenre;
}

export async function openRichGenreSheet(genreInput, contextInput = null) {
  const isObj = genreInput && typeof genreInput === 'object';
  const rawGenre = isObj ? (genreInput.name || genreInput.genre || '') : String(genreInput || '');
  const cleanGenre = String(rawGenre).trim();
  if (!cleanGenre) return;

  // Gather active track context if not explicitly provided
  const curTrack = (typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack)
    ? window.__kyoyuGetCurrentTrack()
    : null;
  const ctxArtist = (contextInput && contextInput.artist) || (isObj && genreInput.artist) || curTrack?.artistName || curTrack?.artist || '';
  const ctxTitle = (contextInput && contextInput.title) || (isObj && genreInput.title) || curTrack?.title || '';
  const ctxAlbum = (contextInput && contextInput.album) || curTrack?.releaseTitle || curTrack?.album || '';
  let ctxLabel = (contextInput && contextInput.label) || curTrack?.label || curTrack?.labelName || '';

  // Check cached track-info for collaborators, remixers, label, and aliases
  const collaborators = [];
  const cacheKey = [ctxArtist, ctxAlbum || ctxTitle].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
  const cachedInfo = (typeof window !== 'undefined' && window.__kyoyuInfoCache && cacheKey)
    ? window.__kyoyuInfoCache[cacheKey]
    : null;
  if (cachedInfo) {
    if (!ctxLabel && cachedInfo.label) ctxLabel = cachedInfo.label;
    (cachedInfo.releaseArtists || []).forEach(a => collaborators.push(a));
    (cachedInfo.artistMembers || []).forEach(m => collaborators.push(m));
    (cachedInfo.artistAliases || []).forEach(al => collaborators.push(al));
    (cachedInfo.credits?.mixing || []).forEach(m => collaborators.push(m));
    (cachedInfo.credits?.mastering || []).forEach(m => collaborators.push(m));
  }

  let currentPayload = buildInitialGenreSheetPayload(cleanGenre, {
    artist: ctxArtist,
    title: ctxTitle,
    label: ctxLabel,
    collaborators,
  });

  // 1. Open immediately (0ms latency) with rich ontology + current context
  openNativeGenreFast(currentPayload);

  // 2. Enrich asynchronously from Discogs genre-explore + Bandcamp search
  try {
    const node = resolveGenreNode(cleanGenre);
    const searchGenreTerm = node.name.split(/[\/&]/)[0].trim();

    const [dcGenreRes, bcSearchRes] = await Promise.all([
      fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'genre-explore', genre: searchGenreTerm, artist: ctxArtist }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${searchGenreTerm} ${node.classicLabels?.[0] || ''}`.trim() }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const mergedTracks = [];
    const seenTrackKeys = new Set();
    const addSimilar = (item) => {
      if (!item || !item.title) return;
      const key = `${_normStr(item.artist || '')}|${_normStr(item.title || '')}`;
      if (!key || seenTrackKeys.has(key)) return;
      seenTrackKeys.add(key);
      mergedTracks.push(item);
    };

    // Add Bandcamp playable cuts first (since they have direct artwork & Bandcamp URLs)
    if (bcSearchRes && Array.isArray(bcSearchRes.results)) {
      bcSearchRes.results
        .filter(r => r.type === 'track' || r.type === 'album')
        .slice(0, 6)
        .forEach((r, idx) => {
          addSimilar({
            id: `bc-genre-${idx}-${Date.now()}`,
            title: r.title || 'Unknown',
            artist: r.artistName || r.artist || '',
            label: r.labelName || r.albumTitle || '',
            year: r.year ? String(r.year) : '',
            trackUrl: r.trackUrl || r.url || '',
            coverImage: r.artworkUrl ? r.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : '',
            thumb: r.artworkUrl || '',
            provider: 'bandcamp',
            type: r.type || 'track',
          });
        });
    }

    // Add Discogs genre releases (with cover images & labels)
    const discoveredLabels = new Set(currentPayload.classicLabels || []);
    const discoveredArtists = new Set(currentPayload.pioneerArtists || []);
    if (dcGenreRes && Array.isArray(dcGenreRes.releases)) {
      dcGenreRes.releases.forEach(rel => {
        if (rel.label && !/not on label/i.test(rel.label)) discoveredLabels.add(rel.label);
        if (rel.artist && !/various/i.test(rel.artist)) discoveredArtists.add(rel.artist);
        addSimilar({
          id: rel.id || `dc-genre-${Math.random()}`,
          discogsId: rel.discogsId || '',
          title: rel.title || 'Unknown',
          artist: rel.artist || '',
          label: rel.label || '',
          year: rel.year ? String(rel.year) : '',
          trackUrl: `resolve:${rel.artist || ''} ${rel.title || ''}`.trim(),
          coverImage: rel.coverImage || rel.thumb || '',
          thumb: rel.thumb || rel.coverImage || '',
          provider: 'discogs',
          type: rel.type || 'release',
        });
      });
    }

    // Keep canonical reference tracks as well
    (currentPayload.similarTracks || []).forEach(rt => addSimilar(rt));

    currentPayload = {
      ...currentPayload,
      pioneerArtists: Array.from(discoveredArtists).slice(0, 20),
      classicLabels: Array.from(discoveredLabels).slice(0, 20),
      similarTracks: mergedTracks.slice(0, 18),
    };

    openNativeGenreFast(currentPayload);
  } catch (err) {
    console.warn('[openRichGenreSheet] enrich error:', err);
  }
}

export async function playGenreTrack(trackItem) {
  if (!trackItem) return;
  const obj = typeof trackItem === 'string' ? JSON.parse(trackItem) : trackItem;
  const title = obj.title || '';
  const artist = obj.artist || obj.artistName || '';
  const cover = obj.coverImage || obj.thumb || obj.cover || '';
  const trackUrl = obj.trackUrl || obj.url || '';

  // If it's a Bandcamp album or Discogs release with a discogsId, we can play it immediately via playSaved
  // OR if user tapped a track/reference cut, resolve and play via __kyoyuPlaySaved
  const playable = {
    id: obj.id || `genre-play-${Date.now()}`,
    title,
    artist,
    artistName: artist,
    releaseCover: cover,
    artworkUrl: cover,
    cover,
    src: '',
    audioUrl: '',
    url: trackUrl && !trackUrl.startsWith('resolve:') ? trackUrl : `resolve:${artist} ${title}`.trim(),
    provider: obj.provider === 'bandcamp' ? 'bandcamp' : '',
    providerItemId: obj.provider === 'bandcamp' ? trackUrl : undefined,
  };

  if (window.__kyoyuPlaySaved) {
    window.__kyoyuPlaySaved(playable, [playable]);
  } else if (window.__kyoyuGlobalPlayTrack) {
    window.__kyoyuGlobalPlayTrack(playable, [playable]);
  }
}

if (typeof window !== 'undefined') {
  window.__kyoyuOpenArtist = openRichArtistSheet;
  window.__kyoyuOpenLabel = openRichLabelSheet;
  window.__kyoyuOpenGenre = openRichGenreSheet;
  window.__kyoyuPlayGenreTrack = playGenreTrack;
  window.__kyoyuOpenReleaseFromSheet = openReleaseFromSheet;
}


