import { useLayoutEffect, useRef } from 'react';
import { usePlayer, historyReplayInfo, trackIdentity } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { syncProviderLike, getProviderPriority } from '../../lib/streaming';
import { isItemInConnectedLikes } from '../../lib/useConnectedLibrary';
import { buildInitialGenreSheetPayload, resolveGenreNode, select5050GenreTracks, selectGenreThreeSections, classifyTrackGenre, orderTracksByProviderPriority, buildInitialSceneSheetPayload } from '../../lib/genreIntelligence';

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
      const resolvedCover = (t.cover && t.cover !== '/album1.png' ? t.cover : '')
        || t.artworkUrl
        || t.releaseCover
        || (album.cover && album.cover !== '/album1.png' ? album.cover : '')
        || album.artworkUrl
        || t.cover
        || album.cover
        || '';
      return {
        ...t,
        id: t.id,
        title: t.title || t.name,
        artist: t.artist || t.artistName || album.artist || '',
        cover: resolvedCover,
        artworkUrl: t.artworkUrl || resolvedCover,
        releaseCover: resolvedCover,
        releaseTitle: t.album || t.releaseTitle || album.title || '',
        src, audioUrl: src, url: src,
        trackUrl: t.trackUrl || t.url || undefined,
        duration: t.duration || '',
        provider: (t.provider || album.provider) === 'discogs' ? '' : (t.provider || album.provider || null),
        providerItemId: t.providerItemId || t.trackUrl || undefined,
        scTrackId: t.scTrackId || undefined,
        videoId: t.videoId || undefined,
        spotifyId: t.spotifyId || undefined,
        appleMusicId: t.appleMusicId || undefined,
        tidalId: t.tidalId || undefined,
        origin: t.origin || undefined,
        replay: t.replay || undefined,
        streamFetchedAt: t.streamFetchedAt || undefined,
      };
    });
    const idx = queue.findIndex(q => String(q.id).split('?ts=')[0] === String(trackObj.id).split('?ts=')[0]);
    const target = queue[Math.max(idx, 0)];
    if (!target) return;

    const isResolve = target.src.startsWith('resolve:');
    const fresh = target.streamFetchedAt && Date.now() - target.streamFetchedAt < FRESH_STREAM_MS;
    const needsResolve = isResolve || !target.src || (!fresh && historyReplayInfo(target).provider !== 'native');
    if (needsResolve && window.__kyoyuPlaySaved) {
      window.__kyoyuPlaySaved({ ...target, src: '', audioUrl: '', url: isResolve ? target.src : (target.trackUrl || target.url) }, queue);
      return;
    }
    if (window.__kyoyuGlobalPlayTrack) window.__kyoyuGlobalPlayTrack(target, queue);
  };
}

export function openNativePlaylistFast(pl, opts = {}) {
  if (!pl) return null;
  const ts = Date.now();
  const albumForm = {
    id: pl.id,
    title: pl.title || pl.name || 'Playlist',
    artist: pl.artist || pl.artistName || pl.creator || 'You',
    cover: pl.cover || pl.artworkUrl || '/album1.png',
    provider: pl.provider || null,
    isPublic: !!pl.isPublic,
    tracks: (pl.tracks || []).map((t, idx) => ({
      ...t,
      id: t.id || `${pl.id}-t-${idx}`,
      title: t.title || t.name || 'Unknown Track',
      artist: t.artist || t.artistName || pl.artist || pl.artistName || '',
      url: t.url || t.trackUrl || t.streamUrl || t.audioUrl || t.src || '',
      cover: t.cover || t.artworkUrl || t.releaseCover || pl.cover || pl.artworkUrl || null,
      provider: t.provider || pl.provider || null,
    })),
    _ts: ts,
  };
  window.__lastFastOpenTs = ts;
  window.__kyoyuCurrentNativeAlbum = albumForm;
  registerAlbumPlayback(albumForm);
  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      playlistOpen: true,
      isUpdate: Boolean(opts && opts.isUpdate),
      nativePlaylist: {
        id: albumForm.id,
        title: albumForm.title,
        creator: albumForm.artist,
        cover: albumForm.cover,
        isPublic: albumForm.isPublic,
        tracks: albumForm.tracks.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          url: t.url || '',
          cover: t.cover || null,
          provider: t.provider || null,
        })),
      },
    });
  } catch (e) {}
  return albumForm;
}

export function openNativeAlbumFast(album, opts = {}) {
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
      isUpdate: Boolean(opts && opts.isUpdate),
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

    return () => {
      window.removeEventListener('kyoyu-native-like', handleNativeLike);
      delete window.__kyoyuCloseNativeAlbum;
      delete window.__kyoyuToggleSaveAlbum;
      delete window.__kyoyuDownloadTrack;
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

export function openNativeArtistFast(artist, opts = {}) {
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
      isUpdate: Boolean(opts && opts.isUpdate),
      artist: safeArtist
    });
  } catch (e) { console.error('Failed to open native artist sheet', e); }
  return artist;
}

