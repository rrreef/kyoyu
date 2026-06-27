import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { Play, Pause, ArrowRight, Zap, Radio, Lock, Music2, Heart, ListPlus } from 'lucide-react';
import { artists, vinylMarketplace, djSets, myPlaylists, likedAlbums, artistRadios, upcomingEvents } from '../data/mockData';
import { ReleaseCard, ArtistCard, VinylCard, LongFormCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useDisplay, useHomeLayoutLive } from '../contexts/DisplayContext';
import UploadShelf, { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet from '../components/ui/AlbumSheet';
import './Home.css';

/**
 * Groups an array of flat tracks into album objects.
 * Tracks sharing the same non-empty `album` field are grouped together.
 * Standalone tracks (no album or album === title) get their own entry.
 */
function groupByAlbum(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    const hasAlbum = t.album && t.album.trim() && t.album.trim() !== t.title.trim();
    const key = hasAlbum ? `album::${t.album.trim()}::${t.artist.trim()}` : `single::${t.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id:     key,
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
    // Prefer a track with a cover for the album art
    if (!entry.cover && t.cover) entry.cover = t.cover;
  });
  // Sort tracks within each album by track number from storage_key
  // e.g. "...Good_Night__Whatever_That_Is_-_03_Rousing_Rhythms.aiff" → 3
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

/* ── Compact shelf card for playlists / radios ── */
function ShelfCard({ cover, title, sub, badge, badgeIcon: BadgeIcon }) {
  return (
    <div className="shelf-card">
      <div className="shelf-card-art">
        <img src={cover} alt={title} />
        {badge && (
          <div className="shelf-card-badge">
            {BadgeIcon && <BadgeIcon size={9} />}
            <span>{badge}</span>
          </div>
        )}
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {sub && <div className="shelf-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function Home() {
  const { playRelease, playTrack } = usePlayer();
  const { user } = useAuth();
  const { getLikedUploads } = useLibrary();
  const homeLayout = useHomeLayoutLive();
  const [myUploads,      setMyUploads]      = useState([]);
  const [publicReleases, setPublicReleases] = useState([]);
  const [selectedAlbum,  setSelectedAlbum]  = useState(null);

  // Group flat tracks into albums
  const publicAlbums = useMemo(() => groupByAlbum(publicReleases), [publicReleases]);

  // Featured hero = first album that has a cover
  const featured = publicAlbums.find(a => a.cover) || publicAlbums[0] || null;

  // Load real public releases from backend
  useEffect(() => {
    fetchPublicTracks().then(setPublicReleases).catch(() => {});
  }, []);

  useEffect(() => {
    function loadUploads() {
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
    }
    loadUploads();
    window.addEventListener('kyoyu-uploads-changed', loadUploads);
    return () => window.removeEventListener('kyoyu-uploads-changed', loadUploads);
  }, [user?.id]);

  // Shelf filter state
  const [shelfFilter, setShelfFilter]   = useState('all');
  const [followingOnly, setFollowing]   = useState(false);

  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcast';

  // Decide which sections to render per filter
  const f = shelfFilter;
  const showFeatured    = f === 'all' || f === 'music';
  const showPlaylists   = f === 'all' || f === 'music';
  const showReleases    = f === 'all' || f === 'music';
  const showArtists     = f === 'all' || f === 'music';
  const showPodcasts    = f === 'all' || f === 'music' || f === 'podcast';
  const showRadios      = f === 'all' || f === 'music';
  const showEvents      = f === 'all' || f === 'events';
  const showMerch       = f === 'all' || f === 'merch';

  return (
    <div className="page home-page animate-in">

      {/* ── Filter bar ── */}
      <section className="home-section mymusic-section">
        <div className="shelf-filter-bar">
          <div className="shelf-filters">
            {[
              { key: 'all',     label: 'All'      },
              { key: 'music',   label: 'Music'    },
              { key: 'podcast', label: 'Podcasts' },
              { key: 'merch',   label: 'Merch'    },
              { key: 'events',  label: 'Events'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`shelf-filter-btn${shelfFilter === key ? ' active' : ''}`}
                onClick={() => { setShelfFilter(key); setFollowing(false); }}
              >
                {label}
              </button>
            ))}
          </div>
          {showFollowingToggle && (
            <button
              className={`shelf-following-btn${followingOnly ? ' active' : ''}`}
              onClick={() => setFollowing(f => !f)}
            >
              Following
            </button>
          )}
        </div>
      </section>

      {/* 1 — Featured Release */}
      {showFeatured && featured && (
      <section className="hero-section">
        <div className="hero-cover-bg" style={{ backgroundImage: `url(${featured.cover})` }} />
        <div className="hero-info">
          <div className="hero-badge"><Zap size={12} /><span>Featured Release</span></div>
          <div className="hero-label">
            <Link to={`/label/${featured.labelId}`}>{featured.label}</Link>
            <span>·</span>
            <span>{featured.year}</span>
          </div>
          <h1 className="hero-title">{featured.title}</h1>
          <div className="hero-artist">
            <Link to={`/artist/${featured.artistId}`}>{featured.artist}</Link>
          </div>
          <p className="hero-desc">{featured.description}</p>
          <div className="hero-actions">
            <button className="hero-play-glass" onClick={() => playRelease(featured)}>
              <Play size={24} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />
            </button>
            <div className="hero-actions-right">
              <button className="hero-play-glass" title="Like">
                <Heart size={24} fill="currentColor" strokeWidth={0} />
              </button>
              <button className="hero-play-glass" title="Add to Playlist">
                <ListPlus size={26} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>
        <div className="hero-cover-art">
          <img src={featured.cover} alt={featured.title} />
        </div>
      </section>
      )}

      {/* 2 — Playlists */}
      {showPlaylists && (
        <section className="home-section">
          <div className="shelf-row-label">Playlists</div>
          <div className="scroll-row">
            {myPlaylists.map(pl => (
              <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={`${pl.trackCount} tracks`} />
            ))}
          </div>
        </section>
      )}

      {/* My Uploads (private) */}
      {showReleases && myUploads.length > 0 && (
        <section className="home-section">
          <div className="section-title">
            <span><Lock size={14} style={{marginRight:5,verticalAlign:'middle'}}/> My Uploads</span>
            <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.3)'}}>{myUploads.length} tracks</span>
          </div>
          {homeLayout.mode === 'list'
            ? <UploadExpandedList uploads={myUploads}/>
            : <UploadGridView uploads={myUploads} cols={homeLayout.cols}/>
          }
        </section>
      )}

      {/* 3 — Releases */}
      {showReleases && (
        <section className="home-section">
          <div className="section-title">
            <span>Releases</span>
            <Link to="/search">See All <ArrowRight size={12} /></Link>
          </div>
          {publicAlbums.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '16px 0' }}>No public releases yet.</p>
          ) : (
            <div className="upl-grid upl-grid-3">
              {publicAlbums.map(album => (
                <button
                  key={album.id}
                  className="upl-grid-cell"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setSelectedAlbum(album)}
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
        </section>
      )}

      {/* Album detail sheet */}
      {selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}

      {/* 4 — Featured Artists */}
      {showArtists && (
        <section className="home-section">
          <div className="section-title">
            <span>Featured Artists</span>
            <Link to="/search">All Artists</Link>
          </div>
          <div className="scroll-row">
            {artists.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
        </section>
      )}

      {/* 5 — Podcasts */}
      {showPodcasts && (
        <section className="home-section">
          <div className="section-title">
            <span>Podcasts</span>
            <Link to="/search">See More</Link>
          </div>
          <div className="scroll-row">
            {djSets.map(s => <LongFormCard key={s.id} item={s} />)}
          </div>
        </section>
      )}

      {/* 6 — Radio */}
      {showRadios && (
        <section className="home-section">
          <div className="shelf-row-label">Radio</div>
          <div className="scroll-row">
            {artistRadios.map(r => (
              <ShelfCard key={r.id} cover={r.cover} title={r.name} sub={r.artist} badge="Radio" badgeIcon={Radio} />
            ))}
          </div>
        </section>
      )}

      {/* 7 — Events */}
      {showEvents && (
        <section className="home-section">
          <div className="shelf-row-label">Events</div>
          <div className="scroll-row">
            {upcomingEvents.map(e => (
              <ShelfCard key={e.id} cover={e.cover} title={e.title} sub={`${e.date} · ${e.venue}`} badge={e.date} />
            ))}
          </div>
        </section>
      )}

      {/* 8 — Vinyl / Merch */}
      {showMerch && (
        <section className="home-section">
          <div className="section-title">
            <span>Vinyl</span>
            <Link to="/marketplace">Marketplace</Link>
          </div>
          <div className="scroll-row">
            {vinylMarketplace.map(v => <VinylCard key={v.id} listing={v} />)}
          </div>
        </section>
      )}

    </div>
  );
}

