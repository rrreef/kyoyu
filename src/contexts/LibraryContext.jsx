import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { playlists as mockPlaylists, releases } from '../data/mockData';
import { syncProviderLike } from '../lib/streaming';
import { isItemInConnectedLikes } from '../lib/useConnectedLibrary';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user } = useAuth() || {};
  const [likedTracks, setLikedTracks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-liked') || '[]'); } catch { return []; }
  });

  // likedUploads stores slim track metadata (no artworkUrl blob).
  // artworkUrl is rehydrated from per-art keys at read time via getLikedUploads(uid).
  const [likedUploads, setLikedUploads] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]'); } catch { return []; }
  });

  const [savedReleases, setSavedReleases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-saved') || '["void-sequence","echo-chamber"]'); } catch { return []; }
  });
  const [playlists, setPlaylists] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('kyoyu-playlists'));
      if (Array.isArray(stored)) return stored;
    } catch {}
    return mockPlaylists;
  });
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  function updatePlaylists(updater) {
    const next = typeof updater === 'function' ? updater(playlistsRef.current || []) : updater;
    playlistsRef.current = next;
    try { localStorage.setItem('kyoyu-playlists', JSON.stringify(next)); } catch {}
    setPlaylists(next);
    return next;
  }

  const [downloads, setDownloads] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-downloads') || '[]'); } catch { return []; }
  });
  const [followedArtists, setFollowedArtists] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-followed') || '["aura-system"]'); } catch { return []; }
  });

  // Safe persist — all wrapped in try/catch so QuotaExceededError never reaches ErrorBoundary
  useEffect(() => { try { localStorage.setItem('reef-liked', JSON.stringify(likedTracks)); } catch {} }, [likedTracks]);
  useEffect(() => { try { localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(likedUploads)); } catch {} }, [likedUploads]);
  useEffect(() => { try { localStorage.setItem('reef-saved', JSON.stringify(savedReleases)); } catch {} }, [savedReleases]);
  useEffect(() => { try { localStorage.setItem('reef-downloads', JSON.stringify(downloads)); } catch {} }, [downloads]);
  useEffect(() => { try { localStorage.setItem('reef-followed', JSON.stringify(followedArtists)); } catch {} }, [followedArtists]);
  useEffect(() => { try { localStorage.setItem('kyoyu-playlists', JSON.stringify(playlists)); } catch {} }, [playlists]);

  // Synchronize across multiple WKWebViews
  useEffect(() => {
    const handleStorage = (e) => {
      try {
        if (e.key === 'reef-liked') setLikedTracks(JSON.parse(e.newValue || '[]'));
        if (e.key === 'kyoyu-liked-uploads') setLikedUploads(JSON.parse(e.newValue || '[]'));
        if (e.key === 'reef-saved') setSavedReleases(JSON.parse(e.newValue || '[]'));
        if (e.key === 'reef-downloads') setDownloads(JSON.parse(e.newValue || '[]'));
        if (e.key === 'reef-followed') setFollowedArtists(JSON.parse(e.newValue || '[]'));
        if (e.key === 'kyoyu-playlists') {
          const next = JSON.parse(e.newValue || '[]');
          playlistsRef.current = next;
          setPlaylists(next);
        }
      } catch (err) {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  function toggleLike(trackId) {
    setLikedTracks(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }
  function isLiked(trackId) { return likedTracks.includes(trackId); }

  function toggleLikeUpload(track, opts = {}) {
    if (!track) return;
    const existsInUploads = likedUploads.some(t => String(t.id) === String(track.id));
    const existsInConnected = isItemInConnectedLikes(track);
    const wasLiked = typeof opts.forceLiked === 'boolean' ? !opts.forceLiked : (existsInUploads || existsInConnected);
    const nextLiked = !wasLiked;

    setLikedUploads(prev => {
      const exists = prev.find(t => String(t.id) === String(track.id));
      if (!nextLiked) {
        return exists ? prev.filter(t => String(t.id) !== String(track.id)) : prev;
      }
      if (exists) return prev;
      
      // Save artwork in a separate key to avoid quota issues on the main array
      const art = track.artworkUrl || track.cover || track.releaseCover;
      if (art) {
        try {
          const uid = user?.id || 'anon';
          localStorage.setItem(`kyoyu-art-${uid}-${track.id}`, art);
        } catch(e) {}
      }

      // Strip artworkUrl only if it's a massive base64 data URL.
      // Normal HTTP URLs for cover should be kept in the main array.
      const slim = { ...track };
      delete slim.artworkFile;
      if (slim.artworkUrl && typeof slim.artworkUrl === 'string' && slim.artworkUrl.startsWith('data:')) {
        delete slim.artworkUrl;
      }
      if (slim.cover && typeof slim.cover === 'string' && slim.cover.startsWith('data:')) {
        delete slim.cover;
      }
      if (slim.releaseCover && typeof slim.releaseCover === 'string' && slim.releaseCover.startsWith('data:')) {
        delete slim.releaseCover;
      }
      return [...prev, slim];
    });

    if (!opts.skipProviderSync) {
      try { syncProviderLike(track, nextLiked); } catch (e) {}
    }

    try {
      if (window.__kyoyuToggleLike) {
        window.__kyoyuToggleLike({
          id: track.id,
          title: track.title || track.name || '',
          artist: track.artist || '',
          album: track.album || '',
          artworkUrl: track.cover || track.artworkUrl || ''
        });
      }
    } catch(e) {}
  }

  useEffect(() => {
    window.__kyoyuToggleLikeTrack = (trackId) => {
      window.dispatchEvent(new CustomEvent('kyoyu-native-like', { detail: { trackId, handled: false } }));
    };
    window.__kyoyuIsLikedTrack = (trackId) => {
      const cleanId = String(trackId).split('?ts=')[0];
      const inUploads = likedUploads.some(t => String(t.id) === cleanId);
      const inCatalog = likedTracks.some(id => String(id) === cleanId);
      return inUploads || inCatalog || isItemInConnectedLikes(cleanId);
    };
  }, [likedUploads, likedTracks]);

  // Returns liked uploads with artworkUrl rehydrated from per-art keys
  function getLikedUploads(uid) {
    const safeUid = uid || 'anon';
    return likedUploads.map(t => ({
      ...t,
      artworkUrl: localStorage.getItem(`kyoyu-art-${safeUid}-${t.id}`) || t.artworkUrl || t.cover || null,
    }));
  }

  function isLikedUpload(trackId) { return likedUploads.some(t => String(t.id) === String(trackId)) || isItemInConnectedLikes(trackId); }

  function toggleSave(releaseId) {
    setSavedReleases(prev =>
      prev.includes(releaseId) ? prev.filter(id => id !== releaseId) : [...prev, releaseId]
    );
  }
  function isSaved(releaseId) { return savedReleases.includes(releaseId); }

  function toggleFollow(artistId) {
    setFollowedArtists(prev =>
      prev.includes(artistId) ? prev.filter(id => id !== artistId) : [...prev, artistId]
    );
  }
  function isFollowing(artistId) { return followedArtists.includes(artistId); }

  function addDownload(track) {
    if (!downloads.find(d => d.id === track.id)) {
      setDownloads(prev => [...prev, { ...track, downloadedAt: new Date().toISOString() }]);
    }
  }
  function toggleDownload(track) {
    setDownloads(prev => {
      const exists = prev.find(d => d.id === track.id);
      if (exists) return prev.filter(d => d.id !== track.id);
      return [...prev, { ...track, downloadedAt: new Date().toISOString() }];
    });
  }
  function isDownloaded(trackId) { return downloads.some(d => d.id === trackId); }

  function createPlaylist(name) {
    const newPl = { id: `pl-${Date.now()}`, title: name, tracks: [], cover: '/album1.png', creator: 'You', isAI: false, isPublic: false };
    updatePlaylists(prev => [...prev, newPl]);
    return newPl;
  }
  function addToPlaylist(playlistId, track) {
    if (!track || !playlistId) return;
    const cleanTrackId = String(track.id || '').split('?ts=')[0];
    if (!cleanTrackId) return;
    const normalizedTrack = {
      ...track,
      id: cleanTrackId,
      title: track.title || track.name || 'Unknown Track',
      artist: track.artist || track.artistName || '',
      album: track.album || track.releaseTitle || track.albumTitle || '',
      cover: track.cover || track.artworkUrl || track.releaseCover || '',
      url: track.url || track.trackUrl || track.streamUrl || track.audioUrl || track.src || '',
      audioUrl: track.audioUrl || track.src || track.streamUrl || track.url || '',
      trackUrl: track.trackUrl || track.url || '',
    };
    updatePlaylists(prev => prev.map(pl => {
      if (pl.id !== playlistId) return pl;
      const existingTracks = pl.tracks || [];
      if (existingTracks.some(t => String(t.id || '').split('?ts=')[0] === cleanTrackId)) return pl;
      const nextTracks = [...existingTracks, normalizedTrack];
      const nextCover = ((!pl.cover || pl.cover === '/album1.png') && normalizedTrack.cover && normalizedTrack.cover !== '/album1.png')
        ? normalizedTrack.cover
        : (pl.cover || '/album1.png');
      return { ...pl, cover: nextCover, tracks: nextTracks };
    }));
  }
  function getPlaylists() {
    return (playlistsRef.current || []).map(pl => ({
      id: pl.id,
      name: pl.title || pl.name || 'Untitled',
      title: pl.title || pl.name || 'Untitled',
      trackCount: (pl.tracks || []).length,
      tracks: pl.tracks || [],
      cover: pl.cover || '/album1.png',
      creator: pl.creator || 'You',
      isPublic: !!pl.isPublic,
    }));
  }
  function updatePlaylistCover(playlistId, coverUrl) {
    updatePlaylists(prev => prev.map(pl => pl.id === playlistId ? { ...pl, cover: coverUrl } : pl));
  }
  function deletePlaylist(playlistId) {
    updatePlaylists(prev => prev.filter(pl => pl.id !== playlistId));
  }
  function removeFromPlaylist(playlistId, trackId) {
    const cleanId = String(trackId || '').split('?ts=')[0];
    updatePlaylists(prev => prev.map(pl => {
      if (pl.id !== playlistId) return pl;
      return { ...pl, tracks: (pl.tracks || []).filter(t => String(t.id || '').split('?ts=')[0] !== cleanId) };
    }));
  }
  function reorderPlaylist(playlistId, fromIndex, toIndex) {
    updatePlaylists(prev => prev.map(pl => {
      if (pl.id !== playlistId) return pl;
      const tracks = [...(pl.tracks || [])];
      if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) return pl;
      const [moved] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, moved);
      return { ...pl, tracks };
    }));
  }
  function togglePlaylistPublic(playlistId) {
    updatePlaylists(prev => prev.map(pl => pl.id === playlistId ? { ...pl, isPublic: !pl.isPublic } : pl));
  }

  return (
    <LibraryContext.Provider value={{
      likedTracks, likedUploads, savedReleases, playlists, downloads, followedArtists,
      toggleLike, isLiked, toggleLikeUpload, isLikedUpload, getLikedUploads,
      toggleSave, isSaved, toggleFollow, isFollowing,
      addDownload, createPlaylist,
      toggleDownload, isDownloaded, addToPlaylist, getPlaylists, updatePlaylistCover,
      deletePlaylist, removeFromPlaylist, reorderPlaylist, togglePlaylistPublic,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() { return useContext(LibraryContext); }
