import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowRight, Lock, Music2 } from 'lucide-react';
import { berghainEvents } from '../data/berghainEvents';
import { BerghainEventCard } from '../components/ui/Cards';
import { usePlayer, historyReplayInfo } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useHomeLayoutLive } from '../contexts/DisplayContext';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import AccountItemList, { sanitizeArtworkUrl } from '../components/AccountItems';
import { useConnectedLibrary } from '../lib/useConnectedLibrary';
import { fetchAccountLibrary } from '../lib/streaming';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet, { openNativeAlbumFast, registerAlbumPlayback } from '../components/ui/AlbumSheet';
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
  const { playRelease, playTrack, playFromHistory } = usePlayer();
  const { user } = useAuth();
  const { getLikedUploads, playlists } = useLibrary();
  const acct = useConnectedLibrary();
  const homeLayout = useHomeLayoutLive();
  const [myUploads,      setMyUploads]      = useState([]);
  const [publicReleases, setPublicReleases] = useState([]);
  const [selectedAlbum,  setSelectedAlbum]  = useState(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(null);

  async function openPlaylistSheet(pl) {
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    const initialTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const creator = pl.artistName || pl.creator || user?.displayName || 'You';
    let cover = pl.artworkUrl || pl.cover || null;
    if (cover && cover.includes('bcbits.com')) {
      cover = cover.replace(/_[0-9]+\.jpg/, '_10.jpg');
    }

    const pushToSheet = (currentTracks) => {
      const albumObj = {
        ...pl,
        artist: creator,
        cover,
        tracks: currentTracks,
        _ts: ts,
      };
      setSelectedAlbum(albumObj);
      registerAlbumPlayback(albumObj);
      const mappedTracks = currentTracks.map(t => ({
        id: t.id || String(Date.now() + Math.random()),
        title: t.title || t.name || 'Unknown Track',
        artist: t.artist || t.artistName || '',
        url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
        cover: t.artworkUrl || t.cover || null,
        provider: t.provider || pl.provider || null,
      }));
      try {
        if (pl.kind === 'album') {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            nativeAlbum: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title,
              artist: creator,
              cover,
              genre: pl.genre || null,
              year: pl.year ? String(pl.year) : null,
              label: pl.label || null,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        } else {
          window.webkit?.messageHandlers?.player?.postMessage({
            playlistOpen: true,
            nativePlaylist: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title,
              cover,
              creator,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        }
      } catch(e) {}
    };

    pushToSheet(initialTracks);

    if (!initialTracks.length && (pl.playlistId || pl.url)) {
      try {
        const fetched = await fetchAccountLibrary(
          pl.provider || 'bandcamp',
          'playlistTracks',
          { playlistId: pl.playlistId, playlistUrl: pl.url }
        );
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          pushToSheet(fetched);
        } else {
          pushToSheet([]);
        }
      } catch (err) {
        pushToSheet([]);
      }
    }
  }

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

      {/* ═══ 1.2 — LIBRARY PER PROVIDER: LIKES / COLLECTION & PLAYLISTS (LAST 9) ═══ */}
      {showFeatured && (() => {
        const likedUploads = getLikedUploads(user?.id) || [];
        const ytLocalLikes = likedUploads.filter(t => {
          const p = historyReplayInfo(t).provider || t.provider || '';
          return p === 'youtube' || String(t.id || '').startsWith('yt-');
        }).slice(0, 9);
        const ytAcctLikes = (acct.youtube?.likes || []).slice(0, 9);

        const likeSections = [
          { key: 'bandcamp',   title: 'Bandcamp · Collection', items: (acct.bandcamp?.collection || []).slice(0, 9), type: 'acct' },
          { key: 'soundcloud', title: 'SoundCloud · Likes',    items: (acct.soundcloud?.likes || []).slice(0, 9),    type: 'acct' },
          { key: 'youtube',    title: 'YouTube · Likes',       items: ytAcctLikes.length > 0 ? ytAcctLikes : ytLocalLikes, type: ytAcctLikes.length > 0 ? 'acct' : 'uploads' },
          { key: 'spotify',    title: 'Spotify · Likes',       items: (acct.spotify?.likes || []).slice(0, 9),       type: 'acct' },
          { key: 'applemusic', title: 'Apple Music · Likes',   items: (acct.applemusic?.likes || []).slice(0, 9),    type: 'acct' },
          { key: 'tidal',      title: 'TIDAL · Likes',         items: (acct.tidal?.likes || []).slice(0, 9),         type: 'acct' },
        ].filter(s => s.items.length > 0);

        const ytPlaylists = ((acct.youtube?.playlists || []).concat(
          (playlists || []).filter(p => p.provider === 'youtube')
        )).slice(0, 9);

        const playlistSections = [
          { key: 'bandcamp-pl',   title: 'Bandcamp · Playlists',    items: (acct.bandcamp?.playlists || []).slice(0, 9) },
          { key: 'soundcloud-pl', title: 'SoundCloud · Playlists',  items: (acct.soundcloud?.playlists || []).slice(0, 9) },
          { key: 'youtube-pl',    title: 'YouTube · Playlists',     items: ytPlaylists },
          { key: 'spotify-pl',    title: 'Spotify · Playlists',     items: (acct.spotify?.playlists || []).slice(0, 9) },
          { key: 'applemusic-pl', title: 'Apple Music · Playlists', items: (acct.applemusic?.playlists || []).slice(0, 9) },
          { key: 'tidal-pl',      title: 'TIDAL · Playlists',       items: (acct.tidal?.playlists || []).slice(0, 9) },
        ].filter(s => s.items.length > 0);

        if (likeSections.length === 0 && playlistSections.length === 0) return null;

        const viewMode = homeLayout.mode === 'list' ? 'list' : 'grid';

        return (
          <>
            {likeSections.map(sec => (
              <section key={sec.key} className="home-section">
                <div className="section-title">
                  <span>{sec.title}</span>
                  <Link to="/library">See All <ArrowRight size={12} /></Link>
                </div>
                {sec.type === 'uploads' ? (
                  viewMode === 'list'
                    ? <UploadExpandedList uploads={sec.items} />
                    : <UploadGridView uploads={sec.items} cols={3} />
                ) : (
                  <AccountItemList items={sec.items} view={viewMode} cols={3} onOpenPlaylist={openPlaylistSheet} />
                )}
              </section>
            ))}

            {playlistSections.map(sec => (
              <section key={sec.key} className="home-section">
                <div className="section-title">
                  <span>{sec.title}</span>
                  <Link to="/library">See All <ArrowRight size={12} /></Link>
                </div>
                <AccountItemList items={sec.items} view={viewMode} cols={3} onOpenPlaylist={openPlaylistSheet} />
              </section>
            ))}
          </>
        );
      })()}

      {/* ═══ 1.5 — HISTORY ═══ */}
      {showFeatured && playHistory.length > 0 && (
        <section className="home-section">
          <div className="section-title">
            <span>History</span>
          </div>
          <div className="scroll-row">
            {playHistory.map(item => {
              const cleanCover = sanitizeArtworkUrl(item.cover || item.artworkUrl, item.id);
              return (
                <button 
                  key={item._hkey || item.id} 
                  className="shelf-card" 
                  style={{ width: 110, border: 'none', background: 'none', textAlign: 'left', padding: 0 }} 
                  onClick={() => playFromHistory(item)}
                >
                  <div className="shelf-card-art">
                    {cleanCover ? (
                      <img src={cleanCover} alt={item.title} loading="lazy" decoding="async" />
                    ) : (
                      <div className="featured-hero-art-ph"><Music2 size={24} strokeWidth={1.2} /></div>
                    )}
                  </div>
                  <div className="shelf-card-info">
                    <div className="shelf-card-title">{item.title}</div>
                    <div className="shelf-card-sub">{item.artist}</div>
                  </div>
                </button>
              );
            })}
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
