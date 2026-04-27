import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Wand2, ArrowUpDown, ChevronUp, ChevronDown, Music2, Trash2, Lock, ArrowRight } from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { releases, playlists as mockPlaylists, savedPlaylists, djSets, artistRadios } from '../data/mockData';
import { ReleaseCard } from '../components/ui/Cards';
import './Library.css';

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
        <div>
          <div className="section-title">
            <span>Liked Releases</span>
            <Link to="/search">Browse <ArrowRight size={12}/></Link>
          </div>
          {savedReleaseObjects.length === 0 ? (
            <div className="lib-empty">
              <p>No liked releases yet.</p>
              <Link to="/search" className="lib-empty-link">Browse the catalog →</Link>
            </div>
          ) : (
            <div className="lib-grid">
              {sortByDate(savedReleaseObjects).map(r => <ReleaseCard key={r.id} release={r} />)}
            </div>
          )}
        </div>
      )}

      {/* Likes → Playlists */}
      {activeFilter === 'likes' && likesSub === 'playlists' && (
        <div className="playlist-list">
          <div className="section-title"><span>Liked Playlists</span></div>
          {savedPlaylists.map(pl => (
            <div key={pl.id} className="playlist-row glass">
              <div className="playlist-cover">
                <img src={pl.cover} alt={pl.title} />
                {pl.isAI && <div className="ai-pl-badge">AI</div>}
              </div>
              <div className="playlist-info">
                <div className="playlist-name">{pl.title}</div>
                <div className="playlist-meta">{pl.curator} · {pl.trackCount} tracks</div>
              </div>
              <button className="playlist-play-btn">
                <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Playlists */}
      {activeFilter === 'playlists' && (
        <div className="playlist-list">
          <div className="section-title"><span>My Playlists</span><button className="lib-add-btn glass-sm" onClick={() => setShowCreateModal(true)}><Plus size={14}/><span>New</span></button></div>
          {playlists.map(pl => (
            <div key={pl.id} className="playlist-row glass">
              <div className="playlist-cover">
                <img src={pl.cover} alt={pl.title} />
                {pl.isAI && <div className="ai-pl-badge">AI</div>}
              </div>
              <div className="playlist-info">
                <div className="playlist-name">{pl.title}</div>
                {pl.isAI && <div className="playlist-desc">{pl.aiReason?.slice(0, 80)}…</div>}
                <div className="playlist-meta">{pl.creator} · {pl.tracks.length} tracks</div>
              </div>
              <button className="playlist-play-btn">
                <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            </div>
          ))}

          {/* AI Builder */}
          <div className="ai-playlist-builder glass">
            <div className="ai-builder-icon"><Wand2 size={24} /></div>
            <div>
              <div className="ai-builder-title">Build an AI Playlist</div>
              <div className="ai-builder-sub">Tell KYO AI what you want — a mood, a track, an era, or a BPM range.</div>
            </div>
            <button className="ai-builder-btn">Build</button>
          </div>
        </div>
      )}

      {/* Podcasts */}
      {activeFilter === 'podcasts' && (
        <div className="playlist-list">
          <div className="section-title"><span>Podcasts &amp; DJ Sets</span><Link to="/search">Browse <ArrowRight size={12}/></Link></div>
          {djSets.length === 0 ? (
            <div className="lib-empty">
              <p>No saved podcasts yet.</p>
              <Link to="/search" className="lib-empty-link">Browse podcasts →</Link>
            </div>
          ) : djSets.map(s => (
            <div key={s.id} className="playlist-row glass">
              <div className="playlist-cover">
                <img src={s.cover} alt={s.title} />
                <div className="ai-pl-badge" style={{ background: 'rgba(0,0,0,0.7)' }}>
                  {s.type === 'podcast' ? 'POD' : 'DJ'}
                </div>
              </div>
              <div className="playlist-info">
                <div className="playlist-name">{s.title}</div>
                <div className="playlist-meta">{s.artist} · {s.duration}</div>
              </div>
              <button className="playlist-play-btn">
                <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Following */}
      {activeFilter === 'following' && (
        <>
          <div className="section-title"><span>Following</span><Link to="/search">Find Artists <ArrowRight size={12}/></Link></div>
          {followedArtists?.length > 0 ? (
            <div className="lib-grid">
              {followedArtists.map(a => (
                <div key={a.id} className="lib-artist-card glass">
                  <div className="lib-artist-name">{a.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="lib-empty">
              <p>Artists you follow will appear here.</p>
              <Link to="/search" className="lib-empty-link">Find artists →</Link>
            </div>
          )}
        </>
      )}

      {/* Downloads */}
      {activeFilter === 'downloads' && (
        <div>
          <div className="section-title"><span>Downloads</span><Link to="/shop">Shop <ArrowRight size={12}/></Link></div>
          {downloads.length === 0 ? (
            <div className="lib-empty">
              <p>No downloads yet.</p>
              <Link to="/shop" className="lib-empty-link">Browse DJ downloads →</Link>
            </div>
          ) : (
            <div className="download-list">
              {sortByDate(downloads).map(d => (
                <div key={d.id} className="download-row glass">
                  <div className="download-info">
                    <div className="download-title">{d.title}</div>
                    <div className="download-meta">{d.artistName} · Downloaded {new Date(d.downloadedAt).toLocaleDateString()}</div>
                  </div>
                  <span className="download-badge">WAV</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Uploads */}
      {activeFilter === 'uploads' && (
        <div>
          <div className="section-title">
            <span><Lock size={14} style={{marginRight:5,verticalAlign:'middle'}}/> My Uploads</span>
            <Link to="/uploads">Upload <ArrowRight size={12}/></Link>
          </div>
          {myUploads.length === 0 ? (
            <div className="lib-empty">
              <p>No uploads yet.</p>
              <Link to="/uploads" className="lib-empty-link">Upload your first track →</Link>
            </div>
          ) : (
            <>
              <div className="lib-uploads-sorts">
                {[{key:'newest',label:'Newest'},{key:'oldest',label:'Oldest'},{key:'artist',label:'Artist'},{key:'label',label:'Label'}].map(o=>(
                  <button key={o.key} className={`lib-upl-sort${uploadsSort===o.key?' active':''}`} onClick={()=>setUploadsSort(o.key)}>{o.label}</button>
                ))}
              </div>
              <div className="lib-uploads-list">
                {sortUpl(myUploads).map(t=>(
                  <div key={t.id} className="lib-upl-row glass">
                    {t.artworkUrl
                      ? <img src={t.artworkUrl} alt="" className="lib-upl-art"/>
                      : <div className="lib-upl-art lib-upl-art-ph"><Music2 size={14}/></div>
                    }
                    <div className="lib-upl-info">
                      <div className="lib-upl-title">{t.title||'Untitled'}</div>
                      <div className="lib-upl-sub">{[t.artist,t.format,t.size].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button className="lib-upl-del" onClick={()=>deleteUpload(t.id)}><Trash2 size={13}/></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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
