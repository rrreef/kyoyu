import { useLayoutEffect, useRef } from 'react';
import { usePlayer, historyReplayInfo, trackIdentity } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { syncProviderLike, getProviderPriority, cleanTrackOrReleaseTitle, splitCleanMetadata } from '../../lib/streaming';
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
    window.__kyoyuNativeAlbumsById = window.__kyoyuNativeAlbumsById || {};
    if (album && album.id) {
      window.__kyoyuNativeAlbumsById[String(album.id)] = album;
    }
  }
  window.__kyoyuPlayNativeTrack = async (albumId, trackObj) => {
    const activeAlbum = (typeof window !== 'undefined' && albumId && window.__kyoyuNativeAlbumsById?.[String(albumId)]) || album;
    const isRadioAlbum = activeAlbum.provider === 'radio'
      || String(activeAlbum.id || '').startsWith('radio-')
      || activeAlbum.genre === 'Track Radio'
      || /\s+radio$/i.test(String(activeAlbum.title || '').trim());
    const queue = (activeAlbum.tracks || []).map(t => {
      const src = t.url || t.streamUrl || t.audioUrl || t.src || '';
      const resolvedCover = (t.cover && t.cover !== '/album1.png' ? t.cover : '')
        || t.artworkUrl
        || t.releaseCover
        || (activeAlbum.cover && activeAlbum.cover !== '/album1.png' ? activeAlbum.cover : '')
        || activeAlbum.artworkUrl
        || t.cover
        || activeAlbum.cover
        || '';
      const rawTrackAlbum = String(t.album || t.releaseTitle || t.albumTitle || (isRadioAlbum ? '' : activeAlbum.title) || '').trim();
      const prelimAlbum = (/\s+radio$/i.test(rawTrackAlbum) || /^(unknown(\s+album|\s+release)?|radio|track\s+radio)$/i.test(rawTrackAlbum))
        ? ''
        : rawTrackAlbum;
      const rawArtist = t.artist || t.artistName || (isRadioAlbum ? '' : activeAlbum.artist) || '';
      const rawLabel = t.label || t.labelName || (isRadioAlbum ? '' : activeAlbum.label) || '';
      const cleaned = splitCleanMetadata(t.title || t.name || '', rawArtist, rawLabel, prelimAlbum);
      const cleanTrackAlbum = cleanTrackOrReleaseTitle(cleaned.album || prelimAlbum, cleaned.artist || rawArtist);
      return {
        ...t,
        id: t.id,
        title: cleaned.title || t.title || t.name,
        artist: cleaned.artist || rawArtist,
        label: cleaned.label || rawLabel,
        labelUrl: t.labelUrl || activeAlbum.labelUrl || '',
        year: t.year || t.releaseYear || (isRadioAlbum ? '' : activeAlbum.year) || '',
        albumUrl: t.albumUrl || activeAlbum.url || activeAlbum.trackUrl || '',
        cover: resolvedCover,
        artworkUrl: t.artworkUrl || resolvedCover,
        releaseCover: resolvedCover,
        album: cleanTrackAlbum,
        releaseTitle: cleanTrackAlbum,
        src, audioUrl: src, url: src,
        trackUrl: t.trackUrl || t.url || undefined,
        duration: t.duration || '',
        provider: (t.provider || activeAlbum.provider) === 'discogs' || (t.provider || activeAlbum.provider) === 'radio' ? '' : (t.provider || activeAlbum.provider || null),
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
  const plCreator = pl.artist || pl.artistName || pl.creator || 'You';
  const albumForm = {
    id: pl.id,
    title: cleanTrackOrReleaseTitle(pl.title || pl.name || 'Playlist', plCreator),
    artist: plCreator,
    cover: pl.cover || pl.artworkUrl || '/album1.png',
    provider: pl.provider || null,
    isPublic: !!pl.isPublic,
    tracks: (pl.tracks || []).map((t, idx) => {
      const tArtist = t.artist || t.artistName || plCreator || '';
      const cleaned = splitCleanMetadata(t.title || t.name || 'Unknown Track', tArtist, t.label || '');
      return {
        ...t,
        id: t.id || `${pl.id}-t-${idx}`,
        title: cleaned.title || t.title || t.name || 'Unknown Track',
        artist: cleaned.artist || tArtist,
        label: cleaned.label || t.label || '',
        url: t.url || t.trackUrl || t.streamUrl || t.audioUrl || t.src || '',
        cover: t.cover || t.artworkUrl || t.releaseCover || pl.cover || pl.artworkUrl || null,
        provider: t.provider || pl.provider || null,
      };
    }),
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
  const isPreload = Boolean(opts && opts.preload);
  const ts = Date.now();
  const isRadio = album.provider === 'radio' || String(album.id || '').startsWith('radio-') || /\s+radio$/i.test(String(album.title || '').trim());
  const albumArtist = album.artist || '';
  const cleanAlbumTitle = isRadio ? (album.title || '') : cleanTrackOrReleaseTitle(album.title || '', albumArtist);
  album = {
    ...album,
    title: cleanAlbumTitle || album.title || '',
  };

  // Sanitize Discogs tracks unconditionally (covers groupByAlbum which drops album.provider)
  // Also make generic Discogs track ids ("discogs-track-0") unique per album, otherwise
  // the same id is shared by every album and History entries overwrite each other.
  if (album.tracks) {
    const albumKey = String(album.id || `${album.artist || ''}-${album.title || ''}`).replace(/\s+/g, '_');
    album.tracks = album.tracks.map(t => {
      let nt = t.provider === 'discogs' ? { ...t, provider: '' } : t;
      if (/^discogs-track-\d+$/.test(String(nt.id || ''))) nt = { ...nt, id: `${albumKey}::${nt.id}` };
      const tArtist = nt.artist || nt.artistName || (isRadio ? '' : albumArtist) || '';
      const cleaned = splitCleanMetadata(nt.title || nt.name || 'Unknown Track', tArtist, nt.label || album.label || '');
      return {
        ...nt,
        title: cleaned.title || nt.title || nt.name || 'Unknown Track',
        artist: cleaned.artist || tArtist,
        label: cleaned.label || nt.label || (isRadio ? '' : album.label) || '',
      };
    });
  }

  if (!isPreload) {
    window.__lastFastOpenTs = ts;
    window.__kyoyuCurrentNativeAlbum = album;
    registerAlbumPlayback(album);
  }

  const nativeAlbumPayload = {
    _ts: String(ts),
    id: album.id || String(Date.now()),
    title: album.title || '',
    artist: album.artist || '',
    cover: album.cover || album.artworkUrl || null,
    genre: album.genre || null,
    year: album.year ? String(album.year) : null,
    releaseDate: album.releaseDate || (album.year ? String(album.year) : null),
    location: album.location || album.country || null,
    formats: Array.isArray(album.formats) ? album.formats.join(' / ') : (album.formats || album.format || null),
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
  };

  try {
    if (isPreload) {
      window.webkit?.messageHandlers?.player?.postMessage({
        cmd: 'preload_native_album',
        nativeAlbum: nativeAlbumPayload,
      });
    } else {
      window.webkit?.messageHandlers?.player?.postMessage({
        albumOpen: true,
        isUpdate: Boolean(opts && opts.isUpdate),
        nativeAlbum: nativeAlbumPayload,
      });
    }
  } catch(e) {}
  return { ...album, _ts: ts };
}

// ── "Go to Album" bridge — called from Swift NativePlayerView ──
// Searches Discogs/Bandcamp for the album, opens (or preloads) a full Album Sheet.
if (typeof window !== 'undefined') {
  window.__kyoyuPreloadedAlbums = window.__kyoyuPreloadedAlbums || {};

  window.__kyoyuGoToAlbum = async (artist, albumOrTitle, opts = {}) => {
    const isPreload = Boolean(opts && opts.preload);
    const curTrack = window.__kyoyuGetCurrentTrack ? window.__kyoyuGetCurrentTrack() : null;
    const cleanArtist = String(artist || curTrack?.artistName || curTrack?.artist || '').trim();
    const rawAlbumOrTitle = String(albumOrTitle || curTrack?.releaseTitle || curTrack?.album || curTrack?.title || '').trim();
    const isRadioOrUnknown = /^(unknown(\s+album|\s+release)?|single\s+release|radio|track\s+radio)$/i.test(rawAlbumOrTitle) || /\s+radio$/i.test(rawAlbumOrTitle);
    const cleanAlbumOrTitle = (isRadioOrUnknown ? (curTrack?.title || '') : rawAlbumOrTitle).trim();
    if (!cleanArtist && !cleanAlbumOrTitle) return;

    const cacheKey = `${cleanArtist.toLowerCase()}|${cleanAlbumOrTitle.toLowerCase()}`;
    if (window.__kyoyuPreloadedAlbums[cacheKey]) {
      const cachedAlbum = window.__kyoyuPreloadedAlbums[cacheKey];
      if (!isPreload) {
        openNativeAlbumFast(cachedAlbum);
      }
      return cachedAlbum;
    }

    // If user explicitly tapped to open and it's not cached yet, open an instant skeleton with current track so there is 0ms delay
    const fallbackCover = opts.cover || curTrack?.releaseCover || curTrack?.artworkUrl || curTrack?.cover || '';
    const tempId = `album-${cacheKey.replace(/[^a-z0-9]+/g, '-')}`;
    if (!isPreload) {
      openNativeAlbumFast({
        id: tempId,
        title: cleanAlbumOrTitle.replace(/\s*\(Single\)\s*$/i, '') || cleanAlbumOrTitle,
        artist: cleanArtist,
        cover: fallbackCover,
        year: curTrack?.year ? String(curTrack.year) : null,
        genre: curTrack?.genre || '',
        label: curTrack?.label || '',
        provider: curTrack?.provider || 'discogs',
        tracks: curTrack ? [{
          id: curTrack.id || `${tempId}-0`,
          title: curTrack.title || cleanAlbumOrTitle,
          artist: cleanArtist,
          url: curTrack.providerUrl || curTrack.trackUrl || curTrack.src || `resolve:${cleanArtist} ${curTrack.title || cleanAlbumOrTitle}`,
          cover: fallbackCover,
          provider: curTrack.provider || '',
        }] : [],
      });
    }

    const emitAndCacheAlbum = (albumObj) => {
      window.__kyoyuPreloadedAlbums[cacheKey] = albumObj;
      if (albumObj.title) {
        const altKey = `${cleanArtist.toLowerCase()}|${String(albumObj.title).toLowerCase()}`;
        window.__kyoyuPreloadedAlbums[altKey] = albumObj;
      }
      openNativeAlbumFast(albumObj, { preload: isPreload, isUpdate: !isPreload });
      return albumObj;
    };

    const searchTitle = cleanTrackOrReleaseTitle(cleanAlbumOrTitle.replace(/\s*\(Single\)\s*$/i, '').trim() || cleanAlbumOrTitle, cleanArtist);
    const query = `${cleanArtist} ${searchTitle}`.trim();
    const bcTrackUrl = [
      opts.url,
      curTrack?.albumUrl,
      curTrack?.providerUrl,
      curTrack?.trackUrl,
      curTrack?.providerItemId,
      curTrack?.replay?.url,
      curTrack?.origin?.url,
    ].find(u => typeof u === 'string' && /^https?:\/\/[^/]+\.bandcamp\.com/i.test(u)) || '';
    try {
      // First check if track-info is already in __kyoyuInfoCache or fetch it (in parallel with Bandcamp album-tracks if applicable)
      const infoKey = [cleanArtist, curTrack?.title || searchTitle, searchTitle].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
      let info = window.__kyoyuInfoCache?.[infoKey] || null;
      const [fetchedInfo, bcAlbumData] = await Promise.all([
        !info
          ? fetch('/api/discogs-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'track-info', title: curTrack?.title || searchTitle, artist: cleanArtist, album: searchTitle }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(info),
        bcTrackUrl
          ? fetch('/api/bandcamp-resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'album-tracks', url: bcTrackUrl }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (fetchedInfo) info = fetchedInfo;

      if (bcAlbumData && Array.isArray(bcAlbumData.tracks) && bcAlbumData.tracks.length > 0) {
        const bcArtist = bcAlbumData.artist || info?.artist || cleanArtist || '';
        const bcTitle = cleanTrackOrReleaseTitle(bcAlbumData.albumName || info?.album || searchTitle || '', bcArtist);
        const bcLabel = bcAlbumData.label || info?.label || curTrack?.label || '';
        const bcYear = bcAlbumData.year || info?.year || curTrack?.year || null;
        return emitAndCacheAlbum({
          id: tempId,
          title: bcTitle || searchTitle || '',
          artist: bcArtist,
          cover: bcAlbumData.artworkUrl || info?.coverImage || info?.thumb || fallbackCover || '',
          year: bcYear ? String(bcYear) : null,
          genre: info?.genre || curTrack?.genre || '',
          label: bcLabel,
          labelUrl: bcAlbumData.labelUrl || '',
          provider: 'bandcamp',
          description: [
            info?.formats?.length ? `Format: ${info.formats.join(' / ')}` : '',
            info?.country ? `Country: ${info.country}` : '',
            info?.description || '',
          ].filter(Boolean).join('\n'),
          tracks: bcAlbumData.tracks.map((t, i) => ({
            id: `bc-alb-${i}-${Date.now()}`,
            title: cleanTrackOrReleaseTitle(t.title || `Track ${i + 1}`, t.artist || bcArtist),
            artist: t.artist || bcArtist,
            label: bcLabel,
            year: bcYear ? String(bcYear) : '',
            url: t.streamUrl || t.trackUrl || bcTrackUrl,
            trackUrl: t.trackUrl || bcTrackUrl,
            providerItemId: t.trackUrl || bcTrackUrl,
            cover: t.artworkUrl || bcAlbumData.artworkUrl || fallbackCover || '',
            provider: 'bandcamp',
          })),
        });
      }

      if (info && info.tracklist && info.tracklist.length > 0) {
        return emitAndCacheAlbum({
          id: info.discogsId ? `discogs-${info.discogsId}` : tempId,
          title: cleanTrackOrReleaseTitle(info.album || searchTitle || '', info.artist || cleanArtist),
          artist: info.artist || cleanArtist || '',
          cover: info.coverImage || info.thumb || fallbackCover || '',
          year: info.year || null,
          genre: info.genre || '',
          label: info.label || bcAlbumData?.label || '',
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
            title: `${t.position ? t.position + '. ' : ''}${cleanTrackOrReleaseTitle(t.title || '', t.artists?.join(', ') || info.artist || cleanArtist)}`,
            artist: t.artists?.join(', ') || info.artist || cleanArtist || '',
            url: `resolve:${t.artists?.join(', ') || info.artist || cleanArtist} ${t.title || ''}`,
            cover: info.coverImage || info.thumb || fallbackCover || '',
            provider: '',
          })),
        });
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
          const tr = await fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'track-info', discogsReleaseId: release.id || release.discogsId }),
          });
          if (tr.ok) {
            const tinfo = await tr.json();
            const parsed = (release.title || '').split(' - ');
            const releaseArtist = parsed.length >= 2 ? parsed[0].trim() : cleanArtist;
            const releaseTitle = parsed.length >= 2 ? parsed.slice(1).join(' - ').trim() : release.title;
            if (tinfo.tracklist && tinfo.tracklist.length > 0) {
              return emitAndCacheAlbum({
                id: `discogs-${release.id || release.discogsId}`,
                title: cleanTrackOrReleaseTitle(tinfo.album || releaseTitle || searchTitle || '', tinfo.artist || releaseArtist || cleanArtist),
                artist: tinfo.artist || releaseArtist || cleanArtist || '',
                cover: release.cover_image || release.coverImage || release.thumb || fallbackCover || '',
                year: tinfo.year || release.year || null,
                genre: tinfo.genre || '',
                label: tinfo.label || '',
                provider: 'discogs',
                tracks: (tinfo.tracklist || []).map((t, i) => ({
                  id: `discogs-track-${i}`,
                  title: `${t.position ? t.position + '. ' : ''}${cleanTrackOrReleaseTitle(t.title || '', t.artists?.join(', ') || tinfo.artist || releaseArtist)}`,
                  artist: t.artists?.join(', ') || tinfo.artist || releaseArtist || '',
                  url: `resolve:${t.artists?.join(', ') || tinfo.artist || releaseArtist} ${t.title || ''}`,
                  cover: release.cover_image || release.coverImage || release.thumb || fallbackCover || '',
                  provider: '',
                })),
              });
            }
          }
        }
      }

      // Guaranteed Single/Release fallback when not on Discogs
      if (info || curTrack) {
        return emitAndCacheAlbum({
          id: tempId,
          title: cleanTrackOrReleaseTitle(info?.album || bcAlbumData?.albumName || searchTitle || curTrack?.title || 'Single', info?.artist || cleanArtist),
          artist: info?.artist || cleanArtist || '',
          cover: info?.coverImage || info?.thumb || fallbackCover || '',
          year: info?.year || bcAlbumData?.year || curTrack?.year || null,
          genre: info?.genre || curTrack?.genre || '',
          label: info?.label || bcAlbumData?.label || curTrack?.label || '',
          provider: curTrack?.provider || 'native',
          description: info?.description || '',
          tracks: [{
            id: curTrack?.id || `${tempId}-0`,
            title: cleanTrackOrReleaseTitle(curTrack?.title || searchTitle, cleanArtist),
            artist: cleanArtist,
            url: curTrack?.providerUrl || curTrack?.trackUrl || curTrack?.src || `resolve:${cleanArtist} ${curTrack?.title || searchTitle}`,
            cover: info?.coverImage || fallbackCover || '',
            provider: curTrack?.provider || '',
          }],
        });
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
  const isPreload = Boolean(opts && opts.preload);
  const ts = Date.now();
  if (!isPreload) {
    window.__lastFastOpenArtistTs = ts;
  }
  
  // Normalize types for Swift JSONDecoder
  const safeArtist = {
    ...artist,
    id: String(artist.id || Math.random()),
    name: String(artist.name || 'Unknown'),
    realname: artist.realname ? String(artist.realname) : null,
    location: artist.location ? String(artist.location) : null,
    summary: artist.summary ? String(artist.summary) : null,
    profile: artist.profile ? String(artist.profile) : null,
    artisticPersona: artist.artisticPersona ? String(artist.artisticPersona) : null,
    influencesAndInspirations: artist.influencesAndInspirations ? String(artist.influencesAndInspirations) : null,
    collaborations: artist.collaborations ? String(artist.collaborations) : null,
    collaborators: Array.isArray(artist.collaborators) ? artist.collaborators.filter(Boolean).map(String) : [],
    urls: Array.isArray(artist.urls) ? artist.urls.filter(Boolean).map(String) : [],
    aliases: Array.isArray(artist.aliases) ? artist.aliases.filter(Boolean).map(String) : [],
    images: Array.isArray(artist.images) ? artist.images.filter(Boolean).map(String) : [],
    _contextKey: artist._contextKey ? String(artist._contextKey) : null,
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
      cmd: isPreload ? 'preload_native_artist' : 'open_native_artist',
      isUpdate: Boolean(opts && opts.isUpdate),
      artist: safeArtist
    });
  } catch (e) { console.error('Failed to open native artist sheet', e); }
  return safeArtist;
}

export function openNativeLabelFast(label, opts = {}) {
  if (!label) return null;
  const isPreload = Boolean(opts && opts.preload);
  const ts = Date.now();
  if (!isPreload) {
    window.__lastFastOpenLabelTs = ts;
  }

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
      cmd: isPreload ? 'preload_native_label' : 'open_native_label',
      isUpdate: Boolean(opts && opts.isUpdate),
      replaceArtist: Boolean(opts && opts.replaceArtist),
      label: safeLabel
    });
  } catch (e) { console.error('Failed to open native label sheet', e); }
  return safeLabel;
}

