const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/AlbumSheet.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add playlists and save state to useLibrary destructuring
content = content.replace(
    /toggleLikeUpload, isLikedUpload, toggleDownload, isDownloaded,/,
    `toggleLikeUpload, isLikedUpload, toggleDownload, isDownloaded,
    toggleSave, isSaved, playlists,`
);

// Update JS Bridge
content = content.replace(
    /window\.__kyoyuIsLikedTrack = \(id\) => isLiked\(id\);/,
    `window.__kyoyuIsLikedTrack = (id) => isLiked(id);
    window.__kyoyuIsTrackInAnyPlaylist = (id) => {
        return playlistsRef.current.some(pl => pl.tracks && pl.tracks.some(t => String(t.id) === String(id)));
    };
    window.__kyoyuIsSavedAlbum = (id) => isSaved(id);
    window.__kyoyuToggleSaveAlbum = (id) => {
        toggleSave(id, safeAlbumRef.current);
    };`
);

// Add playlistsRef and safeAlbumRef
content = content.replace(
    /const playTrackRef = useRef\(playTrack\);/,
    `const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const safeAlbumRef = useRef(safeAlbum);
  safeAlbumRef.current = safeAlbum;
  const playTrackRef = useRef(playTrack);`
);

// Modify __kyoyuAddToPlaylist to support comma-separated IDs (for full album add)
content = content.replace(
    /window\.__kyoyuAddToPlaylist = \(playlistId, trackId\) => \{[\s\S]*?addToPlaylistRef\.current\(playlistId, trackObj\);\s*\};/m,
    `window.__kyoyuAddToPlaylist = (playlistId, trackId) => {
      if (!safeAlbumRef.current || !safeAlbumRef.current.tracks) return;
      const ids = String(trackId).split(',');
      for (const id of ids) {
        let trackObj = safeAlbumRef.current.tracks.find(t => String(t.id) === String(id));
        if (!trackObj && safeLabelRef.current) {
           safeLabelRef.current.releases?.forEach(r => {
             const t = r.tracks?.find(tr => String(tr.id) === String(id));
             if (t) trackObj = t;
           });
        }
        if (!trackObj && safeArtistRef.current) {
           safeArtistRef.current.releases?.forEach(r => {
             const t = r.tracks?.find(tr => String(tr.id) === String(id));
             if (t) trackObj = t;
           });
           safeArtistRef.current.popular_tracks?.forEach(t => {
             if (String(t.id) === String(id)) trackObj = t;
           });
        }
        if (trackObj) {
          addToPlaylistRef.current(playlistId, trackObj);
        }
      }
    };`
);

fs.writeFileSync(file, content);
console.log('Patched AlbumSheet.jsx');
