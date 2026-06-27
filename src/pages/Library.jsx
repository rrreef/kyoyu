import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Wand2, ChevronDown, ChevronUp, Music2, Trash2, Lock, ArrowRight, Radio } from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useDisplay, useLibraryLayoutLive } from '../contexts/DisplayContext';
import { releases, playlists as mockPlaylists, savedPlaylists, djSets, artistRadios } from '../data/mockData';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import AlbumSheet from '../components/ui/AlbumSheet';
import './Library.css';

function groupByAlbum(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    const hasAlbum = t.album && t.album.trim() && t.album.trim() !== t.title.trim();
    const key = hasAlbum ? `album::${t.album.trim()}::${t.artist.trim()}` : `single::${t.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title:  hasAlbum ? t.album.trim() : t.title,
        artist: t.artist,
        cover:  t.cover,
        label:  t.label,
        genre:  t.genre,
        year:   t.year,
        tracks: [],
      });
    }
    const entry = map.get(key);
    entry.tracks.push(t);
    if (!entry.cover && t.cover) entry.cover = t.cover;
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
}


/* ── Shelf card — identical to Home ───────────────────────── */
function ShelfCard({ cover, title, sub, badge, badgeIcon: BadgeIcon, fallback }) {
  return (
    <div className="shelf-card">
      <div className="shelf-card-art">
        {cover
          ? <img src={cover} alt={title}/>
          : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.06)'}}>{fallback||<Music2 size={22} color="rgba(255,255,255,.3)"/>}</div>
        }
        {badge&&<div className="shelf-card-badge">{BadgeIcon&&<BadgeIcon size={9}/>}<span>{badge}</span></div>}
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {sub&&<div className="shelf-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

// Main filter keys
const FILTERS = [
  { key: 'likes',     label: 'Likes'     },
  { key: 'playlists', label: 'Playlists' },
  { key: 'follows',   label: 'Follows'   },
  { key: 'shared',    label: 'Shared'    },
  { key: 'uploads',   label: 'Uploads'   },
];

// Sub-filters that appear when Likes is active
const LIKES_SUB = [
  { key: 'releases',  label: 'Releases'  },
  { key: 'playlists', label: 'Playlists' },
];

export default function Library() {
  const [activeFilter, setFilter]    = useState('likes');
  const [likesSub,     setLikesSub]  = useState('releases');
  const [sortDesc,     setSort]      = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [myUploads,    setMyUploads]  = useState([]);
  const [uploadsSort,  setUploadsSort]= useState('newest');
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const hydrated = parsed.map(t => ({
          ...t,
          artworkUrl: localStorage.getItem(`kyoyu-art-${user.id}-${t.id}`) || t.artworkUrl || null,
        }));
        setMyUploads(hydrated);
      } else {
        setMyUploads([]);
      }
    } catch {}
  }, [user?.id, activeFilter]);

  function sortUpl(arr) {
    const c = [...arr];
    if(uploadsSort==='oldest') return c.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));
    if(uploadsSort==='artist') return c.sort((a,b)=>(a.artist||'').localeCompare(b.artist||''));
    if(uploadsSort==='label')  return c.sort((a,b)=>(a.label||'').localeCompare(b.label||''));
    return c.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  }
  function deleteUpload(id) {
    const next = myUploads.filter(t=>t.id!==id);
    setMyUploads(next);
    if(user?.id) localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next));
  }

  const { savedReleases, playlists, downloads, followedArtists, createPlaylist, getLikedUploads } = useLibrary();
  const { playRelease } = usePlayer();
  const libraryLayout = useLibraryLayoutLive();
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  const savedReleaseObjects = releases.filter(r => savedReleases.includes(r.id));
  // Group saved releases into albums for the grid view
  const savedAlbums = useMemo(() => {
    // Convert mockData releases to the flat-track format groupByAlbum expects
    const flat = savedReleaseObjects.map(r => ({
      id:     r.id,
      title:  r.title,
      artist: r.artist,
      album:  r.title, // mock releases have no separate album field → treat as album
      cover:  r.cover,
      label:  r.label  || '',
      genre:  r.genre  || '',
      year:   r.year   || '',
      audioUrl: null,
      tracks: r.tracks || [],
    }));
    // Wrap each as its own album (mock data is already album-level)
    return savedReleaseObjects.map(r => ({
      id:     r.id,
      title:  r.title,
      artist: r.artist,
      cover:  r.cover,
      label:  r.label  || '',
      genre:  r.genre  || '',
      year:   r.year   || '',
      tracks: (r.tracks || []).map(t => ({
        ...t,
        artist:   r.artist,
        cover:    r.cover,
        audioUrl: t.src || t.fileUrl || null,
      })),
    }));
  }, [savedReleaseObjects]);

  // Sort helper — operates on arrays with a date-like field
  const sortByDate = arr => sortDesc ? [...arr].reverse() : [...arr];

  function handleCreate() {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setShowCreateModal(false);
  }

  function handleFilterClick(key) {
    setFilter(key);
    if (key !== 'likes') setLikesSub('releases'); // reset sub when leaving Likes
  }

  return (
    <div className="page library-page animate-in">

      {/* Header */}
      <div className="library-header">
        <button className="lib-add-btn glass-sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Hidden filter buttons — targeted by native LibraryFilterBar */}
      <div style={{ display: 'none' }}>
        {FILTERS.map(({ key }) => (
          <button key={key} data-library-filter={key} onClick={() => handleFilterClick(key)} />
        ))}
      </div>

      {/* ── Content ── */}

      {/* Likes → Releases */}
      {activeFilter === 'likes' && likesSub === 'releases' && (() => {
        const likedTracks = getLikedUploads(user?.id);
        const hasReleases = savedReleaseObjects.length > 0;
        const hasTracks   = likedTracks.length > 0;
        if (!hasReleases && !hasTracks)
          return <div className="lib-empty"><p>No liked titles yet.</p><Link to="/search" className="lib-empty-link">Browse the catalog →</Link></div>;
        return (
          <>
            {hasTracks && (
              <>
                <div className="shelf-row-label">Liked Tracks</div>
                {libraryLayout.mode === 'list'
                  ? <UploadExpandedList uploads={likedTracks}/>
                  : <UploadGridView uploads={likedTracks} cols={libraryLayout.cols}/>
                }
              </>
            )}
            {hasReleases && (
              <>
                <div className="shelf-row-label" style={{marginTop: hasTracks ? 16 : 0}}>Liked Releases</div>
                <div className="upl-grid upl-grid-3">
                  {sortByDate(savedAlbums).map(album => (
                    <button
                      key={album.id}
                      className="upl-grid-cell"
                      style={{ background:'none', border:'none', textAlign:'left', cursor:'pointer' }}
                      onClick={() => setSelectedAlbum(album)}
                    >
                      <div className="upl-grid-art">
                        {album.cover
                          ? <img src={album.cover} alt={album.title} loading="lazy"/>
                          : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                      </div>
                      <div className="upl-grid-title">{album.title}</div>
                      <div className="upl-grid-artist">{album.artist}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* Likes → Playlists */}
      {activeFilter === 'likes' && likesSub === 'playlists' && (
        savedPlaylists.length === 0
          ? <div className="lib-empty"><p>No liked playlists yet.</p></div>
          : <>
              <div className="shelf-row-label">Liked Playlists</div>
              <div className="scroll-row">
                {savedPlaylists.map(pl => (
                  <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={pl.curator} badge={pl.isAI?'AI':null}/>
                ))}
              </div>
            </>
      )}

      {/* My Playlists */}
      {activeFilter === 'playlists' && (
        <>
          <div className="shelf-row-label">My Playlists</div>
          {playlists.length === 0
            ? <div className="lib-empty"><p>No playlists yet.</p></div>
            : <div className="scroll-row">
                {playlists.map(pl => (
                  <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={`${pl.tracks?.length||0} tracks`} badge={pl.isAI?'AI':null}/>
                ))}
              </div>
          }
          {/* AI Builder */}
          <div className="ai-playlist-builder glass" style={{margin:'16px 16px 0'}}>
            <div className="ai-builder-icon"><Wand2 size={24}/></div>
            <div>
              <div className="ai-builder-title">Build an AI Playlist</div>
              <div className="ai-builder-sub">Tell KYO AI what you want — a mood, a track, an era, or a BPM range.</div>
            </div>
            <button className="ai-builder-btn">Build</button>
          </div>
        </>
      )}

      {/* Follows */}
      {activeFilter === 'follows' && (
        followedArtists?.length > 0
          ? <>
              <div className="shelf-row-label">Artists</div>
              <div className="scroll-row">
                {followedArtists.map(a => (
                  <ShelfCard key={a.id} cover={a.avatar||a.cover||''} title={a.name} sub={a.genre||''}/>
                ))}
              </div>
            </>
          : <div className="lib-empty"><p>Artists you follow will appear here.</p><Link to="/search" className="lib-empty-link">Find artists →</Link></div>
      )}

      {/* Shared */}
      {activeFilter === 'shared' && (
        <div className="lib-empty"><p>No shared items yet.</p><p style={{fontSize:'0.8rem',color:'var(--text-dim)'}}>Music shared with you will appear here.</p></div>
      )}

      {/* My Uploads */}
      {activeFilter === 'uploads' && (
        myUploads.length === 0
          ? <div className="lib-empty"><p>No uploads yet.</p><Link to="/uploads" className="lib-empty-link">Upload your first track →</Link></div>
          : <>
              <div className="shelf-row-label" style={{display:'flex',alignItems:'center',gap:5}}><Lock size={11}/> My Uploads</div>
              {libraryLayout.mode === 'list'
                ? <UploadExpandedList uploads={myUploads}/>
                : <UploadGridView uploads={myUploads} cols={libraryLayout.cols}/>
              }
            </>
      )}

      {/* Album sheet */}
      {selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box glass" onClick={e => e.stopPropagation()}>
            <h3>New Playlist</h3>
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
