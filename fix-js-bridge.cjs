const fs = require('fs');
let file, content;

// App.jsx
file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/App.jsx';
content = fs.readFileSync(file, 'utf8');
content = content.replace(
    /window\.__kyoyuGetPlaylists = \(\) => \{\s*return JSON\.stringify\(getRef\.current\(\)\);\s*\};/m,
    `window.__kyoyuGetPlaylists = (trackId) => {
      const pls = getRef.current().map(pl => ({
        id: pl.id,
        name: pl.name || pl.title,
        trackCount: pl.trackCount,
        containsTrack: trackId ? !!(pl.tracks && pl.tracks.find(t => String(t.id) === String(trackId))) : false
      }));
      return JSON.stringify(pls);
    };`
);
fs.writeFileSync(file, content);

// AlbumSheet.jsx
file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/AlbumSheet.jsx';
content = fs.readFileSync(file, 'utf8');
content = content.replace(
    /window\.__kyoyuGetPlaylists = \(\) => \{\s*return JSON\.stringify\(getPlaylistsRef\.current\(\)\);\s*\};/m,
    `window.__kyoyuGetPlaylists = (trackId) => {
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
    };`
);
fs.writeFileSync(file, content);
console.log('Fixed JS Bridge');