const _normStr = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/ø/gi, 'o')
  .replace(/æ/gi, 'ae')
  .replace(/œ/gi, 'oe')
  .replace(/ł/gi, 'l')
  .toLowerCase()
  .replace(/\s*\(\d+\)\s*$/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const _normKeepAccents = (s) => String(s || '')
  .normalize('NFC')
  .toLowerCase()
  .replace(/\s*\(\d+\)\s*$/, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
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
  'moonshoe': ['https://moonshoerecords.bandcamp.com'],
  'moonshoe records': ['https://moonshoerecords.bandcamp.com'],
};

function _discoverCrossEntityLinksForNames(names = [], bcSearchResults = [], opts = {}) {
  const isLabel = Boolean(opts && opts.isLabel);
  const discovered = [];
  for (const raw of names) {
    const n = _normStr(raw);
    const l = _normLabelCore(raw);
    if (n && CLIENT_CROSS_ENTITY_LINKS[n]) discovered.push(...CLIENT_CROSS_ENTITY_LINKS[n]);
    if (l && CLIENT_CROSS_ENTITY_LINKS[l]) discovered.push(...CLIENT_CROSS_ENTITY_LINKS[l]);
  }
  const wantNorms = new Set(names.map(_normStr).filter(Boolean));
  const wantCores = new Set(names.map(_normLabelCore).filter(Boolean));
  const wantSlugs = new Set([...wantCores].map(c => c.replace(/[^a-z0-9]/g, '')).filter(s => s.length >= 4));

  for (const item of (bcSearchResults || [])) {
    if (!item) continue;
    const itemUrl = item.trackUrl || item.url || '';
    if (!itemUrl || !itemUrl.includes('bandcamp.com')) continue;
    const itemArtistNorm = _normStr(item.artistName || item.artist || '');
    const itemArtistCore = _normLabelCore(item.artistName || item.artist || '');
    const itemTitleCore = _normLabelCore(item.title || '');
    const isBandEntity = item.type === 'label' || item.type === 'artist';

    let matchesEntity = false;
    if (isLabel) {
      try {
        const u = new URL(itemUrl);
        const sub = u.hostname.replace(/\.bandcamp\.com$/i, '').replace(/-/g, '').toLowerCase();
        const subMatches = [...wantSlugs].some(s =>
          sub === s || sub === `${s}records` || sub === `${s}recordings` || sub === `${s}music` || sub === `${s}label` || sub === `${s}tapes`
        );
        const bandMatches = isBandEntity && ([...wantCores].some(c => c.length >= 3 && (itemTitleCore === c || itemArtistCore === c)));
        matchesEntity = subMatches || bandMatches;
      } catch (e) {}
    } else {
      matchesEntity = [...wantNorms].some(w =>
        w.length >= 3 && (itemArtistNorm === w || (isBandEntity && _normStr(item.title || '') === w))
      );
    }

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

export async function openRichArtistSheet(artistInput, opts = {}) {
  const isPreload = Boolean(opts && opts.preload);
  const isObj = artistInput && typeof artistInput === 'object';
  const rawName = isObj ? (artistInput.name || artistInput.artistName || artistInput.title || '') : String(artistInput || '');
  const cleanName = String(rawName).replace(/\s*\(\d+\)\s*$/, '').trim();
  if (!cleanName) return;

  if (typeof window !== 'undefined') {
    window.__kyoyuPreloadedArtists = window.__kyoyuPreloadedArtists || {};
  }

  // If the item is already marked as a label or its name clearly indicates a record label, open the Label Sheet directly
  if (isObj && (artistInput.entityType === 'label' || artistInput.type === 'label')) {
    return openRichLabelSheet(artistInput, opts);
  }
  const hasExplicitArtistDiscogsId = isObj && artistInput.provider === 'discogs' && artistInput.entityType === 'artist' && /^\d+$/.test(String(artistInput.discogsId || artistInput.id || ''));
  if (!hasExplicitArtistDiscogsId && /\b(records|recordings|record label|disques|schallplatten)\b/i.test(cleanName)) {
    return openRichLabelSheet(artistInput, opts);
  }

  const hasAccents = _normKeepAccents(cleanName) !== _normStr(cleanName);
  const cacheKey = _normKeepAccents(cleanName) || _normStr(cleanName);

  // Extract context from artistInput, opts, or currently playing track if it matches this artist
  const curTrack = (typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack) ? window.__kyoyuGetCurrentTrack() : null;
  const curArtistRaw = String(curTrack?.artistName || curTrack?.artist || '').trim();
  const curArtistMatches = Boolean(
    curArtistRaw && (
      _normStr(curArtistRaw) === _normStr(cleanName) ||
      curArtistRaw.split(/\s*(?:,|&|and|x|vs\.?|feat\.?|ft\.?|\/|\+)\s*/i).some(p => _normStr(p) === _normStr(cleanName))
    )
  );
  const ctxTrackTitle = String((isObj && (artistInput.trackTitle || artistInput.currentTrackTitle)) || opts?.trackTitle || (curArtistMatches ? (curTrack?.title || '') : '') || '').trim();
  const ctxAlbum = String((isObj && (artistInput.album || artistInput.albumName)) || opts?.album || (curArtistMatches ? (curTrack?.album || curTrack?.albumName || '') : '') || '').trim();
  const ctxLabel = String((isObj && artistInput.label) || opts?.label || (curArtistMatches ? (curTrack?.label || '') : '') || '').trim();
  const ctxTrackUrl = String((isObj && (artistInput.trackUrl || artistInput.url)) || opts?.trackUrl || (curArtistMatches ? (curTrack?.trackUrl || curTrack?.providerUrl || curTrack?.albumUrl || '') : '') || '').trim();
  const forceContextVerify = Boolean((isObj && artistInput.forceContextVerify) || opts?.forceContextVerify);

  // Build composite context key when track/album/label context is available so homonym artists never collide
  const contextKey = (ctxTrackTitle || ctxAlbum || ctxLabel)
    ? `${cacheKey}|${_normStr(ctxTrackTitle)}|${_normStr(ctxAlbum)}|${_normStr(ctxLabel)}`
    : '';

  const cachedByContext = (typeof window !== 'undefined' && contextKey)
    ? window.__kyoyuPreloadedArtists?.[contextKey]
    : null;
  const cachedByName = typeof window !== 'undefined' && (
    window.__kyoyuPreloadedArtists?.[cacheKey] ||
    (!hasAccents ? window.__kyoyuPreloadedArtists?.[_normStr(cleanName)] : null)
  );
  const cachedArtist = cachedByContext || (
    (!contextKey && !forceContextVerify) || (cachedByName && cachedByName._contextKey && cachedByName._contextKey === contextKey)
      ? cachedByName
      : null
  );
  if (cachedArtist && cachedArtist._enriched) {
    if (!isPreload) {
      openNativeArtistFast(cachedArtist);
    }
    return cachedArtist;
  }

  const initialCrossLinks = _discoverCrossEntityLinksForNames([
    cleanName,
    ...(isObj && Array.isArray(artistInput.aliases) ? artistInput.aliases : []),
  ]);

  const initialArtist = {
    id: (isObj && artistInput.id) ? String(artistInput.id) : `artist-${_normStr(cleanName)}`,
    name: cleanName,
    _contextKey: contextKey || null,
    realname: isObj ? (artistInput.realname || null) : null,
    location: isObj ? (artistInput.location || null) : null,
    summary: isObj ? (artistInput.summary || null) : null,
    profile: isObj ? (artistInput.profile || null) : null,
    artisticPersona: isObj ? (artistInput.artisticPersona || null) : null,
    influencesAndInspirations: isObj ? (artistInput.influencesAndInspirations || null) : null,
    collaborations: isObj ? (artistInput.collaborations || null) : null,
    collaborators: isObj && Array.isArray(artistInput.collaborators) ? artistInput.collaborators : [],
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

  if (!isPreload) {
    openNativeArtistFast(initialArtist);
  }

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
        body: JSON.stringify({
          action: 'artist-profile',
          artistId,
          artistName: cleanName,
          trackTitle: ctxTrackTitle,
          album: ctxAlbum,
          label: ctxLabel,
          trackUrl: ctxTrackUrl,
        }),
      }).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanName }),
      }).then(res => res.ok ? res.json() : null).catch(() => null),
    ]);

    let profile = (r && r.ok) ? await r.json().catch(() => null) : null;
    // If Discogs determined that this name is actually a Record Label (not an artist), switch to Label Sheet immediately!
    if (profile && profile.isLabel) {
      return openRichLabelSheet({
        ...(isObj ? artistInput : {}),
        id: profile.labelId || initialArtist.id,
        discogsId: profile.labelId || null,
        name: profile.labelName || cleanName,
        provider: 'discogs',
        replaceArtist: !isPreload,
      }, opts);
    }

    // If this is a collaborative artist (e.g. "Cousin & Priori") and Discogs didn't find a joint artist profile,
    // also fetch individual member profiles so the joint Artist Sheet is rich with bios, members, and releases!
    const collabParts = cleanName.split(/\s+(?:&|and|x|vs\.?|feat\.?|ft\.?|\+)\s+/i).map(s => s.trim()).filter(Boolean);
    let memberProfiles = [];
    if (collabParts.length >= 2 && (!profile || profile.error || (!profile.profile && !(profile.topReleases || []).length))) {
      memberProfiles = (await Promise.all(
        collabParts.slice(0, 3).map(mName =>
          fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'artist-profile', artistName: mName }),
          }).then(res => res.ok ? res.json() : null).catch(() => null)
        )
      )).filter(p => p && !p.error && !p.isLabel);
    }

    const wantPlain = _normStr(cleanName);
    const wantAccent = _normKeepAccents(cleanName);
    const knownReleaseTitles = new Set(
      [
        ...((profile && Array.isArray(profile.topReleases)) ? profile.topReleases.map(rel => _normStr(rel.title)) : []),
        ctxAlbum ? _normStr(ctxAlbum) : '',
        ctxTrackTitle ? _normStr(ctxTrackTitle) : '',
      ].filter(Boolean)
    );
    const bcItems = (bcSearchRes?.results || []).filter(item => {
      if (!item || (item.type !== 'album' && item.type !== 'track')) return false;
      const itemArtistRaw = String(item.artistName || '');
      const itemArtistPlain = _normStr(itemArtistRaw);
      const itemArtistAccent = _normKeepAccents(itemArtistRaw);
      const exactOrCollabMatch = itemArtistPlain === wantPlain ||
        itemArtistRaw.split(/\s*(?:,|&|and|x|vs\.?|feat\.?|ft\.?|\/|\+)\s*/i).some(part => _normStr(part) === wantPlain);
      if (!exactOrCollabMatch) return false;
      if (hasAccents && profile && !profile.error) {
        const accentMatches = itemArtistAccent === wantAccent ||
          itemArtistRaw.split(/\s*(?:,|&|and|x|vs\.?|feat\.?|ft\.?|\/|\+)\s*/i).some(part => _normKeepAccents(part) === wantAccent);
        const releaseMatches = knownReleaseTitles.has(_normStr(item.title || ''));
        return accentMatches || releaseMatches;
      }
      return true;
    });

    if ((profile && !profile.error) || memberProfiles.length > 0 || bcItems.length > 0) {
      const pObj = (profile && !profile.error) ? profile : {};
      const allAliases = Array.from(new Set([
        ...(initialArtist.aliases || []),
        ...(Array.isArray(pObj.aliases) ? pObj.aliases : []),
        ...collabParts,
      ])).filter(a => a && _normStr(a) !== _normStr(cleanName));

      const releaseLabels = [
        ...(pObj.topReleases || []),
        ...memberProfiles.flatMap(mp => mp.topReleases || []),
      ]
        .flatMap(rel => Array.isArray(rel.labels) ? rel.labels : (rel.label ? [rel.label] : []))
        .filter(Boolean);

      const crossLinks = _discoverCrossEntityLinksForNames(
        [cleanName, pObj.name, pObj.realname, ...collabParts, ...allAliases, ...releaseLabels.slice(0, 6)],
        bcSearchRes?.results || []
      );

      const mergedUrls = _prioritizeAndDedupeLinks([
        ...crossLinks,
        ...(initialArtist.urls || []),
        ...(pObj.urls || []),
        ...memberProfiles.flatMap(mp => mp.urls || []),
        pObj.id ? `https://www.discogs.com/artist/${pObj.id}` : '',
      ]);
      const mergedImages = (pObj.images && pObj.images.length)
        ? pObj.images
        : (memberProfiles.flatMap(mp => mp.images || []).filter(Boolean).length
            ? memberProfiles.flatMap(mp => mp.images || []).filter(Boolean)
            : initialArtist.images);

      const dominantArtistLabel = [
        ...(pObj.topReleases || []).map(r => (Array.isArray(r.labels) ? r.labels[0] : r.label) || ''),
        ctxLabel || '',
      ].map(l => String(l || '').replace(/\s*\(\d+\)\s*$/, '').trim())
       .find(l => l && !/^(not on label.*|self[- ]?released.*|no label|none|unknown.*)$/i.test(l) && _normStr(l) !== _normStr(cleanName)) || cleanName;

      const relMap = new Map();
      const pushRel = (rel) => {
        if (!rel || !rel.title) return;
        const relArtist = rel.artist || rel.artistName || cleanName;
        const cleanTitle = cleanTrackOrReleaseTitle(rel.title, relArtist);
        const k = _normStr(cleanTitle);
        if (!k) return;
        const rawLbl = Array.isArray(rel.labels) ? rel.labels[0] : (rel.label || '');
        const cleanLbl = String(rawLbl || '').replace(/\s*\(\d+\)\s*$/, '').trim();
        const validLbl = (cleanLbl && !/^(not on label.*|self[- ]?released.*|no label|none|unknown.*)$/i.test(cleanLbl))
          ? cleanLbl
          : '';
        if (relMap.has(k)) {
          const existing = relMap.get(k);
          if (validLbl && (!existing.label || _normStr(existing.label) === _normStr(cleanName))) {
            existing.label = validLbl;
          }
          if (!existing.year && rel.year) existing.year = String(rel.year);
          if (!existing.discogsId && rel.discogsId) existing.discogsId = String(rel.discogsId);
          if (!existing.trackUrl && (rel.trackUrl || rel.url)) existing.trackUrl = rel.trackUrl || rel.url;
          if (!existing.coverImage && (rel.coverImage || rel.thumb || rel.artworkUrl)) {
            existing.coverImage = rel.coverImage || rel.thumb || rel.artworkUrl;
            existing.thumb = existing.coverImage;
          }
          return;
        }
        relMap.set(k, {
          ...rel,
          id: String(rel.id || `discogs-a-${rel.discogsId || Math.random()}`),
          discogsId: rel.discogsId ? String(rel.discogsId) : null,
          title: cleanTitle || rel.title || 'Unknown',
          artist: relArtist,
          label: validLbl || dominantArtistLabel || cleanName,
          year: rel.year ? String(rel.year) : null,
          thumb: rel.thumb || rel.coverImage || rel.artworkUrl || null,
          coverImage: rel.coverImage || rel.thumb || rel.artworkUrl || null,
          trackUrl: rel.trackUrl || rel.url || null,
          type: rel.type || 'release',
          provider: rel.provider || 'discogs',
        });
      };
      bcItems.forEach(item => pushRel({
        id: `bc-a-${_normStr(item.title)}`,
        title: item.title,
        artist: item.artistName || cleanName,
        label: item.label || null,
        year: item.year || null,
        artworkUrl: item.artworkUrl ? item.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : null,
        trackUrl: item.trackUrl,
        provider: 'bandcamp',
        type: item.type || 'release',
      }));
      (pObj.topReleases || []).forEach(pushRel);
      (initialArtist.topReleases || []).forEach(pushRel);
      memberProfiles.forEach(mp => (mp.topReleases || []).slice(0, 10).forEach(pushRel));

      const mergedReleases = Array.from(relMap.values());
      const combinedBio = pObj.profile
        || memberProfiles.map(mp => mp.profile ? `${mp.name}: ${mp.profile}` : '').filter(Boolean).join('\n\n')
        || initialArtist.profile;

      const bcArtistHit = (bcSearchRes?.results || []).find(item =>
        (item.type === 'artist' || item.type === 'label') &&
        (hasAccents
          ? _normKeepAccents(item.title || item.artistName || '') === wantAccent
          : _normStr(item.title || item.artistName || '') === wantPlain)
      );
      let resolvedLocation = pObj.location
        || memberProfiles.map(mp => mp.location).filter(Boolean).join(' / ')
        || bcArtistHit?.location
        || initialArtist.location
        || '';
      if (!resolvedLocation && combinedBio) {
        const locM = combinedBio.match(/\b(?:based|located|living|residing)\s+in\s+([A-Z][A-Za-z\s,.-]{2,40}?)(?:\.|,|;|\s+and\s+|\s+who\s+|$)/)
          || combinedBio.match(/\b(?:producer|dj|artist|musician|duo|project|trio|collective)\s+from\s+([A-Z][A-Za-z\s,.-]{2,35}?)(?:\.|,|;|\s+and\s+|$)/i);
        if (locM && locM[1]) resolvedLocation = locM[1].trim().replace(/[.,;]+$/, '');
      }

      let resolvedSummary = pObj.summary || initialArtist.summary || '';
      if (!resolvedSummary) {
        const sourceText = (combinedBio || pObj.artisticPersona || '').replace(/\s+/g, ' ').trim();
        if (sourceText) {
          const firstSent = (sourceText.split(/(?<=[.!?])\s+/)[0] || '').trim();
          if (firstSent) {
            resolvedSummary = /[.!?]$/.test(firstSent) ? firstSent : `${firstSent}.`;
          }
        }
      }

      const enrichedArtist = {
        ...initialArtist,
        ...pObj,
        name: (pObj.name || cleanName).replace(/\s*\(\d+\)\s*$/, ''),
        _contextKey: contextKey || null,
        location: resolvedLocation || null,
        summary: resolvedSummary || null,
        profile: combinedBio || null,
        collaborators: Array.from(new Set([
          ...(initialArtist.collaborators || []),
          ...(pObj.collaborators || []),
          ...(collabParts.length >= 2 ? collabParts : []),
        ])).filter(Boolean),
        aliases: allAliases,
        images: mergedImages,
        urls: mergedUrls,
        topReleases: mergedReleases.length ? mergedReleases : initialArtist.topReleases,
        _enriched: true,
      };
      if (typeof window !== 'undefined' && cacheKey) {
        if (contextKey) {
          window.__kyoyuPreloadedArtists[contextKey] = enrichedArtist;
        }
        window.__kyoyuPreloadedArtists[cacheKey] = enrichedArtist;
        if (enrichedArtist.name) {
          const enrichedKey = _normKeepAccents(enrichedArtist.name);
          if (enrichedKey) window.__kyoyuPreloadedArtists[enrichedKey] = enrichedArtist;
          if (!hasAccents) {
            window.__kyoyuPreloadedArtists[_normStr(enrichedArtist.name)] = enrichedArtist;
          }
        }
      }

      openNativeArtistFast(enrichedArtist, { isUpdate: !isPreload, preload: isPreload });
    }
  } catch (err) {
    console.warn('[openRichArtistSheet] error:', err);
  }
}

