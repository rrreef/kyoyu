import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowRight, Lock, Music2 } from 'lucide-react';
import { berghainEvents } from '../data/berghainEvents';
import { BerghainEventCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useHomeLayoutLive } from '../contexts/DisplayContext';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet, { openNativeAlbumFast } from '../components/ui/AlbumSheet';
import EventSheet from '../components/ui/EventSheet';
import './Home.css';

/**
 * Groups an array of flat tracks into album objects.
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
    if (!entry.cover && t.cover) entry.cover = t.cover;
  });
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

export default function Home() {
  const { playRelease } = usePlayer();
  const { user } = useAuth();
  const { getLikedUploads } = useLibrary();
  const homeLayout = useHomeLayoutLive();
  const [myUploads,      setMyUploads]      = useState([]);
  const [publicReleases, setPublicReleases] = useState([]);
  const [selectedAlbum,  setSelectedAlbum]  = useState(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(null);

  // Group flat tracks into albums
  const publicAlbums = useMemo(() => groupByAlbum(publicReleases), [publicReleases]);

  // Featured = albums with cover art (will be admin-curated via is_featured flag later)
  const featuredAlbums = useMemo(() => publicAlbums.filter(a => a.cover), [publicAlbums]);

  // Featured carousel state
  const featuredRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);

  // Track active slide on scroll
  const handleFeaturedScroll = useCallback(() => {
    const el = featuredRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveSlide(idx);
  }, []);

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

  const [playHistory, setPlayHistory] = useState([]);
  
  useEffect(() => {
    function loadHistory() {
      try {
        const h = JSON.parse(localStorage.getItem('kyoyu-play-history') || '[]');
        setPlayHistory(h);
      } catch (err) {}
    }
    loadHistory();
    window.addEventListener('kyoyu-play-history-changed', loadHistory);
    return () => window.removeEventListener('kyoyu-play-history-changed', loadHistory);
  }, []);

  // Shelf filter state
  const [shelfFilter, setShelfFilter]   = useState('all');
  const [followingOnly, setFollowing]   = useState(false);
  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcasts';

  // Decide which sections to render per filter
  const f = shelfFilter;
  const showFeatured    = f === 'all' || f === 'music';
  const showReleases    = f === 'all' || f === 'music';
  const showEvents      = f === 'all' || f === 'events';

  return (
    <div className="page home-page animate-in">

      {/* ── Filter bar ── */}
      <section className="home-section mymusic-section">
        <div className="shelf-filter-bar">
          <div className="shelf-filters">
            {[
              { key: 'all',     label: 'All'      },
              { key: 'music',   label: 'Music'    },
              { key: 'podcasts', label: 'Podcasts' },
              { key: 'merch',   label: 'Merch'    },
              { key: 'events',  label: 'Events'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                data-home-filter={key}
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

      {/* ═══ 1 — FEATURED CONTENT CAROUSEL ═══ */}
      {showFeatured && featuredAlbums.length > 0 && (
        <section className="home-section featured-hero-section">
          <div className="section-title">
            <span>Featured</span>
            <Link to="/all-releases">See All <ArrowRight size={12} /></Link>
          </div>

          <div
            className="featured-hero-row"
            ref={featuredRef}
            onScroll={handleFeaturedScroll}
          >
            {featuredAlbums.map((album, idx) => (
              <button
                key={album.id}
                className="featured-hero-card"
                onClick={() => {
                  if (album.id.startsWith('single::') && album.tracks?.length === 1) {
                    playTrack(album.tracks[0]);
                  } else {
                    playRelease(album);
                    setSelectedAlbum(openNativeAlbumFast(album));
                  }
                }}
              >
                {/* Blurred background from cover art */}
                {album.cover && (
                  <div
                    className="featured-hero-bg"
                    style={{ backgroundImage: `url(${album.cover})` }}
                  />
                )}

                {/* Cover art */}
                <div className="featured-hero-art">
                  {album.cover
                    ? <img src={album.cover} alt={album.title} loading="lazy" decoding="async" />
                    : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                </div>

                {/* Info overlay */}
                <div className="featured-hero-info">
                  <div className="featured-hero-title">{album.title}</div>
                  <div className="featured-hero-artist">{album.artist}</div>
                  {album.label && <div className="featured-hero-label">{album.label}</div>}
                  {album.tracks && (
                    <div className="featured-hero-meta">
                      {album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'}
                      {album.year ? ` · ${album.year}` : ''}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Dot indicators */}
          {featuredAlbums.length > 1 && (
            <div className="featured-dots">
              {featuredAlbums.map((_, i) => (
                <div
                  key={i}
                  className={`featured-dot${i === activeSlide ? ' active' : ''}`}
                  onClick={() => {
                    const el = featuredRef.current;
                    if (!el || !el.firstChild) return;
                    const cardW = el.firstChild.offsetWidth + 14;
                    el.scrollTo({ left: i * cardW, behavior: 'smooth' });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══ 1.5 — HISTORY ═══ */}
      {showFeatured && playHistory.length > 0 && (
        <section className="home-section">
          <div className="section-title">
            <span>History</span>
          </div>
          <div className="scroll-row">
            {playHistory.map(item => (
              <button 
                key={item.id} 
                className="shelf-card" 
                style={{ width: 110, border: 'none', background: 'none', textAlign: 'left', padding: 0 }} 
                onClick={() => playTrack(item)}
              >
                <div className="shelf-card-art">
                  {item.cover ? (
                    <img src={item.cover} alt={item.title} loading="lazy" decoding="async" />
                  ) : (
                    <div className="featured-hero-art-ph"><Music2 size={24} strokeWidth={1.2} /></div>
                  )}
                </div>
                <div className="shelf-card-info">
                  <div className="shelf-card-title">{item.title}</div>
                  <div className="shelf-card-sub">{item.artist}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 2 — MY UPLOADS (private) ═══ */}
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

      {/* ═══ 3 — RELEASES ═══ */}
      {showReleases && (
        <section className="home-section">
          <div className="section-title">
            <span>Releases</span>
            <Link to="/all-releases">See All <ArrowRight size={12} /></Link>
          </div>
          {publicAlbums.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '16px 0' }}>No public releases yet.</p>
          ) : (
            <div className="upl-grid upl-grid-3">
              {publicAlbums.slice(0, 6).map(album => (
                <button
                  key={album.id}
                  className="upl-grid-cell"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setSelectedAlbum(openNativeAlbumFast(album))}
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

      {/* ═══ 4 — EVENTS ═══ */}
      {showEvents && (
        <section className="home-section">
          <div className="section-title">
            <span>Events</span>
          </div>
          <div className="scroll-row">
            {berghainEvents.map((e, idx) => (
              <BerghainEventCard key={e.id} event={e} onClick={() => setSelectedEventIndex(idx)} />
            ))}
          </div>
        </section>
      )}

      {selectedEventIndex !== null && (
        <EventSheet
          events={berghainEvents}
          initialIndex={selectedEventIndex}
          onClose={() => setSelectedEventIndex(null)}
        />
      )}

    </div>
  );
}
