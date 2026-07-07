import { createContext, useContext, useState, useEffect } from 'react';
import { playlists as mockPlaylists, releases } from '../data/mockData';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
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
      if (stored && stored.length) return stored;
    } catch {}
    return mockPlaylists;
  });
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

  function toggleLike(trackId) {
    setLikedTracks(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }
  function isLiked(trackId) { return likedTracks.includes(trackId); }

  function toggleLikeUpload(track) {
    setLikedUploads(prev => {
      const exists = prev.find(t => t.id === track.id);
      if (exists) return prev.filter(t => t.id !== track.id);
      // Strip artworkUrl — large data URL that blows localStorage quota.
      // Stays in kyoyu-art-{uid}-{id} key and is rehydrated on display.
      // eslint-disable-next-line no-unused-vars
      const { artworkUrl: _art, artworkFile: _file, ...slim } = track;
      return [...prev, slim];
    });
  }

  // Returns liked uploads with artworkUrl rehydrated from per-art keys
  function getLikedUploads(uid) {
    if (!uid) return likedUploads;
    return likedUploads.map(t => ({
      ...t,
      artworkUrl: localStorage.getItem(`kyoyu-art-${uid}-${t.id}`) || null,
    }));
  }

  function isLikedUpload(trackId) { return likedUploads.some(t => t.id === trackId); }

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
    const newPl = { id: `pl-${Date.now()}`, title: name, tracks: [], cover: '/album1.png', creator: 'You', isAI: false };
    setPlaylists(prev => [...prev, newPl]);
    return newPl;
  }
  function addToPlaylist(playlistId, track) {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id !== playlistId) return pl;
      if (pl.tracks.some(t => t.id === track.id)) return pl;
      return { ...pl, tracks: [...pl.tracks, track] };
    }));
  }
  function getPlaylists() {
    return playlists.map(pl => ({ id: pl.id, name: pl.title, trackCount: (pl.tracks || []).length }));
  }

  return (
    <LibraryContext.Provider value={{
      likedTracks, likedUploads, savedReleases, playlists, downloads, followedArtists,
      toggleLike, isLiked, toggleLikeUpload, isLikedUpload, getLikedUploads,
      toggleSave, isSaved, toggleFollow, isFollowing,
      addDownload, createPlaylist,
      toggleDownload, isDownloaded, addToPlaylist, getPlaylists,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() { return useContext(LibraryContext); }
