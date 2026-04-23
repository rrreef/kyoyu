import { createContext, useContext, useState, useEffect } from 'react';
import { playlists as mockPlaylists, releases } from '../data/mockData';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const [likedTracks, setLikedTracks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-liked') || '[]'); } catch { return []; }
  });
  const [savedReleases, setSavedReleases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-saved') || '["void-sequence","echo-chamber"]'); } catch { return []; }
  });
  const [playlists, setPlaylists] = useState(mockPlaylists);
  const [downloads, setDownloads] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-downloads') || '[]'); } catch { return []; }
  });
  const [followedArtists, setFollowedArtists] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reef-followed') || '["aura-system"]'); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('reef-liked', JSON.stringify(likedTracks));
  }, [likedTracks]);
  useEffect(() => {
    localStorage.setItem('reef-saved', JSON.stringify(savedReleases));
  }, [savedReleases]);
  useEffect(() => {
    localStorage.setItem('reef-downloads', JSON.stringify(downloads));
  }, [downloads]);
  useEffect(() => {
    localStorage.setItem('reef-followed', JSON.stringify(followedArtists));
  }, [followedArtists]);

  function toggleLike(trackId) {
    setLikedTracks(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }
  function isLiked(trackId) { return likedTracks.includes(trackId); }

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

  function createPlaylist(name) {
    const newPl = { id: `pl-${Date.now()}`, title: name, tracks: [], cover: '/album1.png', creator: 'You', isAI: false };
    setPlaylists(prev => [...prev, newPl]);
    return newPl;
  }

  return (
    <LibraryContext.Provider value={{
      likedTracks, savedReleases, playlists, downloads, followedArtists,
      toggleLike, isLiked, toggleSave, isSaved, toggleFollow, isFollowing,
      addDownload, createPlaylist,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() { return useContext(LibraryContext); }