export async function openRichLabelSheet(labelInput, opts = {}) {
  const isPreload = Boolean(opts && opts.preload);
  const isObj = labelInput && typeof labelInput === 'object';
  const rawName = isObj ? (labelInput.name || labelInput.label || labelInput.title || labelInput.artistName || '') : String(labelInput || '');
  let cleanName = String(rawName)
    .replace(/\[.*?\]/g, '')
    .replace(/\(sub-label.*?\)/i, '')
    .split('—')[0]
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  if (!cleanName || cleanName === '—') return;

  const isBandcampUrlMatchingLabel = (urlStr, targetLabelName) => {
    if (!urlStr || typeof urlStr !== 'string' || !urlStr.includes('bandcamp.com')) return false;
    try {
      const u = new URL(urlStr);
      const sub = u.hostname.replace(/\.bandcamp\.com$/i, '').replace(/-/g, '').toLowerCase();
      const targetCore = _normLabelCore(targetLabelName);
      const targetSlug = targetCore.replace(/[^a-z0-9]/g, '');
      if (targetSlug.length >= 3 && (
        sub === targetSlug ||
        sub === `${targetSlug}records` ||
        sub === `${targetSlug}recordings` ||
        sub === `${targetSlug}music` ||
        sub === `${targetSlug}label` ||
        sub === `${targetSlug}tapes` ||
        sub.startsWith(targetSlug)
      )) {
        return true;
      }
      const mapped = CLIENT_CROSS_ENTITY_LINKS[_normStr(targetLabelName)] || CLIENT_CROSS_ENTITY_LINKS[targetCore] || [];
      if (mapped.some(m => m.toLowerCase().includes(u.hostname.toLowerCase()))) return true;
      return false;
    } catch {
      return false;
    }
  };

  // Check if the currently playing track is on a Bandcamp label domain while cleanName temporarily fell back to the artist name
  const curTrack = (typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack) ? window.__kyoyuGetCurrentTrack() : null;
  const curArtist = String(curTrack?.artistName || curTrack?.artist || '').trim();
  const explicitLabelUrl = [
    opts?.labelUrl,
    isObj ? labelInput.labelUrl : '',
    curTrack?.labelUrl,
  ].find(u => typeof u === 'string' && /^https?:\/\/[^/]+\.bandcamp\.com/i.test(u)) || '';
  const curBcTrackUrl = [
    explicitLabelUrl,
    isObj ? labelInput.url : '',
    curTrack?.albumUrl,
    curTrack?.providerUrl,
    curTrack?.trackUrl,
    curTrack?.providerItemId,
    curTrack?.replay?.url,
    curTrack?.origin?.url,
  ].find(u => typeof u === 'string' && /^https?:\/\/[^/]+\.bandcamp\.com/i.test(u)) || '';
  const curBcOrigin = (() => {
    try { return curBcTrackUrl ? new URL(curBcTrackUrl).origin : ''; } catch { return ''; }
  })();
  const isArtistFallbackForBandcampTrack = Boolean(
    curBcOrigin && curArtist && _normStr(cleanName) === _normStr(curArtist)
  );
  if (curTrack?.label && isArtistFallbackForBandcampTrack && _normStr(curTrack.label) !== _normStr(curArtist)) {
    cleanName = String(curTrack.label).trim();
  }

  if (typeof window !== 'undefined') {
    window.__kyoyuPreloadedLabels = window.__kyoyuPreloadedLabels || {};
  }
  const cacheKey = _normLabelCore(cleanName);
  const cachedLabel = !isArtistFallbackForBandcampTrack && typeof window !== 'undefined' && window.__kyoyuPreloadedLabels?.[cacheKey];
  if (cachedLabel && cachedLabel._enriched && (cachedLabel.topReleases || []).length > 0) {
    if (!isPreload) {
      openNativeLabelFast(cachedLabel, { replaceArtist: Boolean(isObj && labelInput.replaceArtist) });
    }
    return cachedLabel;
  }

  const initialCrossLinks = _discoverCrossEntityLinksForNames([
    cleanName,
    ...(isObj && Array.isArray(labelInput.aliases) ? labelInput.aliases : []),
    isObj ? labelInput.parentLabel : '',
  ], [], { isLabel: true });

  const initialUrls = [...initialCrossLinks];
  if (isObj) {
    if (Array.isArray(labelInput.urls)) initialUrls.push(...labelInput.urls);
    if (labelInput.labelUrl) initialUrls.push(labelInput.labelUrl);
    if (labelInput.url) initialUrls.push(labelInput.url);
    if (labelInput.trackUrl) initialUrls.push(labelInput.trackUrl);
  }
  if (opts?.labelUrl) initialUrls.push(opts.labelUrl);
  if (curBcOrigin && (isArtistFallbackForBandcampTrack || isBandcampUrlMatchingLabel(curBcOrigin, cleanName))) {
    initialUrls.unshift(curBcOrigin);
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

  if (!isPreload) {
    openNativeLabelFast(currentLabel, { replaceArtist: Boolean(isObj && labelInput.replaceArtist) });
  }

  const labelId = (isObj && labelInput.provider === 'discogs' && /^\d+$/.test(String(labelInput.id || '')))
    ? labelInput.id
    : (isObj && labelInput.discogsId ? labelInput.discogsId : null);

  let bcUrl = initialUrls.find(u => isBandcampUrlMatchingLabel(u, cleanName) || (isArtistFallbackForBandcampTrack && u === curBcOrigin)) || '';

  // 1. Fetch Discogs + MusicBrainz label profile & releases, and Bandcamp search in parallel
  const discogsPromise = fetch('/api/discogs-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'label-profile', labelId, labelName: cleanName }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  const labelCoreForSearch = _normLabelCore(cleanName);
  const bcSearchQueries = Array.from(new Set([
    cleanName,
    (!/\brecords\b/i.test(cleanName) && labelCoreForSearch) ? `${cleanName} Records` : '',
  ])).filter(Boolean);

  const bcSearchPromise = (!bcUrl)
    ? Promise.all(
        bcSearchQueries.map(q =>
          fetch('/api/bandcamp-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q }),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        )
      ).then(resArr => ({
        results: resArr.flatMap(r => (r && Array.isArray(r.results)) ? r.results : []),
      }))
    : Promise.resolve(null);

  let [discogsData, bcSearchData] = await Promise.all([discogsPromise, bcSearchPromise]);

  // Discover Bandcamp URL from Discogs/MusicBrainz urls, cross-entity links, or Bandcamp search results
  if (discogsData) {
    const dcCrossLinks = _discoverCrossEntityLinksForNames(
      [
        cleanName,
        discogsData.name,
        ...(discogsData.aliases || []),
      ].filter(Boolean),
      bcSearchData?.results || [],
      { isLabel: true }
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
    const targetNorm = _normStr(discogsData?.name || cleanName);
    const targetCore = _normLabelCore(discogsData?.name || cleanName);
    const bcHit = bcSearchData.results.find(item => {
      if (item.type !== 'label' && item.type !== 'artist') return false;
      const itemNorm = _normStr(item.title || item.artistName || '');
      const itemCore = _normLabelCore(item.title || item.artistName || '');
      const itemUrl = item.trackUrl || item.url || '';
      return itemNorm === targetNorm || (targetCore.length >= 4 && itemCore === targetCore) || isBandcampUrlMatchingLabel(itemUrl, discogsData?.name || cleanName);
    });
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

    const canonicalLabelName = (bc && bc.name && isArtistFallbackForBandcampTrack)
      ? bc.name
      : ((dc && dc.name) ? dc.name : ((bc && bc.name) ? bc.name : currentLabel.name));

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
      rawUrls.unshift(bcUrl.replace(/\/music\/?$/, ''));
    }

    // Filter out any unrelated Bandcamp URLs that don't match the label or official Discogs/MB links
    const officialDcBcUrls = new Set([
      dc?.bandcampUrl,
      ...(Array.isArray(dc?.urls) ? dc.urls : []),
      bcUrl ? bcUrl.replace(/\/music\/?$/, '') : '',
    ].filter(Boolean).map(u => u.toLowerCase().replace(/\/+$/, '')));

    const validatedRawUrls = rawUrls.filter(u => {
      if (!u || typeof u !== 'string') return false;
      if (!u.toLowerCase().includes('bandcamp.com')) return true;
      const normU = u.toLowerCase().replace(/\/music\/?$/, '').replace(/\/+$/, '');
      if (officialDcBcUrls.has(normU)) return true;
      return isBandcampUrlMatchingLabel(u, canonicalLabelName) || isBandcampUrlMatchingLabel(u, cleanName);
    });

    const isCanonicalDistinctFromArtist = Boolean(
      canonicalLabelName &&
      (!curArtist || (
        _normStr(canonicalLabelName) !== _normStr(curArtist) &&
        !String(curArtist).split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).some(part => _normStr(part) === _normStr(canonicalLabelName))
      ))
    );
    if (bc && bc.name && isArtistFallbackForBandcampTrack && isCanonicalDistinctFromArtist) {
      try {
        window.webkit?.messageHandlers?.player?.postMessage({ label: canonicalLabelName });
      } catch (e) {}
    }

    // Merge releases from Discogs and Bandcamp (deduplicated by normalized title)
    const releaseMap = new Map();
    const addRelease = (rel) => {
      if (!rel || !rel.title) return;
      const cleaned = splitCleanMetadata(String(rel.title).trim(), String(rel.artist || rel.artistName || '').trim(), canonicalLabelName);
      let titleStr = cleanTrackOrReleaseTitle(cleaned.title || String(rel.title).trim(), cleaned.artist);
      let artistStr = cleaned.artist || String(rel.artist || rel.artistName || '').trim();
      const key = _normStr(titleStr);
      if (!key) return;
      const existing = releaseMap.get(key);
      const relYearInt = parseInt(rel.year, 10);
      const validRelYear = (relYearInt >= 1950 && relYearInt <= new Date().getFullYear() + 1) ? String(relYearInt) : null;
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
          year: validRelYear,
          releaseTimestamp: rel.releaseTimestamp || 0,
          gridIndex: typeof rel.gridIndex === 'number' ? rel.gridIndex : 9999,
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
        if (validRelYear) {
          const exYr = parseInt(existing.year, 10);
          if (!exYr || Number(validRelYear) < exYr) {
            existing.year = validRelYear;
          }
        }
        if (!existing.releaseTimestamp && rel.releaseTimestamp) existing.releaseTimestamp = rel.releaseTimestamp;
        if (typeof rel.gridIndex === 'number' && rel.gridIndex < existing.gridIndex) existing.gridIndex = rel.gridIndex;
        if (!existing.catno && rel.catno) existing.catno = rel.catno;
        if (!existing.format && rel.format) existing.format = rel.format;
        if (!existing.discogsId && rel.discogsId) existing.discogsId = String(rel.discogsId);
        if ((!existing.artist || existing.artist === canonicalLabelName) && artistStr) existing.artist = artistStr;
      }
    };

    if (bc && Array.isArray(bc.releases)) {
      bc.releases.forEach((r, idx) => addRelease({
        id: `bc-lbl-${_normStr(r.title)}-${idx}`,
        title: r.title,
        artist: r.artist || canonicalLabelName,
        year: r.year || null,
        releaseTimestamp: r.releaseTimestamp || 0,
        gridIndex: typeof r.gridIndex === 'number' ? r.gridIndex : idx,
        artworkUrl: r.artworkUrl ? r.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : '',
        trackUrl: r.url,
        provider: 'bandcamp',
        type: 'release',
      }));
    }
    if (dc && Array.isArray(dc.topReleases)) {
      dc.topReleases.forEach((r, idx) => addRelease({
        ...r,
        gridIndex: typeof r.gridIndex === 'number' ? r.gridIndex : (1000 + idx),
      }));
    }
    (currentLabel.topReleases || []).forEach(r => addRelease(r));

    // Sort releases in chronological order (Newest -> Oldest by default)
    const mergedReleases = Array.from(releaseMap.values()).sort((a, b) => {
      const tsA = Number(a.releaseTimestamp || 0);
      const tsB = Number(b.releaseTimestamp || 0);
      const yrA = parseInt(a.year, 10) || 0;
      const yrB = parseInt(b.year, 10) || 0;
      if (yrA && yrB && yrA !== yrB) return yrB - yrA;
      if (tsA && tsB && tsA !== tsB) return tsB - tsA;
      if (yrA && !yrB && (a.gridIndex ?? 9999) > 25) return -1;
      if (!yrA && yrB && (b.gridIndex ?? 9999) > 25) return 1;
      return (a.gridIndex ?? 9999) - (b.gridIndex ?? 9999);
    });

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
      urls: _prioritizeAndDedupeLinks(validatedRawUrls),
      images: finalImages,
      topReleases: mergedReleases,
      _enriched: true,
    };

    if (typeof window !== 'undefined' && cacheKey) {
      window.__kyoyuPreloadedLabels[cacheKey] = currentLabel;
      if (currentLabel.name) {
        window.__kyoyuPreloadedLabels[_normLabelCore(currentLabel.name)] = currentLabel;
      }
    }

    openNativeLabelFast(currentLabel, { isUpdate: !isPreload, preload: isPreload });
  };

  if (discogsData && !discogsData.error && !isArtistFallbackForBandcampTrack) {
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
        // If cleanName was an artist fallback (e.g. "Cousin & Priori") and Bandcamp revealed the real label name (e.g. "NAFF"),
        // fetch Discogs + MusicBrainz label profile for the real label name too!
        if (bcData && bcData.name && (_normStr(bcData.name) !== _normStr(cleanName))) {
          const realDcRes = await fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'label-profile', labelName: bcData.name }),
          }).then(r => r.ok ? r.json() : null).catch(() => null);
          if (realDcRes && !realDcRes.error) {
            discogsData = realDcRes;
          }
        }
        mergeAndEmit(discogsData, bcData);
      }
    } catch (e) {}
  }
}