export function openNativeLabelFast(label, opts = {}) {
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
      isUpdate: Boolean(opts && opts.isUpdate),
      replaceArtist: Boolean(opts && opts.replaceArtist),
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

const CLIENT_CROSS_ENTITY_LINKS = {
  'traumprinz': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.net'],
  'dj metatron': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.net'],
  'prince of denmark': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.net'],
  'prime minister of doom': ['https://allpossibleworlds.bandcamp.com'],
  'dj healer': ['https://allpossibleworlds.bandcamp.com'],
  'irini': ['https://allpossibleworlds.bandcamp.com'],
  'golden baby': ['https://allpossibleworlds.bandcamp.com'],
  'all possible worlds': ['https://allpossibleworlds.bandcamp.com'],
  'planet uterus': ['https://allpossibleworlds.bandcamp.com'],
  'giegling': ['https://giegling.bandcamp.com', 'https://giegling.net'],
  'vril': ['https://giegling.bandcamp.com', 'https://delsinrecords.bandcamp.com'],
  'kettenkarussell': ['https://giegling.bandcamp.com', 'https://giegling.net'],
  'leafar legov': ['https://giegling.bandcamp.com', 'https://giegling.net'],
  'edward': ['https://giegling.bandcamp.com', 'https://giegling.net'],
  'map station': ['https://giegling.bandcamp.com'],
  'basic channel': ['https://basicchannel.bandcamp.com', 'https://basicchannel.com'],
  'maurizio': ['https://basicchannel.bandcamp.com', 'https://basicchannel.com'],
  'rhythm sound': ['https://basicchannel.bandcamp.com', 'https://basicchannel.com'],
  'burial mix': ['https://basicchannel.bandcamp.com'],
  'chain reaction': ['https://basicchannel.bandcamp.com'],
  'main street records': ['https://basicchannel.bandcamp.com'],
  'skee mask': ['https://iliantape.bandcamp.com'],
  'bryan muller': ['https://iliantape.bandcamp.com'],
  'zenker brothers': ['https://iliantape.bandcamp.com'],
  'andrea': ['https://iliantape.bandcamp.com'],
  'ilian tape': ['https://iliantape.bandcamp.com'],
  'forest drive west': ['https://forestdrivewest.bandcamp.com', 'https://livitysound.bandcamp.com'],
  'livity sound': ['https://livitysound.bandcamp.com'],
  'peverelist': ['https://livitysound.bandcamp.com', 'https://punchdrunkrecords.bandcamp.com'],
  'kowton': ['https://livitysound.bandcamp.com'],
  'asusu': ['https://livitysound.bandcamp.com'],
  'donato dozzy': ['https://spaziomedusa.bandcamp.com', 'https://mentalgroove.bandcamp.com'],
  'voices from the lake': ['https://spaziomedusa.bandcamp.com'],
  'luigi tozzi': ['https://hypnusrecords.bandcamp.com', 'https://nonseries.bandcamp.com'],
  'hypnus': ['https://hypnusrecords.bandcamp.com'],
  'hypnus records': ['https://hypnusrecords.bandcamp.com'],
  'burial': ['https://burial.bandcamp.com', 'https://hyperdub.bandcamp.com'],
  'kode9': ['https://hyperdub.bandcamp.com'],
  'hyperdub': ['https://hyperdub.bandcamp.com'],
  'hessle audio': ['https://hessleaudio.bandcamp.com'],
  'ben ufo': ['https://hessleaudio.bandcamp.com'],
  'pearson sound': ['https://pearsonsound.bandcamp.com', 'https://hessleaudio.bandcamp.com'],
  'ramadanman': ['https://pearsonsound.bandcamp.com', 'https://hessleaudio.bandcamp.com'],
  'pangaea': ['https://hadal.bandcamp.com', 'https://hessleaudio.bandcamp.com'],
  'timedance': ['https://timedance.bandcamp.com'],
  'batu': ['https://timedance.bandcamp.com'],
  'aphex twin': ['https://aphextwin.bandcamp.com', 'https://warp.net'],
  'afx': ['https://aphextwin.bandcamp.com'],
  'polygon window': ['https://aphextwin.bandcamp.com'],
  'richard d james': ['https://aphextwin.bandcamp.com'],
  'drexciya': ['https://tresorberlin.bandcamp.com', 'https://clone.nl'],
  'dopplereffekt': ['https://clone.nl', 'https://leisure-system.bandcamp.com'],
  'arpanet': ['https://recordmakers.bandcamp.com'],
  'underground resistance': ['https://submerge.com'],
  'moodymann': ['https://moodymann.bandcamp.com'],
  'kdj': ['https://moodymann.bandcamp.com'],
  'mahogani music': ['https://moodymann.bandcamp.com'],
  'omar s': ['https://fxhe.bandcamp.com'],
  'fxhe': ['https://fxhe.bandcamp.com'],
  'fxhe records': ['https://fxhe.bandcamp.com'],
  'deepchord': ['https://deepchord.bandcamp.com', 'https://echospacedetroit.bandcamp.com'],
  'echospace': ['https://echospacedetroit.bandcamp.com'],
  'cv313': ['https://echospacedetroit.bandcamp.com'],
  'intrusion': ['https://echospacedetroit.bandcamp.com'],
  'rod modell': ['https://deepchord.bandcamp.com', 'https://echospacedetroit.bandcamp.com'],
  'convextion': ['https://mojuba.bandcamp.com'],
  'e r p': ['https://frustratedfunk.bandcamp.com'],
  'gerard hanson': ['https://mojuba.bandcamp.com'],
  'mala': ['https://deepmedi.bandcamp.com'],
  'digital mystikz': ['https://deepmedi.bandcamp.com'],
  'deep medi': ['https://deepmedi.bandcamp.com'],
  'deep medi musik': ['https://deepmedi.bandcamp.com'],
  'sully': ['https://sullyuk.bandcamp.com', 'https://astrophonica.bandcamp.com'],
  'rupture': ['https://ruptureldn.bandcamp.com'],
  'ruptureldn': ['https://ruptureldn.bandcamp.com'],
  'mantra': ['https://ruptureldn.bandcamp.com'],
  'double o': ['https://ruptureldn.bandcamp.com'],
  'samurai music': ['https://samuraimusic.bandcamp.com'],
  'paradox': ['https://paradoxmusicuk.bandcamp.com', 'https://samuraimusic.bandcamp.com'],
  'dj rashad': ['https://dj-rashad.bandcamp.com', 'https://teklife.bandcamp.com', 'https://hyperdub.bandcamp.com'],
  'teklife': ['https://teklife.bandcamp.com'],
  'rp boo': ['https://rpboo.bandcamp.com', 'https://planetmu.bandcamp.com'],
  'planet mu': ['https://planetmu.bandcamp.com'],
  'rrose': ['https://rrose.bandcamp.com'],
  'eaux': ['https://rrose.bandcamp.com'],
  'surgeon': ['https://dynamic-tension.bandcamp.com'],
  'anthony child': ['https://dynamic-tension.bandcamp.com'],
  'regis': ['https://downwardsrecords.bandcamp.com'],
  'downwards': ['https://downwardsrecords.bandcamp.com'],
  'sandwell district': ['https://downwardsrecords.bandcamp.com'],
  'silent servant': ['https://hospitalproductions.bandcamp.com'],
  'ancient methods': ['https://ancientmethods.bandcamp.com'],
  'blawan': ['https://ternesc.bandcamp.com'],
  'pariah': ['https://voam.bandcamp.com'],
  'karenn': ['https://voam.bandcamp.com'],
  'voam': ['https://voam.bandcamp.com'],
  'objekt': ['https://objekt.bandcamp.com'],
  'call super': ['https://canino.bandcamp.com', 'https://houndstoothlabel.bandcamp.com'],
  'galcher lustwerk': ['https://galcherlustwerk.bandcamp.com'],
  'lustwerk music': ['https://galcherlustwerk.bandcamp.com'],
  'djrum': ['https://djrum.bandcamp.com', 'https://houndstoothlabel.bandcamp.com'],
  'houndstooth': ['https://houndstoothlabel.bandcamp.com'],
  'lanark artefax': ['https://lanarkartefax.bandcamp.com'],
  'caterina barbieri': ['https://caterinabarbieri.bandcamp.com'],
  'barker': ['https://sambarker.bandcamp.com', 'https://ostgutton.bandcamp.com'],
  'ostgut ton': ['https://ostgutton.bandcamp.com'],
  'delsin': ['https://delsinrecords.bandcamp.com'],
  'delsin records': ['https://delsinrecords.bandcamp.com'],
  'dekmantel': ['https://dekmantel.bandcamp.com'],
  'stroboscopic artefacts': ['https://stroboscopicartefacts.bandcamp.com'],
  'lucy': ['https://stroboscopicartefacts.bandcamp.com'],
  'northern electronics': ['https://northernelectronics.bandcamp.com'],
  'abdulla rashim': ['https://northernelectronics.bandcamp.com'],
  'anthony linell': ['https://northernelectronics.bandcamp.com'],
  'varg': ['https://northernelectronics.bandcamp.com'],
  'posh isolation': ['https://poshisolation.bandcamp.com'],
  'hospital productions': ['https://hospitalproductions.bandcamp.com'],
  'vatican shadow': ['https://vaticanshadow.bandcamp.com', 'https://hospitalproductions.bandcamp.com'],
  'prurient': ['https://hospitalproductions.bandcamp.com'],
  'shed': ['https://delsinrecords.bandcamp.com', 'https://ostgutton.bandcamp.com'],
  'head high': ['https://headhigh.bandcamp.com'],
  'rene pawlowitz': ['https://headhigh.bandcamp.com'],
};

function _discoverCrossEntityLinksForNames(names = [], bcSearchResults = []) {
  const discovered = [];
  for (const raw of names) {
    const n = _normStr(raw);
    const l = _normLabelCore(raw);
    if (n && CLIENT_CROSS_ENTITY_LINKS[n]) discovered.push(...CLIENT_CROSS_ENTITY_LINKS[n]);
    if (l && CLIENT_CROSS_ENTITY_LINKS[l]) discovered.push(...CLIENT_CROSS_ENTITY_LINKS[l]);
  }
  const wantNorms = new Set(names.map(_normStr).filter(Boolean));
  for (const item of (bcSearchResults || [])) {
    if (!item) continue;
    const itemUrl = item.trackUrl || item.url || '';
    if (!itemUrl || !itemUrl.includes('bandcamp.com')) continue;
    const itemArtistNorm = _normStr(item.artistName || item.artist || '');
    const itemTitleNorm = _normStr(item.title || '');
    const matchesEntity = [...wantNorms].some(w =>
      w.length >= 3 && (itemArtistNorm === w || itemArtistNorm.includes(w) || itemTitleNorm === w || itemTitleNorm.includes(w))
    );
    if (matchesEntity) {
      try {
        const u = new URL(itemUrl);
        if (u.hostname.endsWith('.bandcamp.com') && u.hostname !== 'bandcamp.com') {
          discovered.push(`${u.protocol}//${u.hostname}`);
        }
      } catch (e) {}
    }
  }
  return discovered;
}

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

  const initialCrossLinks = _discoverCrossEntityLinksForNames([
    cleanName,
    ...(isObj && Array.isArray(artistInput.aliases) ? artistInput.aliases : []),
  ]);

  const initialArtist = {
    id: (isObj && artistInput.id) ? String(artistInput.id) : `artist-${_normStr(cleanName)}`,
    name: cleanName,
    realname: isObj ? (artistInput.realname || null) : null,
    profile: isObj ? (artistInput.profile || null) : null,
    urls: _prioritizeAndDedupeLinks([
      ...(isObj && Array.isArray(artistInput.urls) ? artistInput.urls : (isObj && artistInput.url ? [artistInput.url] : [])),
      ...initialCrossLinks,
    ]),
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

    // Query Discogs artist profile and Bandcamp search in parallel so cross-entity Bandcamp pages
    // (e.g. Traumprinz -> All Possible Worlds) are discovered from matching releases/tracks as well
    const [r, bcSearchRes] = await Promise.all([
      fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'artist-profile', artistId, artistName: cleanName }),
      }).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanName }),
      }).then(res => res.ok ? res.json() : null).catch(() => null),
    ]);

    if (r && r.ok) {
      const profile = await r.json();
      // If Discogs determined that this name is actually a Record Label (not an artist), switch to Label Sheet immediately!
      if (profile && profile.isLabel) {
        return openRichLabelSheet({
          ...(isObj ? artistInput : {}),
          id: profile.labelId || initialArtist.id,
          discogsId: profile.labelId || null,
          name: profile.labelName || cleanName,
          provider: 'discogs',
          replaceArtist: true,
        });
      }
      if (profile && !profile.error) {
        const allAliases = Array.from(new Set([
          ...(initialArtist.aliases || []),
          ...(Array.isArray(profile.aliases) ? profile.aliases : []),
        ])).filter(Boolean);

        const releaseLabels = (profile.topReleases || [])
          .flatMap(rel => Array.isArray(rel.labels) ? rel.labels : (rel.label ? [rel.label] : []))
          .filter(Boolean);

        const crossLinks = _discoverCrossEntityLinksForNames(
          [cleanName, profile.name, profile.realname, ...allAliases, ...releaseLabels.slice(0, 6)],
          bcSearchRes?.results || []
        );

        const mergedUrls = _prioritizeAndDedupeLinks([
          ...crossLinks,
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
          aliases: allAliases,
          images: mergedImages,
          urls: mergedUrls,
          topReleases: mergedReleases.length ? mergedReleases : initialArtist.topReleases,
        }, { isUpdate: true });
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

  const initialCrossLinks = _discoverCrossEntityLinksForNames([
    cleanName,
    ...(isObj && Array.isArray(labelInput.aliases) ? labelInput.aliases : []),
    ...(isObj && Array.isArray(labelInput.founders) ? labelInput.founders : []),
    isObj ? labelInput.parentLabel : '',
  ]);

  const initialUrls = [...initialCrossLinks];
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
  openNativeLabelFast(currentLabel, { replaceArtist: Boolean(isObj && labelInput.replaceArtist) });

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

  // Discover Bandcamp URL from Discogs/MusicBrainz urls, cross-entity links, or Bandcamp search results
  if (discogsData) {
    const dcCrossLinks = _discoverCrossEntityLinksForNames(
      [
        cleanName,
        discogsData.name,
        discogsData.parentLabel,
        ...(discogsData.aliases || []),
        ...(discogsData.founders || []),
        ...(discogsData.sublabels || []),
      ].filter(Boolean),
      bcSearchData?.results || []
    );
    dcCrossLinks.forEach(u => {
      if (!bcUrl && u.includes('bandcamp.com')) bcUrl = u;
      currentLabel.urls.push(u);
    });
    if (!bcUrl) {
      if (discogsData.bandcampUrl) bcUrl = discogsData.bandcampUrl;
      else if (Array.isArray(discogsData.urls)) {
        bcUrl = discogsData.urls.find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';
      }
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

    openNativeLabelFast(currentLabel, { isUpdate: true });
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
      }, { isUpdate: true });
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
          }, { isUpdate: true });
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

