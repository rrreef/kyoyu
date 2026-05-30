import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Play, Pause, ArrowRight, TrendingUp, Zap, Radio, Lock, Music2 } from 'lucide-react';
import { artists, vinylMarketplace, djSets, myPlaylists, likedAlbums, artistRadios, upcomingEvents } from '../data/mockData';
import { ReleaseCard, ArtistCard, VinylCard, LongFormCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useDisplay, useHomeLayoutLive } from '../contexts/DisplayContext';
import UploadShelf, { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import './Home.css';

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
  const [myUploads, setMyUploads] = useState([]);
  const [publicReleases, setPublicReleases] = useState([]);

  // The featured hero is just the newest public release
  const featured = publicReleases[0] || null;

  // Load real public releases from backend (visible to all listeners)
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
  const [shelfFilter, setShelfFilter]   = useState('all');       // all | music | podcast | suggestions
  const [followingOnly, setFollowing]   = useState(false);        // sub-filter

  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcast' || shelfFilter === 'radios';

  // Decide which rows to render
  const showPlaylists   = shelfFilter === 'all' || shelfFilter === 'music';
  const showLiked       = shelfFilter === 'all' || shelfFilter === 'music';
  const showPodcasts    = shelfFilter === 'all' || shelfFilter === 'podcast';
  const showRadios      = shelfFilter === 'all' || shelfFilter === 'music' || shelfFilter === 'radios';
  const showEvents      = shelfFilter === 'all' || shelfFilter === 'events';


  return (
    <div className="page home-page animate-in">

      {/* ── Shelf with filters ── */}
      <section className="home-section mymusic-section">

        {/* Filter bar: All | Music | Podcast | Suggestions  [Following] */}
        <div className="shelf-filter-bar">
          <div className="shelf-filters">
            {[
              { key: 'all',     label: 'All'     },
              { key: 'music',   label: 'Music'   },
              { key: 'podcast', label: 'Podcasts' },
              { key: 'radios',  label: 'Radios'  },
              { key: 'merch',   label: 'Merch'   },
              { key: 'events',  label: 'Events'  },
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

          {/* Contextual Following toggle — only for Music / Podcast */}
          {showFollowingToggle && (
            <button
              className={`shelf-following-btn${followingOnly ? ' active' : ''}`}
              onClick={() => setFollowing(f => !f)}
            >
              Following
            </button>
          )}
        </div>

        {/* Playlists */}
        {showPlaylists && (
          <>
            <div className="shelf-row-label">Playlists</div>
            <div className="scroll-row">
              {myPlaylists.map(pl => (
                <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={`${pl.trackCount} tracks`} />
              ))}
            </div>
          </>
        )}

        {/* Liked — private liked uploads + public albums */}
        {showLiked && (() => {
          const likedUpl = getLikedUploads(user?.id);
          const totalLiked = likedUpl.length + likedAlbums.length;
          if (totalLiked === 0) return null;
          return (
            <>
              <div className="shelf-row-label">Liked</div>
              {likedUpl.length > 0 && (
                homeLayout.mode === 'list'
                  ? <UploadExpandedList uploads={likedUpl}/>
                  : <UploadGridView uploads={likedUpl} cols={homeLayout.cols}/>
              )}
              {likedAlbums.length > 0 && (
                <div className="scroll-row" style={{marginTop: likedUpl.length > 0 ? 10 : 0}}>
                  {likedAlbums.map(a => (
                    <ShelfCard key={a.id} cover={a.cover} title={a.title} sub={a.artist} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* Artist Radio */}
        {showRadios && (
          <>
            <div className="shelf-row-label">Radio</div>
            <div className="scroll-row">
              {artistRadios.map(r => (
                <ShelfCard key={r.id} cover={r.cover} title={r.name} sub={r.artist} badge="Radio" badgeIcon={Radio} />
              ))}
            </div>
          </>
        )}

        {/* Events */}
        {showEvents && (
          <>
            <div className="shelf-row-label">Events</div>
            <div className="scroll-row">
              {upcomingEvents.map(e => (
                <ShelfCard key={e.id} cover={e.cover} title={e.title} sub={`${e.date} · ${e.venue}`} badge={e.date} />
              ))}
            </div>
          </>
        )}

      </section>

      {featured && (
      <section className="hero-section">
        {/* Ambient blurred background */}
        <div className="hero-cover-bg" style={{ backgroundImage: `url(${featured.cover})` }} />

        {/* Left — text info */}
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
            <button className="hero-play-btn" onClick={() => playRelease(featured)}>
              <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
              <span>Play</span>
            </button>
            <Link to={`/release/${featured.id}`} className="hero-explore-btn">
              View Release
            </Link>
          </div>
        </div>

        {/* Right — album cover art */}
        <div className="hero-cover-art">
          <img src={featured.cover} alt={featured.title} />
        </div>
      </section>
      )}

      {myUploads.length > 0 && (
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


      {/* New Releases — real data from creators */}
      <section className="home-section">
        <div className="section-title">
          <span>New Releases</span>
          <Link to="/search">See All <ArrowRight size={12} /></Link>
        </div>
        {publicReleases.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '16px 0' }}>No public releases yet.</p>
        ) : homeLayout.mode === 'list' ? (
          <div className="upl-exp-list">
            {publicReleases.map(r => (
              <Link key={r.id} to={`/release/${r.id}`} className="upl-exp-item" style={{textDecoration:'none'}}>
                <div className="upl-exp-art">{r.cover && <img src={r.cover} alt={r.title} loading="lazy"/>}</div>
                <div className="upl-exp-meta" style={{flex:1,minWidth:0}}>
                  <div className="upl-exp-title">{r.title}</div>
                  <div className="upl-exp-sub">{r.artist}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={`upl-grid upl-grid-${Math.min(5,Math.max(1,homeLayout.cols))}`}>
            {publicReleases.map(r => (
              <Link key={r.id} to={`/release/${r.id}`} className="upl-grid-cell" style={{textDecoration:'none'}}>
                <div className="upl-grid-art">
                  {r.cover ? <img src={r.cover} alt={r.title} loading="lazy" decoding="async"/> : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                </div>
                <div className="upl-grid-title">{r.title}</div>
                {homeLayout.cols <= 3 && <div className="upl-grid-artist">{r.artist}</div>}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* AI Row */}
      <section className="home-section">
        <div className="section-title">
          <span>Because You Listened to Aura System</span>
        </div>
        {homeLayout.mode === 'list' ? (
          <div className="upl-exp-list">
            {releases.slice(0,4).map(r => (
              <Link key={r.id} to={`/release/${r.id}`} className="upl-exp-item" style={{textDecoration:'none'}}>
                <div className="upl-exp-art">{r.cover && <img src={r.cover} alt={r.title} loading="lazy"/>}</div>
                <div className="upl-exp-meta" style={{flex:1,minWidth:0}}>
                  <div className="upl-exp-title">{r.title}</div>
                  <div className="upl-exp-sub">{r.artist}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={`upl-grid upl-grid-${Math.min(5,Math.max(1,homeLayout.cols))}`}>
            {releases.slice(0,4).map(r => (
              <Link key={r.id} to={`/release/${r.id}`} className="upl-grid-cell" style={{textDecoration:'none'}}>
                <div className="upl-grid-art">
                  {r.cover ? <img src={r.cover} alt={r.title} loading="lazy" decoding="async"/> : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                </div>
                <div className="upl-grid-title">{r.title}</div>
                {homeLayout.cols <= 3 && <div className="upl-grid-artist">{r.artist}</div>}
              </Link>
            ))}
          </div>
        )}
      </section>
      {/* Artists */}
      <section className="home-section">
        <div className="section-title">
          <span>Featured Artists</span>
          <Link to="/search">All Artists</Link>
        </div>
        <div className="scroll-row">
          {artists.map(a => <ArtistCard key={a.id} artist={a} />)}
        </div>
      </section>

      {/* Trending Vinyl */}
      <section className="home-section">
        <div className="section-title">
          <span><TrendingUp size={16} /> Trending Vinyl</span>
          <Link to="/marketplace">Marketplace</Link>
        </div>
        <div className="scroll-row">
          {vinylMarketplace.map(v => <VinylCard key={v.id} listing={v} />)}
        </div>
      </section>

      {/* DJ Sets & Podcasts */}
      <section className="home-section">
        <div className="section-title">
          <span>DJ Sets & Podcasts</span>
          <Link to="/search">See More</Link>
        </div>
        <div className="scroll-row">
          {djSets.map(s => <LongFormCard key={s.id} item={s} />)}
        </div>
      </section>

    </div>
  );
}