export async function openReleaseFromSheet(releaseObj) {
  if (!releaseObj) return;
  const rawArtist = releaseObj.artist || releaseObj.artistName || '';
  const cleaned = splitCleanMetadata(releaseObj.title || '', rawArtist, releaseObj.label || '');
  const title = cleaned.title || releaseObj.title || '';
  const artist = cleaned.artist || rawArtist;
  const label = cleaned.label || releaseObj.label || '';
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

      const bcArtist = bcRes?.artist || artist;
      const bcLabel = bcRes?.label || label;
      let tracks = [];
      if (bcRes && Array.isArray(bcRes.tracks) && bcRes.tracks.length > 0) {
        tracks = bcRes.tracks.map((t, idx) => ({
          id: `bc-${t.trackId || idx}-${Date.now()}`,
          title: cleanTrackOrReleaseTitle(t.title || `Track ${idx + 1}`, t.artist || bcArtist),
          artist: t.artist || bcArtist,
          label: bcLabel,
          url: t.streamUrl || t.trackUrl || trackUrl,
          trackUrl: t.trackUrl || trackUrl,
          providerItemId: t.trackUrl || trackUrl,
          cover: t.artworkUrl || bcRes.artworkUrl || cover,
          provider: 'bandcamp',
        }));
      }

      const info = dcInfoRes || {};
      openNativeAlbumFast({
        id: tempAlbumId,
        title: cleanTrackOrReleaseTitle(bcRes?.albumName || info.album || title, bcArtist),
        artist: info.artist || bcArtist,
        cover: bcRes?.artworkUrl || cover || info.coverImage || info.thumb || '',
        year: info.year || bcRes?.year || year,
        genre: info.genre || '',
        label: info.label || bcLabel,
        labelUrl: bcRes?.labelUrl || '',
        provider: 'bandcamp',
        description: info.description || '',
        tracks: tracks.length > 0 ? tracks : [
          {
            id: `${tempAlbumId}-0`,
            title,
            artist: bcArtist,
            label: bcLabel,
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
            title: cleanTrackOrReleaseTitle(d.title || title, d.artist || artist),
            artist: d.artist || artist,
            cover: d.cover || cover,
            year: d.year || year,
            genre: d.genre || '',
            label: d.label || label,
            provider: 'discogs',
            description: d.notes || '',
            tracks: d.tracks.map((t, i) => {
              const trArtist = t.artist || d.artist || artist;
              const trTitle = cleanTrackOrReleaseTitle(t.title || '', trArtist);
              return {
                id: `discogs-${discogsId}-track-${i}`,
                title: `${t.position ? t.position + '. ' : ''}${trTitle}`,
                artist: trArtist,
                url: `resolve:${trArtist} ${trTitle}`.trim(),
                cover: d.cover || cover,
                provider: '',
              };
            }),
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
  return (Array.isArray(list) ? list : []).map(t => {
    const rawArtist = t.artist || t.artistName ? String(t.artist || t.artistName) : '';
    const cleanedTitle = cleanTrackOrReleaseTitle(String(t.title || 'Unknown'), rawArtist) || String(t.title || 'Unknown');
    return {
      id: String(t.id || Math.random()),
      title: cleanedTitle,
      artist: rawArtist || null,
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
    };
  });
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
 * or empty coverImage, using an in-memory cache + coverByTitleArtist map + iTunes Search API + Bandcamp fallback.
 */
async function _enrichTracksWithRealArtwork(tracks = [], coverMap = new Map(), providerTrackMap = new Map()) {
  if (typeof window !== 'undefined') {
    window.__kyoyuGenreCoverCache = window.__kyoyuGenreCoverCache || {};
  }
  const cache = (typeof window !== 'undefined' && window.__kyoyuGenreCoverCache) || {};

  const resolved = await Promise.all(tracks.map(async (t) => {
    if (!t) return t;
    const cleanedTitle = cleanTrackOrReleaseTitle(t.title || '', t.artist || '') || t.title || '';
    const normTitle = _normStr(cleanedTitle);
    const normArtist = _normStr(t.artist);
    const pairKey = `${normArtist}|${normTitle}`;

    // 1. Check if we discovered a direct playable provider match (Bandcamp / SoundCloud) for this artist+title
    const provMatch = providerTrackMap.get(pairKey) || providerTrackMap.get(normTitle);
    let updated = { ...t, title: cleanedTitle };
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

    // 4. Query fast public iTunes Search API (song -> album) + Bandcamp fallback for cover art
    const q = `${t.artist || ''} ${cleanedTitle}`.trim();
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
      try {
        const itAlbRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=album&limit=1`);
        if (itAlbRes.ok) {
          const itAlbJson = await itAlbRes.json();
          const hit = itAlbJson?.results?.[0];
          const art = hit?.artworkUrl100 ? hit.artworkUrl100.replace('100x100bb', '600x600bb') : '';
          if (art) {
            cache[pairKey] = art;
            return { ...updated, coverImage: art, thumb: art };
          }
        }
      } catch (e) {}
      try {
        const bcRes = await fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (bcRes.ok) {
          const bcJson = await bcRes.json();
          const hit = (bcJson?.results || []).find(r => r && r.artworkUrl && /^https?:\/\//i.test(r.artworkUrl));
          if (hit?.artworkUrl) {
            const art = hit.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg');
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
          const trArtist = tr.artist || tr.artistName || '';
          const trTitle = cleanTrackOrReleaseTitle(tr.title, trArtist) || tr.title;
          out.push({
            id: tr.id || `pl-rec-${Math.random()}`,
            title: trTitle,
            artist: trArtist,
            label: tr.label || pl.title || 'Kyoyu Playlist',
            year: tr.year ? String(tr.year) : '',
            trackUrl: tr.trackUrl || tr.url || `resolve:${trArtist} ${trTitle}`.trim(),
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
  const ctxTitle = cleanTrackOrReleaseTitle((contextInput && contextInput.title) || (isObj && genreInput.title) || curTrack?.title || '', ctxArtist);
  const ctxAlbum = cleanTrackOrReleaseTitle((contextInput && contextInput.album) || curTrack?.releaseTitle || curTrack?.album || '', ctxArtist);
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
      const rawArtist = r.artistName || r.artist || '';
      const cleanedMeta = splitCleanMetadata(r.title || 'Unknown', rawArtist, r.labelName || '', r.albumTitle || '');
      const item = {
        id: `bc-genre-${idx}-${Date.now()}`,
        title: cleanedMeta.title || 'Unknown',
        artist: cleanedMeta.artist || rawArtist,
        label: cleanedMeta.label || r.labelName || cleanedMeta.album || node.name,
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
        const rawArtist = r.artistName || r.artist || '';
        const cleanedMeta = splitCleanMetadata(r.title || 'Unknown', rawArtist, '', '');
        const item = {
          id: r.id || `sc-genre-${idx}-${Date.now()}`,
          scTrackId: r.scTrackId ? String(r.scTrackId) : '',
          title: cleanedMeta.title || 'Unknown',
          artist: cleanedMeta.artist || rawArtist,
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
          const rawArtist = tr.artistName || tr.artist || pl.artistName || '';
          const cleanedMeta = splitCleanMetadata(tr.title, rawArtist, '', '');
          const item = {
            id: tr.id || `sc-pl-genre-${idx}-${Date.now()}`,
            scTrackId: tr.scTrackId ? String(tr.scTrackId) : '',
            title: cleanedMeta.title || tr.title,
            artist: cleanedMeta.artist || rawArtist,
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
      const relArtist = rel.artist || '';
      const relTitle = cleanTrackOrReleaseTitle(rel.title || 'Unknown', relArtist) || rel.title || 'Unknown';
      const item = {
        id: rel.id || `dc-genre-${Math.random()}`,
        discogsId: rel.discogsId ? String(rel.discogsId) : '',
        title: relTitle,
        artist: relArtist,
        label: rel.label || node.name,
        year: rel.year ? String(rel.year) : '',
        trackUrl: `resolve:${relArtist} ${relTitle}`.trim(),
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
  const artist = obj.artist || obj.artistName || '';
  const title = cleanTrackOrReleaseTitle(obj.title || '', artist) || obj.title || '';
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

export async function preloadPlayingEntities(trackInput = null, infoData = null) {
  try {
    const cur = trackInput || (typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack ? window.__kyoyuGetCurrentTrack() : null);
    if (!cur) return;
    const artist = String(cur.artistName || cur.artist || infoData?.artist || '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const title = cleanTrackOrReleaseTitle(String(cur.title || cur.name || '').trim(), artist);
    const rawAlbum = cleanTrackOrReleaseTitle(String(infoData?.album || cur.releaseTitle || cur.albumTitle || cur.album || '').replace(/\s*\(single\)\s*$/i, '').trim(), artist);
    const isInvalidAlb = /^(unknown(\s+album|\s+release)?|single\s+release|radio|track\s+radio)$/i.test(rawAlbum) || /\s+radio$/i.test(rawAlbum);
    const album = (isInvalidAlb ? '' : rawAlbum) || title || '';
    const rawLabel = String(infoData?.labelName || infoData?.label || cur.label || cur.labelName || cur.releaseLabel || '').trim();
    const candidateLabel = rawLabel
      .replace(/\[.*?\]/g, '')
      .replace(/\(sub-label.*?\)/i, '')
      .split('—')[0]
      .trim();
    const artistNorm = _normStr(artist);
    const artistCollabs = String(artist || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(_normStr).filter(Boolean);
    const isLabelDistinctFromArtist = Boolean(
      candidateLabel &&
      candidateLabel !== '—' &&
      !/^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?)$/i.test(candidateLabel) &&
      _normStr(candidateLabel) !== artistNorm &&
      !artistCollabs.includes(_normStr(candidateLabel))
    );
    const label = isLabelDistinctFromArtist ? candidateLabel : '';
    const labelUrl = String(infoData?.labelUrl || cur.labelUrl || '').trim();
    const bcTrackUrl = [cur.trackUrl, cur.url, cur.providerItemId, cur.albumUrl, infoData?.labelUrl].find(u => typeof u === 'string' && u.includes('bandcamp.com')) || '';
    const cover = String(infoData?.coverImage || cur.releaseCover || cur.artworkUrl || cur.cover || '').trim();

    const tasks = [];
    if (artist && !/^unknown/i.test(artist)) {
      tasks.push(openRichArtistSheet({
        name: artist,
        trackTitle: title,
        album,
        label,
        trackUrl: bcTrackUrl || String(cur.trackUrl || cur.url || cur.providerItemId || '').trim(),
        cover,
        forceContextVerify: true,
      }, { preload: true }).catch(() => null));
    }
    if (label) {
      tasks.push(openRichLabelSheet({ name: label, labelUrl: labelUrl || bcTrackUrl, cover }, { preload: true }).catch(() => null));
    } else if (bcTrackUrl && artist) {
      const bcSubdomain = ((bcTrackUrl.match(/^https?:\/\/([^/.]+)\.bandcamp\.com/i) || [])[1] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const compactArtist = artistNorm.replace(/\s+/g, '');
      if (bcSubdomain && compactArtist && bcSubdomain !== compactArtist && !bcSubdomain.includes(compactArtist) && !compactArtist.includes(bcSubdomain)) {
        tasks.push(openRichLabelSheet({ name: artist, labelUrl: bcTrackUrl, cover }, { preload: true }).catch(() => null));
      }
    }
    if ((artist || album || title) && typeof window !== 'undefined' && window.__kyoyuGoToAlbum) {
      tasks.push(window.__kyoyuGoToAlbum(artist, album || title, { preload: true, cover }).catch(() => null));
    }
    await Promise.allSettled(tasks);
  } catch (e) {
    console.warn('[preloadPlayingEntities] error:', e);
  }
}

/**
 * Spotify-Inspired Track Radio Engine (33 to 66 titles)
 * Combines:
 * 1. Acoustic / Tempo / Harmonic & Style Taxonomy Affinity (Primary + Sibling Subgenres)
 * 2. 2-Hop Artist, Collaborator & Imprint Neighborhood Graph
 * 3. Collaborative Filtering / Curatorial Co-Occurrence (Public SoundCloud & Kyoyu Playlists)
 * 4. Artist Diversity Cap (max 2–3 tracks per artist) + Exploration/Exploitation Interleaving
 */
export async function startTrackRadio(seedInput = null) {
  const cur = (typeof window !== 'undefined' && window.__kyoyuGetCurrentTrack)
    ? window.__kyoyuGetCurrentTrack()
    : null;
  const seed = (seedInput && typeof seedInput === 'object') ? { ...cur, ...seedInput } : (cur || {});
  const seedTitle = String(seed.title || seed.name || 'Track').trim();
  const seedArtist = String(seed.artistName || seed.artist || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  const seedAlbum = String(seed.album || seed.releaseTitle || seed.albumTitle || '').trim();
  const seedCover = String(seed.cover || seed.releaseCover || seed.artworkUrl || '').trim();

  // Pull any cached track-info for BPM, Key, Label, Styles, and Collaborators
  const cacheKey = [seedArtist, seedAlbum || seedTitle].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
  const cachedInfo = (typeof window !== 'undefined' && window.__kyoyuInfoCache && cacheKey)
    ? window.__kyoyuInfoCache[cacheKey]
    : null;

  const seedLabelRaw = String(seed.label || seed.labelName || cachedInfo?.label || '').trim();
  const seedLabel = seedLabelRaw
    .replace(/\[.*?\]/g, '')
    .replace(/\(sub-label.*?\)/i, '')
    .split('—')[0]
    .trim();
  const seedBpm = String(seed.bpm || cachedInfo?.bpm || '').trim();
  const seedKey = String(seed.key || cachedInfo?.key || '').trim();

  const classified = classifyTrackGenre(seed, {
    ...(cachedInfo || {}),
    label: seedLabel,
  });
  const primaryNode = resolveGenreNode(seed.genre || classified?.primaryGenre || 'Hypnotic Techno', { forSheet: true });
  const relatedGenreNames = Array.from(new Set([
    ...(classified?.secondaryGenres || []),
    ...(primaryNode.subgenres || []),
    ...(primaryNode.adjacentGenres || []),
    ...(primaryNode.parentGenres || []),
  ])).filter(g => _normStr(g) !== _normStr(primaryNode.name)).slice(0, 4);

  const relatedNodes = relatedGenreNames.map(g => resolveGenreNode(g, { forSheet: true }));
  const providerPriority = getProviderPriority();

  const seedArtistNorm = _normStr(seedArtist);
  const seedTitleNorm = _normStr(seedTitle);
  const seedLabelNorm = _normStr(seedLabel);

  const collaboratorSet = new Set(
    [
      ...(cachedInfo?.releaseArtists || []),
      ...(cachedInfo?.artistMembers || []),
      ...(cachedInfo?.artistAliases || []),
      ...(cachedInfo?.credits?.mixing || []),
      ...(cachedInfo?.credits?.mastering || []),
      ...(primaryNode.pioneerArtists || []),
    ].map(_normStr).filter(Boolean)
  );
  const sisterLabelSet = new Set(
    [
      seedLabel,
      ...(primaryNode.classicLabels || []),
      ...relatedNodes.flatMap(n => n.classicLabels || []),
    ].map(_normStr).filter(Boolean)
  );

  // Build candidate pool from Primary Genre + Related Sibling Genres + Platform Playlists
  const buildRadioTrackList = (rawCandidates = []) => {
    const deduped = [];
    const seenTrackKey = new Set();
    // Exclude the exact seed track itself from the suggestions (or keep it at index 0 if desired; user asked to suggest 33-66 titles matching the playing title)
    seenTrackKey.add(`${seedArtistNorm}|${seedTitleNorm}`);

    for (let i = 0; i < rawCandidates.length; i++) {
      const c = rawCandidates[i];
      if (!c || !c.title) continue;
      const tClean = String(c.title).trim();
      const aClean = String(c.artist || c.artistName || '').replace(/\s*\(\d+\)\s*$/, '').trim();
      if (!tClean || !aClean) continue;
      const tNorm = _normStr(tClean);
      const aNorm = _normStr(aClean);
      const pairKey = `${aNorm}|${tNorm}`;
      if (seenTrackKey.has(pairKey)) continue;
      seenTrackKey.add(pairKey);

      // Spotify-Style Multi-Factor Affinity Score
      let score = 50;
      const tier = c._radioTier || 'primary';
      if (tier === 'direct') score += 38;
      else if (tier === 'primary') score += 30;
      else if (tier === 'cooccurrence') score += 28;
      else if (tier === 'sibling1') score += 22;
      else score += 16;

      const lNorm = _normStr(c.label || '');
      if (seedArtistNorm && aNorm === seedArtistNorm) score += 26;
      else if (collaboratorSet.has(aNorm)) score += 20;
      if (seedLabelNorm && lNorm && (lNorm === seedLabelNorm || lNorm.includes(seedLabelNorm))) score += 25;
      else if (lNorm && sisterLabelSet.has(lNorm)) score += 16;
      if (c.fromPlaylist) score += 18;
      if (c.coverImage && /^https?:\/\//i.test(c.coverImage) && !String(c.coverImage).includes('spacer.gif')) score += 10;

      deduped.push({
        ...c,
        title: tClean,
        artist: aClean,
        _aNorm: aNorm,
        _score: score + ((i % 7) * 0.4),
      });
    }

    deduped.sort((a, b) => b._score - a._score);

    // Pass 1: Enforce Spotify Artist Diversity Cap (max 2 tracks per artist) so radio feels organic
    const selected = [];
    const overflow = [];
    const artistCounts = new Map();
    for (const item of deduped) {
      const count = artistCounts.get(item._aNorm) || 0;
      if (count < 2) {
        artistCounts.set(item._aNorm, count + 1);
        selected.push(item);
      } else {
        overflow.push(item);
      }
      if (selected.length >= 60) break;
    }

    // Pass 2: If fewer than 42 tracks after strict cap, relax cap to 3 per artist or pull from overflow to guarantee >= 36 tracks (within 33..66)
    if (selected.length < 42) {
      for (const item of overflow) {
        selected.push(item);
        if (selected.length >= 48) break;
      }
    }

    // Clamp strictly to [33, 66]
    const finalSlice = selected.slice(0, 66);
    const ordered = orderTracksByProviderPriority(finalSlice, providerPriority);

    return ordered.map((t, idx) => {
      const coverUrl = t.coverImage || t.cover || t.thumb || seedCover || '';
      const rawUrl = t.trackUrl || t.url || `resolve:${t.artist} ${t.title}`.trim();
      const rawTrackAlb = String(t.album || t.albumTitle || t.releaseTitle || '').replace(/\s*\(single\)\s*$/i, '').trim();
      const cleanTrackAlb = (/\s+radio$/i.test(rawTrackAlb) || /^(unknown(\s+album|\s+release)?|radio|track\s+radio)$/i.test(rawTrackAlb))
        ? ''
        : rawTrackAlb;
      return {
        id: t.id || `radio-${idx}-${Date.now()}`,
        title: t.title,
        artist: t.artist,
        album: cleanTrackAlb,
        releaseTitle: cleanTrackAlb,
        label: t.label || '',
        year: t.year || '',
        url: rawUrl,
        trackUrl: rawUrl,
        cover: coverUrl,
        provider: t.provider === 'discogs' ? '' : (t.provider || ''),
        scTrackId: t.scTrackId || undefined,
      };
    });
  };

  // Gather initial 0ms ontology + playlist pool (Primary genre + 4 sibling genres -> 60+ unique candidates)
  const initialPool = [];
  const pSec0 = selectGenreThreeSections(primaryNode, {}, { artist: seedArtist, label: seedLabel, title: seedTitle }, 0, providerPriority);
  const pSec1 = selectGenreThreeSections(primaryNode, {}, { artist: seedArtist, label: seedLabel, title: seedTitle }, 2, providerPriority);
  [...pSec0.recommendations, ...pSec0.essentialClassics, ...pSec0.nicheCuts, ...pSec1.essentialClassics, ...pSec1.nicheCuts].forEach(t => {
    initialPool.push({ ...t, _radioTier: 'primary' });
  });

  relatedNodes.forEach((rNode, rIdx) => {
    const rSec = selectGenreThreeSections(rNode, {}, { artist: seedArtist, label: seedLabel, title: seedTitle }, rIdx, providerPriority);
    [...rSec.recommendations, ...rSec.essentialClassics, ...rSec.nicheCuts].forEach(t => {
      initialPool.push({ ...t, _radioTier: rIdx === 0 ? 'sibling1' : 'sibling2' });
    });
  });

  _collectPlatformPlaylistTracksForGenre(primaryNode).forEach(t => {
    initialPool.push({ ...t, _radioTier: 'cooccurrence' });
  });

  const initialRadioTracks = buildRadioTrackList(initialPool);
  const radioId = `radio-${_normStr(seedArtist)}-${_normStr(seedTitle)}`.replace(/\s+/g, '-');
  if (typeof window !== 'undefined') {
    window.__kyoyuActiveRadioId = radioId;
  }
  const radioSubtitleParts = [
    primaryNode.name,
    relatedGenreNames[0] || '',
    seedBpm ? `${seedBpm} BPM` : '',
    seedKey || '',
  ].filter(Boolean);

  const radioDescription = [
    `Track Radio seeded from "${seedTitle}"${seedArtist ? ` by ${seedArtist}` : ''}.`,
    `Curated via harmonic, tempo (${seedBpm ? `${seedBpm} BPM` : primaryNode.bpmRange || 'club tempo'}${seedKey ? `, ${seedKey}` : ''}), label (${seedLabel || primaryNode.classicLabels?.[0] || 'underground imprint'}), and selector co-occurrence matching across ${primaryNode.name}${relatedGenreNames.length ? ` & ${relatedGenreNames.slice(0, 2).join(', ')}` : ''}.`,
  ].join(' ');

  const initialRadioAlbum = {
    id: radioId,
    title: `${seedTitle} Radio`,
    artist: seedArtist ? `Seeded by ${seedArtist}` : `${primaryNode.name} Radio`,
    cover: seedCover || initialRadioTracks[0]?.cover || '/album1.png',
    genre: radioSubtitleParts.slice(0, 2).join(' · ') || primaryNode.name,
    year: 'Radio',
    label: seedLabel ? `${seedLabel} · Radio` : `${primaryNode.name} Radio`,
    provider: 'radio',
    description: radioDescription,
    tracks: initialRadioTracks,
  };

  // 1. Open Radio Sheet immediately (0ms latency, guaranteed >= 33 and <= 66 tracks)
  openNativeAlbumFast(initialRadioAlbum);

  // 2. Live Multi-Provider Enrichment (Bandcamp, SoundCloud tracks + playlists, Discogs genre/label graph)
  try {
    const searchGenre = primaryNode.name.split(/[\/&]/)[0].trim();
    const labelHint = seedLabel || primaryNode.classicLabels?.[0] || '';
    const [bcArtistRes, bcGenreRes, scRes, scPlRes, dcRes] = await Promise.all([
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${seedArtist} ${labelHint}`.trim() }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/bandcamp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${searchGenre} ${labelHint}`.trim() }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/soundcloud-search?q=${encodeURIComponent(`${seedArtist} ${searchGenre}`.trim())}&limit=30`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/soundcloud-search?q=${encodeURIComponent(`${searchGenre} ${labelHint}`.trim())}&type=playlists&limit=5`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/discogs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'genre-explore',
          genre: searchGenre,
          styles: [primaryNode.name, ...relatedGenreNames.slice(0, 2)],
          artist: seedArtist,
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const liveCandidates = [];
    const coverByTitleArtist = new Map();
    const providerTrackMap = new Map();

    const registerItem = (item, tier) => {
      if (!item || !item.title) return;
      const tNorm = _normStr(item.title);
      const aNorm = _normStr(item.artist || item.artistName || '');
      const pairKey = `${aNorm}|${tNorm}`;
      if (item.coverImage && /^https?:\/\//i.test(item.coverImage) && !item.coverImage.includes('spacer.gif')) {
        coverByTitleArtist.set(pairKey, item.coverImage);
      }
      if (item.trackUrl && !String(item.trackUrl).startsWith('resolve:')) {
        providerTrackMap.set(pairKey, item);
      }
      liveCandidates.push({ ...item, _radioTier: tier });
    };

    [...(bcArtistRes?.results || []), ...(bcGenreRes?.results || [])]
      .filter(r => r && (r.type === 'track' || r.type === 'album'))
      .forEach((r, idx) => {
        const cleanCover = r.artworkUrl ? r.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg') : '';
        registerItem({
          id: `bc-radio-${idx}-${Date.now()}`,
          title: r.title || '',
          artist: r.artistName || r.artist || '',
          album: r.albumTitle || (r.type === 'album' ? r.title : '') || '',
          label: r.labelName || r.albumTitle || seedLabel || primaryNode.name,
          trackUrl: r.trackUrl || r.url || '',
          coverImage: cleanCover,
          provider: 'bandcamp',
        }, 'direct');
      });

    (scRes?.results || []).forEach((r, idx) => {
      registerItem({
        id: r.id || `sc-radio-${idx}-${Date.now()}`,
        scTrackId: r.scTrackId ? String(r.scTrackId) : '',
        title: r.title || '',
        artist: r.artistName || r.artist || '',
        album: r.albumTitle || r.releaseTitle || '',
        label: r.genre || primaryNode.name,
        trackUrl: r.trackUrl || '',
        coverImage: r.artworkUrl || '',
        provider: 'soundcloud',
      }, 'direct');
    });

    (scPlRes?.playlists || []).forEach((pl) => {
      (pl.tracks || []).slice(0, 10).forEach((tr, idx) => {
        registerItem({
          id: tr.id || `sc-pl-radio-${idx}-${Date.now()}`,
          scTrackId: tr.scTrackId ? String(tr.scTrackId) : '',
          title: tr.title || '',
          artist: tr.artistName || tr.artist || pl.artistName || '',
          album: tr.albumTitle || tr.releaseTitle || '',
          label: pl.title || primaryNode.name,
          trackUrl: tr.trackUrl || '',
          coverImage: tr.artworkUrl || pl.artworkUrl || '',
          provider: 'soundcloud',
          fromPlaylist: true,
        }, 'cooccurrence');
      });
    });

    [...(dcRes?.classics || []), ...(dcRes?.niche || []), ...(dcRes?.releases || [])].forEach((rel, idx) => {
      const cov = rel.coverImage || rel.thumb || '';
      registerItem({
        id: rel.id || `dc-radio-${idx}-${Date.now()}`,
        title: rel.title || '',
        artist: rel.artist || '',
        album: rel.album || rel.releaseTitle || rel.title || '',
        year: rel.year ? String(rel.year) : '',
        label: rel.label || primaryNode.name,
        trackUrl: `resolve:${rel.artist || ''} ${rel.title || ''}`.trim(),
        coverImage: cov,
        provider: providerPriority[0] || 'bandcamp',
      }, 'primary');
    });

    const combinedRadioTracks = buildRadioTrackList([...liveCandidates, ...initialPool]);
    // Enrich top 28 tracks with real HTTP artwork from coverMap / iTunes so the radio sheet looks rich
    const topSlice = await _enrichTracksWithRealArtwork(
      combinedRadioTracks.slice(0, 28).map(t => ({ ...t, coverImage: t.cover })),
      coverByTitleArtist,
      providerTrackMap
    );
    const mergedFinalTracks = [
      ...topSlice.map(t => ({ ...t, cover: t.coverImage || t.cover })),
      ...combinedRadioTracks.slice(28),
    ].slice(0, 66);

    // Update the radio sheet and keep it in __kyoyuNativeAlbumsById even if user navigated to Player sheet
    if (typeof window !== 'undefined' && (window.__kyoyuCurrentNativeAlbum?.id === radioId || window.__kyoyuActiveRadioId === radioId)) {
      openNativeAlbumFast({
        ...initialRadioAlbum,
        year: 'Radio',
        tracks: mergedFinalTracks,
      }, { isUpdate: true });
    }
  } catch (err) {
    console.warn('[startTrackRadio] enrich error:', err);
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
  window.__kyoyuPreloadPlayingEntities = preloadPlayingEntities;
  window.__kyoyuStartTrackRadio = startTrackRadio;
}