function _mapSafeGenreTrackList(list) {
  return (Array.isArray(list) ? list : []).map(t => ({
    id: String(t.id || Math.random()),
    title: String(t.title || 'Unknown'),
    artist: t.artist || t.artistName ? String(t.artist || t.artistName) : null,
    label: t.label ? String(t.label) : null,
    catno: t.catno ? String(t.catno) : null,
    format: t.format ? String(t.format) : null,
    provider: t.provider ? String(t.provider) : null,
    trackUrl: t.trackUrl || t.url ? String(t.trackUrl || t.url) : null,
    scTrackId: t.scTrackId ? String(t.scTrackId) : null,
    discogsId: t.discogsId ? String(t.discogsId) : null,
    year: t.year ? String(t.year) : null,
    thumb: t.thumb || t.coverImage || t.cover ? String(t.thumb || t.coverImage || t.cover) : null,
    coverImage: t.coverImage || t.cover || t.artworkUrl || t.thumb ? String(t.coverImage || t.cover || t.artworkUrl || t.thumb) : null,
    type: t.type ? String(t.type) : 'track',
  }));
}

export function openNativeGenreFast(genreObj, opts = {}) {
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
    similarTracks: _mapSafeGenreTrackList(genreObj.similarTracks),
    essentialClassics: _mapSafeGenreTrackList(genreObj.essentialClassics),
    nicheCuts: _mapSafeGenreTrackList(genreObj.nicheCuts),
    recommendations: _mapSafeGenreTrackList(genreObj.recommendations),
  };

  try {
    if (window.webkit?.messageHandlers?.player) {
      window.webkit.messageHandlers.player.postMessage({
        cmd: 'open_native_genre',
        isUpdate: Boolean(opts && opts.isUpdate),
        genre: safeGenre,
      });
    } else {
      window.dispatchEvent(new CustomEvent('kyoyu-open-web-genre', { detail: safeGenre }));
    }
  } catch (e) {
    console.error('Failed to open native genre sheet', e);
  }
  return safeGenre;
}

