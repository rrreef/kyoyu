import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Music2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet, { openNativeAlbumFast } from '../components/ui/AlbumSheet';

export default function AllReleases() {
  const navigate = useNavigate();
  const [publicReleases, setPublicReleases] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  useEffect(() => {
    fetchPublicTracks().then(setPublicReleases).catch(() => {});
  }, []);

  // Group into albums
  const publicAlbums = useMemo(() => {
    const map = new Map();
    publicReleases.forEach(t => {
      const hasAlbum = t.album && t.album.trim() && t.album.trim() !== t.title.trim();
      const key = hasAlbum ? `album::${t.album.trim()}::${t.artist.trim()}` : `single::${t.id}`;
      if (!map.has(key)) {
        map.set(key, {
          id:     key,
          title:  hasAlbum ? t.album.trim() : t.title,
          artist: t.artist,
          cover:  t.cover || t.artworkUrl,
          label:  t.label,
          genre:  t.genre,
          year:   t.year || new Date().getFullYear(),
          labelId: t.labelId || t.artistId,
          artistId: t.artistId,
          tracks: [],
        });
      }
      const entry = map.get(key);
      entry.tracks.push(t);
      // Prefer a track with a cover for the album art
      if (!entry.cover && (t.cover || t.artworkUrl)) entry.cover = (t.cover || t.artworkUrl);
    });
    // Sort tracks within each album by track number from storage_key
    const extractNum = (t) => {
      const sk = t.storageKey || t.downloadUrl || '';
      const m = sk.match(/[-_](\d{1,3})[-_]/);
      return m ? parseInt(m[1], 10) : 9999;
    };
    for (const entry of map.values()) {
      if (entry.tracks.length > 1) {
        entry.tracks.sort((a, b) => extractNum(a) - extractNum(b));
      }
    }
    return Array.from(map.values());
  }, [publicReleases]);

  const handleOpenAlbum = (album) => {
    setSelectedAlbum(openNativeAlbumFast(album));
  };

  return (
    <div className="page animate-in">
      <div className="settings-header">
        <button className="settings-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="settings-title">All Releases</div>
        <div style={{ width: 44 }} />
      </div>

      <div className="main-content" style={{ padding: '0 20px', paddingTop: '100px' }}>
        {publicAlbums.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', textAlign: 'center', marginTop: 40 }}>
            No public releases yet.
          </p>
        ) : (
          <div className="upl-grid upl-grid-3">
            {publicAlbums.map(album => (
              <button
                key={album.id}
                className="upl-grid-cell"
                style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => handleOpenAlbum(album)}
              >
                <div className="upl-grid-art">
                  {album.cover
                    ? <img src={album.cover} alt={album.title} loading="lazy" decoding="async"/>
                    : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                </div>
                <div className="upl-grid-title">{album.title}</div>
                <div className="upl-grid-artist">{album.artist}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}
    </div>
  );
}
