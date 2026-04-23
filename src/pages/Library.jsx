import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Wand2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
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
];

// Sub-filters that appear when Likes is active
const LIKES_SUB = [
  { key: 'releases',  label: 'Releases'  },
  { key: 'playlists', label: 'Playlists' },
];

export default function Library() {
  const [activeFilter, setFilter]    = useState('likes');
  const [likesSub,     setLikesSub]  = useState('releases');   // releases | playlists
  const [sortDesc,     setSort]      = useState(true);          // true = recent first
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

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

          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`lib-filter-btn${activeFilter === key ? ' active' : ''}`}
              onClick={() => handleFilterClick(key)}
            >
              {label}
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
        followedArtists?.length > 0 ? (
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
        )
      )}

      {/* Downloads */}
      {activeFilter === 'downloads' && (
        <div>
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