/**
 * Resolves real HTTP cover artwork for any tracks in a list that currently only have a fallback SVG data: URI
 * or empty coverImage, using an in-memory cache + coverByTitleArtist map + iTunes Search API.
 */
async function _enrichTracksWithRealArtwork(tracks = [], coverMap = new Map(), providerTrackMap = new Map()) {
  if (typeof window !== 'undefined') {
    window.__kyoyuGenreCoverCache = window.__kyoyuGenreCoverCache || {};
  }
  const cache = (typeof window !== 'undefined' && window.__kyoyuGenreCoverCache) || {};

  const resolved = await Promise.all(tracks.map(async (t) => {
    if (!t) return t;
    const normTitle = _normStr(t.title);
    const normArtist = _normStr(t.artist);
    const pairKey = `${normArtist}|${normTitle}`;

    // 1. Check if we discovered a direct playable provider match (Bandcamp / SoundCloud) for this artist+title
    const provMatch = providerTrackMap.get(pairKey) || providerTrackMap.get(normTitle);
    let updated = { ...t };
    if (provMatch) {
      if (String(updated.trackUrl || '').startsWith('resolve:') && provMatch.trackUrl) {
        updated.trackUrl = provMatch.trackUrl;
        updated.url = provMatch.trackUrl;
        updated.provider = provMatch.provider || updated.provider;
        if (provMatch.scTrackId) updated.scTrackId = provMatch.scTrackId;
      }
      if (provMatch.coverImage && !String(provMatch.coverImage).startsWith('data:')) {
        updated.coverImage = provMatch.coverImage;
        updated.thumb = provMatch.thumb || provMatch.coverImage;
        cache[pairKey] = provMatch.coverImage;
        return updated;
      }
    }

    // 2. If track already has a real HTTP cover image, cache & keep it
    if (updated.coverImage && /^https?:\/\//i.test(updated.coverImage) && !updated.coverImage.includes('spacer.gif')) {
      cache[pairKey] = updated.coverImage;
      return updated;
    }

    // 3. Check coverMap from Discogs / Bandcamp / SoundCloud results or global cache
    const mappedCover = cache[pairKey] || coverMap.get(pairKey) || coverMap.get(normTitle);
    if (mappedCover && /^https?:\/\//i.test(mappedCover)) {
      cache[pairKey] = mappedCover;
      return { ...updated, coverImage: mappedCover, thumb: mappedCover };
    }

    // 4. Query fast public iTunes Search API for cover art
    const q = `${t.artist || ''} ${t.title || ''}`.trim();
    if (q.length >= 3) {
      try {
        const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`);
        if (itRes.ok) {
          const itJson = await itRes.json();
          const hit = itJson?.results?.[0];
          const art = hit?.artworkUrl100 ? hit.artworkUrl100.replace('100x100bb', '600x600bb') : '';
          if (art) {
            cache[pairKey] = art;
            return { ...updated, coverImage: art, thumb: art };
          }
        }
      } catch (e) {}
    }

    return updated;
  }));

  return resolved;
}

function _collectPlatformPlaylistTracksForGenre(node) {
  const out = [];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('kyoyu_playlists_v1') : null;
    if (!raw) return out;
    const playlists = JSON.parse(raw);
    if (!Array.isArray(playlists)) return out;
    const targetGenreNorm = _normStr(node.name);
    const subNorms = new Set([targetGenreNorm, ...(node.subgenres || []).map(_normStr), ...(node.aliases || []).map(_normStr)]);
    for (const pl of playlists) {
      for (const tr of (pl?.tracks || [])) {
        if (!tr || !tr.title) continue;
        const classified = classifyTrackGenre(tr);
        if (classified && (subNorms.has(_normStr(classified.primaryGenre)) || _normStr(pl.title || '').includes(targetGenreNorm))) {
          out.push({
            id: tr.id || `pl-rec-${Math.random()}`,
            title: tr.title,
            artist: tr.artist || tr.artistName || '',
            label: tr.label || pl.title || 'Kyoyu Playlist',
            year: tr.year ? String(tr.year) : '',
            trackUrl: tr.trackUrl || tr.url || `resolve:${tr.artist || ''} ${tr.title || ''}`.trim(),
            coverImage: tr.cover || tr.artworkUrl || tr.coverImage || '',
            thumb: tr.cover || tr.artworkUrl || tr.thumb || '',
            provider: tr.provider || 'bandcamp',
            type: 'track',
            fromPlaylist: true,
          });
        }
      }
    }
  } catch (e) {}
  return out;
}

export async function openRichGenreSheet(genreInput, contextInput = null, refreshSeed = 0) {
  const isObj = genreInput && typeof genreInput === 'object';
  const rawGenre = isObj ? (genreInput.name || genreInput.genre || '') : String(genreInput || '');
  const cleanGenre = String(rawGenre).trim();
  if (!cleanGenre) return;

  if (typeof window !== 'undefined') {
    window.__kyoyuGenreRefreshSeed = window.__kyoyuGenreRefreshSeed || {};
    window.__kyoyuGenrePayloadCache = window.__kyoyuGenrePayloadCache || {};
    window.__kyoyuGenreExternalPool = window.__kyoyuGenreExternalPool || {};
    window.__kyoyuGenreContextCache = window.__kyoyuGenreContextCache || {};
  }

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

  const contextObj = {
    artist: ctxArtist,
    title: ctxTitle,
    label: ctxLabel,
    collaborators,
  };

  let currentPayload = buildInitialGenreSheetPayload(cleanGenre, contextObj, refreshSeed);
  const genreKey = currentPayload.name.toLowerCase();

  if (typeof window !== 'undefined') {
    window.__kyoyuGenrePayloadCache[genreKey] = currentPayload;
    window.__kyoyuGenreContextCache[genreKey] = contextObj;
    window.__kyoyuLastOpenedGenreName = currentPayload.name;
    if (!window.__kyoyuGenreRefreshSeed[genreKey] || typeof window.__kyoyuGenreRefreshSeed[genreKey] !== 'object') {
      const baseSeed = typeof refreshSeed === 'number' ? refreshSeed : 0;
      window.__kyoyuGenreRefreshSeed[genreKey] = {
        essentialClassics: baseSeed,
        nicheCuts: baseSeed,
        recommendations: baseSeed,
      };
    }
  }

  // 1. Open immediately (0ms latency) with rich ontology + 3 sections (10 titles each)
  openNativeGenreFast(currentPayload);

  // 2. Enrich asynchronously across user's ranked providers (Bandcamp, SoundCloud tracks & playlists, Discogs, Platform playlists)
  try {
    const providerPriority = getProviderPriority();
    const node = resolveGenreNode(cleanGenre, { forSheet: true });
    const searchGenreTerm = node.name.split(/[\/&]/)[0].trim();
    const seedNum = typeof refreshSeed === 'number' ? refreshSeed : 0;
    const labelHint = node.classicLabels?.[seedNum % Math.max(1, (node.classicLabels || []).length)] || '';
    const pioneerHint = node.pioneerArtists?.[seedNum % Math.max(1, (node.pioneerArtists || []).length)] || '';

    const [dcGenreRes, bcGenreRes, bcContextRes, scTracksRes, scPlaylistsRes] = await Promise.all([
      fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'genre-explore',
          genre: searchGenreTerm,
          styles: [node.name, ...(node.subgenres || []).slice(0, 2)],
          artist: ctxArtist,
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${searchGenreTerm} ${labelHint}`.trim() }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${ctxArtist || pioneerHint} ${searchGenreTerm}`.trim() }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/soundcloud-search?q=${encodeURIComponent(`${searchGenreTerm} ${ctxArtist || labelHint}`.trim())}&limit=30`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/soundcloud-search?q=${encodeURIComponent(searchGenreTerm)}&type=playlists&limit=6`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    // Guard against race condition if the user tapped another genre while fetching
    if (typeof window !== 'undefined' && window.__kyoyuLastOpenedGenreName && window.__kyoyuLastOpenedGenreName !== currentPayload.name) {
      return;
    }

    const coverByTitleArtist = new Map();
    const providerTrackMap = new Map();
    const extClassics = [];
    const extNiche = [];
    const extRecommendations = [..._collectPlatformPlaylistTracksForGenre(node)];

    const registerLookup = (item) => {
      if (!item || !item.title) return;
      const tNorm = _normStr(item.title);
      const aNorm = _normStr(item.artist || item.artistName || '');
      const pairKey = `${aNorm}|${tNorm}`;
      if (item.coverImage && /^https?:\/\//i.test(item.coverImage) && !item.coverImage.includes('spacer.gif')) {
        coverByTitleArtist.set(pairKey, item.coverImage);
        if (!coverByTitleArtist.has(tNorm)) coverByTitleArtist.set(tNorm, item.coverImage);
      }
      if (item.trackUrl && !String(item.trackUrl).startsWith('resolve:')) {
        if (!providerTrackMap.has(pairKey)) providerTrackMap.set(pairKey, item);
        if (!providerTrackMap.has(tNorm)) providerTrackMap.set(tNorm, item);
      }
    };

    // Process Bandcamp results (genre + context)
    const allBcItems = [
      ...(bcGenreRes?.results || []),
      ...(bcContextRes?.results || []),
    ].filter(r => r && (r.type === 'track' || r.type === 'album'));

    allBcItems.forEach((r, idx) => {
      const cleanCover = r.artworkUrl ? r.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : '';
      const item = {
        id: `bc-genre-${idx}-${Date.now()}`,
        title: r.title || 'Unknown',
        artist: r.artistName || r.artist || '',
        label: r.labelName || r.albumTitle || node.name,
        year: r.year ? String(r.year) : '',
        trackUrl: r.trackUrl || r.url || '',
        coverImage: cleanCover,
        thumb: r.artworkUrl || cleanCover,
        provider: 'bandcamp',
        type: r.type || 'track',
        likesCount: 0,
        userFollowersCount: 0,
      };
      registerLookup(item);
      // Bandcamp cuts matching context artist/label go to Recommendations AND Niche Cuts
      const aNorm = _normStr(item.artist);
      if (ctxArtist && aNorm.includes(_normStr(ctxArtist))) {
        extRecommendations.push({ ...item, fromPlaylist: true });
      }
      extNiche.push(item);
      extRecommendations.push(item);
    });

    // Process SoundCloud track results (with likesCount & userFollowersCount filtering for Niche Cuts)
    if (scTracksRes && Array.isArray(scTracksRes.results)) {
      scTracksRes.results.forEach((r, idx) => {
        const likes = Number(r.likesCount || 0);
        const followers = Number(r.userFollowersCount || 0);
        const item = {
          id: r.id || `sc-genre-${idx}-${Date.now()}`,
          scTrackId: r.scTrackId ? String(r.scTrackId) : '',
          title: r.title || 'Unknown',
          artist: r.artistName || r.artist || '',
          label: r.genre || node.name,
          year: '',
          trackUrl: r.trackUrl || '',
          coverImage: r.artworkUrl || '',
          thumb: r.artworkUrl || '',
          provider: 'soundcloud',
          type: 'track',
          likesCount: likes,
          userFollowersCount: followers,
        };
        registerLookup(item);
        if (likes <= 1000 && followers <= 1000) {
          extNiche.push(item);
        } else if (likes >= 5000) {
          extClassics.push(item);
        }
        extRecommendations.push(item);
      });
    }

    // Process SoundCloud public playlists for Recommendations (100% genre-matched public playlists)
    if (scPlaylistsRes && Array.isArray(scPlaylistsRes.playlists)) {
      scPlaylistsRes.playlists.forEach((pl) => {
        (pl.tracks || []).slice(0, 8).forEach((tr, idx) => {
          if (!tr || !tr.title) return;
          const item = {
            id: tr.id || `sc-pl-genre-${idx}-${Date.now()}`,
            scTrackId: tr.scTrackId ? String(tr.scTrackId) : '',
            title: tr.title,
            artist: tr.artistName || tr.artist || pl.artistName || '',
            label: pl.title || node.name,
            year: '',
            trackUrl: tr.trackUrl || '',
            coverImage: tr.artworkUrl || pl.artworkUrl || '',
            thumb: tr.artworkUrl || pl.artworkUrl || '',
            provider: 'soundcloud',
            type: 'track',
            fromPlaylist: true,
          };
          registerLookup(item);
          extRecommendations.push(item);
        });
      });
    }

    // Process Discogs genre-explore results (classics + niche + releases)
    const discoveredLabels = new Set(currentPayload.classicLabels || []);
    const discoveredArtists = new Set(currentPayload.pioneerArtists || []);
    const dcAll = [
      ...(dcGenreRes?.classics || []).map(r => ({ ...r, _dcTier: 'classic' })),
      ...(dcGenreRes?.niche || []).map(r => ({ ...r, _dcTier: 'niche' })),
      ...(dcGenreRes?.releases || []).map(r => ({ ...r, _dcTier: 'rec' })),
    ];
    dcAll.forEach(rel => {
      if (rel.label && !/not on label/i.test(rel.label)) discoveredLabels.add(rel.label);
      if (rel.artist && !/various/i.test(rel.artist)) discoveredArtists.add(rel.artist);
      const cov = rel.coverImage || rel.thumb || '';
      const item = {
        id: rel.id || `dc-genre-${Math.random()}`,
        discogsId: rel.discogsId ? String(rel.discogsId) : '',
        title: rel.title || 'Unknown',
        artist: rel.artist || '',
        label: rel.label || node.name,
        year: rel.year ? String(rel.year) : '',
        trackUrl: `resolve:${rel.artist || ''} ${rel.title || ''}`.trim(),
        coverImage: cov,
        thumb: rel.thumb || cov,
        provider: providerPriority[0] || 'bandcamp',
        type: rel.type || 'release',
        have: rel.have != null ? Number(rel.have) : null,
      };
      registerLookup(item);
      if (rel._dcTier === 'classic') extClassics.push(item);
      else if (rel._dcTier === 'niche' && (item.have == null || item.have <= 1000)) extNiche.push(item);
      else extRecommendations.push(item);
    });

    const prevPools = (typeof window !== 'undefined' && window.__kyoyuGenreExternalPool[genreKey]) || {
      classics: [],
      niche: [],
      recommendations: [],
    };
    const mergedPools = {
      classics: [...extClassics, ...(prevPools.classics || [])].slice(0, 60),
      niche: [...extNiche, ...(prevPools.niche || [])].slice(0, 60),
      recommendations: [...extRecommendations, ...(prevPools.recommendations || [])].slice(0, 60),
    };
    if (typeof window !== 'undefined') {
      window.__kyoyuGenreExternalPool[genreKey] = mergedPools;
      window.__kyoyuGenreCoverMap = window.__kyoyuGenreCoverMap || {};
      window.__kyoyuGenreCoverMap[genreKey] = { coverByTitleArtist, providerTrackMap };
    }

    const activeSeeds = (typeof window !== 'undefined' && window.__kyoyuGenreRefreshSeed[genreKey]) || refreshSeed;
    const threeSections = selectGenreThreeSections(node, mergedPools, contextObj, activeSeeds, providerPriority);

    // Resolve real HTTP artwork for all 3 sections in parallel
    const [enrichedClassics, enrichedNiche, enrichedRecs] = await Promise.all([
      _enrichTracksWithRealArtwork(threeSections.essentialClassics, coverByTitleArtist, providerTrackMap),
      _enrichTracksWithRealArtwork(threeSections.nicheCuts, coverByTitleArtist, providerTrackMap),
      _enrichTracksWithRealArtwork(threeSections.recommendations, coverByTitleArtist, providerTrackMap),
    ]);

    const finalClassics = orderTracksByProviderPriority(enrichedClassics, providerPriority);
    const finalNiche = orderTracksByProviderPriority(enrichedNiche, providerPriority);
    const finalRecs = orderTracksByProviderPriority(enrichedRecs, providerPriority);

    currentPayload = {
      ...currentPayload,
      pioneerArtists: Array.from(discoveredArtists).slice(0, 20),
      classicLabels: Array.from(discoveredLabels).slice(0, 20),
      essentialClassics: finalClassics,
      nicheCuts: finalNiche,
      recommendations: finalRecs,
      similarTracks: [...finalClassics.slice(0, 5), ...finalNiche.slice(0, 5)],
    };

    if (typeof window !== 'undefined') {
      window.__kyoyuGenrePayloadCache[genreKey] = currentPayload;
    }

    openNativeGenreFast(currentPayload, { isUpdate: true });
  } catch (err) {
    console.warn('[openRichGenreSheet] enrich error:', err);
  }
}

export async function refreshGenreSheetTracks(genreNameInput, categoryInput = 'all') {
  const gName = String(genreNameInput || (typeof window !== 'undefined' ? window.__kyoyuLastOpenedGenreName : '') || '').trim();
  if (!gName) return;
  const key = gName.toLowerCase();
  const category = String(categoryInput || 'all').trim();

  if (typeof window !== 'undefined') {
    window.__kyoyuGenreRefreshSeed = window.__kyoyuGenreRefreshSeed || {};
    const curSeeds = (window.__kyoyuGenreRefreshSeed[key] && typeof window.__kyoyuGenreRefreshSeed[key] === 'object')
      ? { ...window.__kyoyuGenreRefreshSeed[key] }
      : { essentialClassics: 0, nicheCuts: 0, recommendations: 0 };

    if (category === 'essentialClassics' || category === 'classics') {
      curSeeds.essentialClassics = (curSeeds.essentialClassics || 0) + 1;
    } else if (category === 'nicheCuts' || category === 'niche') {
      curSeeds.nicheCuts = (curSeeds.nicheCuts || 0) + 1;
    } else if (category === 'recommendations') {
      curSeeds.recommendations = (curSeeds.recommendations || 0) + 1;
    } else {
      curSeeds.essentialClassics = (curSeeds.essentialClassics || 0) + 1;
      curSeeds.nicheCuts = (curSeeds.nicheCuts || 0) + 1;
      curSeeds.recommendations = (curSeeds.recommendations || 0) + 1;
    }
    window.__kyoyuGenreRefreshSeed[key] = curSeeds;

    const cachedPayload = window.__kyoyuGenrePayloadCache?.[key];
    const cachedPools = window.__kyoyuGenreExternalPool?.[key] || {};
    const cachedContext = window.__kyoyuGenreContextCache?.[key] || {};
    const maps = window.__kyoyuGenreCoverMap?.[key] || { coverByTitleArtist: new Map(), providerTrackMap: new Map() };
    const providerPriority = getProviderPriority();
    const node = resolveGenreNode(gName, { forSheet: true });
    const nextSections = selectGenreThreeSections(node, cachedPools, cachedContext, curSeeds, providerPriority);

    if (cachedPayload) {
      let nextClassics = cachedPayload.essentialClassics || nextSections.essentialClassics;
      let nextNiche = cachedPayload.nicheCuts || nextSections.nicheCuts;
      let nextRecs = cachedPayload.recommendations || nextSections.recommendations;

      if (category === 'essentialClassics' || category === 'classics' || category === 'all') {
        nextClassics = nextSections.essentialClassics;
      }
      if (category === 'nicheCuts' || category === 'niche' || category === 'all') {
        nextNiche = nextSections.nicheCuts;
      }
      if (category === 'recommendations' || category === 'all') {
        nextRecs = nextSections.recommendations;
      }

      const immediateUpdated = {
        ...cachedPayload,
        essentialClassics: nextClassics,
        nicheCuts: nextNiche,
        recommendations: nextRecs,
        similarTracks: [...nextClassics.slice(0, 5), ...nextNiche.slice(0, 5)],
      };
      window.__kyoyuGenrePayloadCache[key] = immediateUpdated;
      openNativeGenreFast(immediateUpdated, { isUpdate: true });

      // Resolve any missing real HTTP artwork for the newly rotated tracks asynchronously
      const [enrClassics, enrNiche, enrRecs] = await Promise.all([
        (category === 'essentialClassics' || category === 'classics' || category === 'all')
          ? _enrichTracksWithRealArtwork(nextClassics, maps.coverByTitleArtist, maps.providerTrackMap)
          : Promise.resolve(nextClassics),
        (category === 'nicheCuts' || category === 'niche' || category === 'all')
          ? _enrichTracksWithRealArtwork(nextNiche, maps.coverByTitleArtist, maps.providerTrackMap)
          : Promise.resolve(nextNiche),
        (category === 'recommendations' || category === 'all')
          ? _enrichTracksWithRealArtwork(nextRecs, maps.coverByTitleArtist, maps.providerTrackMap)
          : Promise.resolve(nextRecs),
      ]);

      const finalUpdated = {
        ...immediateUpdated,
        essentialClassics: orderTracksByProviderPriority(enrClassics, providerPriority),
        nicheCuts: orderTracksByProviderPriority(enrNiche, providerPriority),
        recommendations: orderTracksByProviderPriority(enrRecs, providerPriority),
      };
      window.__kyoyuGenrePayloadCache[key] = finalUpdated;
      openNativeGenreFast(finalUpdated, { isUpdate: true });
      return;
    }
    openRichGenreSheet(gName, null, curSeeds.essentialClassics || 1);
  }
}

export function openNativeSceneFast(sceneObj, opts = {}) {
  if (!sceneObj) return null;
  const pastEvs = (Array.isArray(sceneObj.pastEvents) ? sceneObj.pastEvents : (Array.isArray(sceneObj.pastLandmarkEvents) ? sceneObj.pastLandmarkEvents : [])).map((ev, idx) => ({
    id: `past-${idx}-${Date.now()}`,
    title: String(ev.title || ''),
    year: String(ev.year || ''),
    details: String(ev.details || ev.description || ''),
    description: String(ev.description || ev.details || ''),
  }));

  const safeScene = {
    id: String(sceneObj.id || `scene-${Date.now()}`),
    name: String(sceneObj.name || 'Iconic Club & Scene'),
    category: String(sceneObj.category || sceneObj.entityType || 'Iconic Club & Scene'),
    entityType: String(sceneObj.entityType || sceneObj.category || 'Iconic Club & Scene'),
    location: String(sceneObj.location || ''),
    address: sceneObj.address ? String(sceneObj.address) : null,
    openedDate: String(sceneObj.openedDate || ''),
    closedHistory: String(sceneObj.closedHistory || ''),
    status: sceneObj.status ? String(sceneObj.status) : null,
    capacity: sceneObj.capacity ? String(sceneObj.capacity) : null,
    soundSystem: sceneObj.soundSystem ? String(sceneObj.soundSystem) : null,
    description: String(sceneObj.description || sceneObj.definingHistory || ''),
    definingHistory: String(sceneObj.definingHistory || sceneObj.description || ''),
    politicalEthos: String(sceneObj.politicalEthos || sceneObj.politicalAndCulturalEthos || ''),
    politicalAndCulturalEthos: String(sceneObj.politicalAndCulturalEthos || sceneObj.politicalEthos || ''),
    strugglesAndFights: Array.isArray(sceneObj.strugglesAndFights)
      ? sceneObj.strugglesAndFights.filter(Boolean).map(String)
      : (sceneObj.fightsAndIssues ? [String(sceneObj.fightsAndIssues)] : []),
    fightsAndIssues: String(sceneObj.fightsAndIssues || ''),
    landmarkMoments: Array.isArray(sceneObj.landmarkMoments)
      ? sceneObj.landmarkMoments.filter(Boolean).map(String)
      : [],
    genresPlayed: Array.isArray(sceneObj.genresPlayed) ? sceneObj.genresPlayed.filter(Boolean).map(String) : [],
    keyActors: Array.isArray(sceneObj.keyActors) ? sceneObj.keyActors.filter(Boolean).map(String) : [],
    associatedLabels: Array.isArray(sceneObj.associatedLabels) ? sceneObj.associatedLabels.filter(Boolean).map(String) : [],
    upcomingEvents: (Array.isArray(sceneObj.upcomingEvents) ? sceneObj.upcomingEvents : []).map((ev, idx) => ({
      id: `up-${idx}-${Date.now()}`,
      title: String(ev.title || ''),
      date: String(ev.date || ''),
      lineup: String(ev.lineup || ''),
    })),
    pastEvents: pastEvs,
    pastLandmarkEvents: pastEvs,
  };

  try {
    if (window.webkit?.messageHandlers?.player) {
      window.webkit.messageHandlers.player.postMessage({
        cmd: 'open_native_scene',
        isUpdate: Boolean(opts && opts.isUpdate),
        scene: safeScene,
      });
    } else {
      window.dispatchEvent(new CustomEvent('kyoyu-open-web-scene', { detail: safeScene }));
    }
  } catch (e) {
    console.error('Failed to open native scene sheet', e);
  }
  return safeScene;
}

export function openRichSceneSheet(sceneNameInput, contextInput = null) {
  const rawName = typeof sceneNameInput === 'object' ? (sceneNameInput?.name || '') : String(sceneNameInput || '');
  const cleanName = rawName.trim();
  if (!cleanName) return;
  const payload = buildInitialSceneSheetPayload(cleanName, {
    genre: (contextInput && contextInput.genre) || (typeof window !== 'undefined' ? window.__kyoyuLastOpenedGenreName : '') || '',
  });
  return openNativeSceneFast(payload);
}

export async function playGenreTrack(trackItem) {
  if (!trackItem) return;
  const obj = typeof trackItem === 'string' ? JSON.parse(trackItem) : trackItem;
  const title = obj.title || '';
  const artist = obj.artist || obj.artistName || '';
  const cover = obj.coverImage || obj.thumb || obj.cover || '';
  const trackUrl = obj.trackUrl || obj.url || '';
  const isResolveUrl = !trackUrl || trackUrl.startsWith('resolve:');
  const rawProv = String(obj.provider || '').toLowerCase();

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
    url: !isResolveUrl ? trackUrl : `resolve:${artist} ${title}`.trim(),
    trackUrl: !isResolveUrl ? trackUrl : undefined,
    scTrackId: obj.scTrackId || undefined,
    provider: !isResolveUrl ? rawProv : '',
    preferredProvider: rawProv || (getProviderPriority()?.[0] || 'bandcamp'),
    providerItemId: (!isResolveUrl && rawProv === 'bandcamp') ? trackUrl : undefined,
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
  window.__kyoyuRefreshGenreTracks = refreshGenreSheetTracks;
  window.__kyoyuOpenScene = openRichSceneSheet;
  window.__kyoyuPlayGenreTrack = playGenreTrack;
  window.__kyoyuOpenReleaseFromSheet = openReleaseFromSheet;
}


