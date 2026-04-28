import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Wand2, ChevronDown, Music2, Trash2, Lock, ArrowRight, Radio } from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { releases, playlists as mockPlaylists, savedPlaylists, djSets, artistRadios } from '../data/mockData';
import { UploadExpandedList } from '../components/uploads/UploadShelf';
import './Library.css';

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
  { key: 'podcasts',  label: 'Podcasts'  },
  { key: 'following', label: 'Following' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'uploads',   label: 'My Uploads', icon: Lock },
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
      setMyUploads(raw ? JSON.parse(raw) : []);
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

  const { savedReleases, playlists, downloads, followedArtists, createPlaylist } = useLibrary();
  const { playRelease } = usePlayer();

  const savedReleaseObjects = releases.filter(r => savedReleases.includes(r.id));

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

      {/* ── Filter bar ── */}
      <div className="lib-filter-bar">
        <div className="lib-filters">

          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`lib-filter-btn${activeFilter === key ? ' active' : ''}`}
              onClick={() => handleFilterClick(key)}
            >
              {Icon && <Icon size={11} style={{marginRight:4,verticalAlign:'middle'}}/>}{label}
            </button>
          ))}

          {/* Contextual Likes sub-filters */}
          {activeFilter === 'likes' && (
            <div className="lib-sub-filters">
              {LIKES_SUB.map(({ key, label }) => (
                <button
                  key={key}
                  className={`lib-filter-btn lib-sub-btn${likesSub === key ? ' active' : ''}`}
                  onClick={() => setLikesSub(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort toggle — far right */}
        <button className="lib-sort-btn" onClick={() => setSort(s => !s)}>
          {sortDesc ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          <span>{sortDesc ? 'Recent' : 'Oldest'}</span>
        </button>
      </div>

      {/* ── Content ── */}

      {/* Likes → Releases */}
      {activeFilter === 'likes' && likesSub === 'releases' && (
        savedReleaseObjects.length === 0
          ? <div className="lib-empty"><p>No liked releases yet.</p><Link to="/search" className="lib-empty-link">Browse the catalog →</Link></div>
          : <>
              <div className="shelf-row-label">Liked Releases</div>
              <div className="scroll-row">
                {sortByDate(savedReleaseObjects).map(r => (
                  <ShelfCard key={r.id} cover={r.cover} title={r.title} sub={r.artist}/>
                ))}
              </div>
            </>
      )}

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

      {/* Podcasts & DJ Sets */}
      {activeFilter === 'podcasts' && (
        djSets.length === 0
          ? <div className="lib-empty"><p>No saved podcasts yet.</p><Link to="/search" className="lib-empty-link">Browse podcasts →</Link></div>
          : <>
              <div className="shelf-row-label">Podcasts &amp; DJ Sets</div>
              <div className="scroll-row">
                {djSets.map(s => (
                  <ShelfCard key={s.id} cover={s.cover} title={s.title} sub={s.artist} badge={s.type==='podcast'?'POD':'DJ'}/>
                ))}
              </div>
            </>
      )}

      {/* Following */}
      {activeFilter === 'following' && (
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

      {/* Downloads */}
      {activeFilter === 'downloads' && (
        downloads.length === 0
          ? <div className="lib-empty"><p>No downloads yet.</p><Link to="/shop" className="lib-empty-link">Browse DJ downloads →</Link></div>
          : <>
              <div className="shelf-row-label">Downloads</div>
              <div className="scroll-row">
                {sortByDate(downloads).map(d => (
                  <ShelfCard key={d.id} cover={d.cover||''} title={d.title} sub={d.artistName} badge="WAV"/>
                ))}
              </div>
            </>
      )}

      {/* My Uploads */}
      {activeFilter === 'uploads' && (
        myUploads.length === 0
          ? <div className="lib-empty"><p>No uploads yet.</p><Link to="/uploads" className="lib-empty-link">Upload your first track →</Link></div>
          : <>
              <div className="shelf-row-label" style={{display:'flex',alignItems:'center',gap:5}}><Lock size={11}/> My Uploads</div>
              <UploadExpandedList uploads={myUploads}/>
            </>
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
