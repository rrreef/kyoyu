import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Play, ArrowRight, TrendingUp, Zap, Radio } from 'lucide-react';
import { releases, artists, vinylMarketplace, djSets, myPlaylists, likedAlbums, savedPlaylists, artistRadios, merchItems, upcomingEvents } from '../data/mockData';
import { ReleaseCard, ArtistCard, VinylCard, LongFormCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
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
  const featured = releases[0];

  // Shelf filter state
  const [shelfFilter, setShelfFilter]   = useState('all');       // all | music | podcast | suggestions
  const [followingOnly, setFollowing]   = useState(false);        // sub-filter

  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcast' || shelfFilter === 'radios';

  // Decide which rows to render
  const showPlaylists   = shelfFilter === 'all' || shelfFilter === 'music';
  const showLiked       = shelfFilter === 'all' || shelfFilter === 'music';
  const showPodcasts    = shelfFilter === 'all' || shelfFilter === 'podcast';
  const showRadios      = shelfFilter === 'all' || shelfFilter === 'music' || shelfFilter === 'radios';
  const showMerch       = shelfFilter === 'all' || shelfFilter === 'merch';
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

        {/* My Playlists */}
        {showPlaylists && (
          <>
            <div className="shelf-row-label">My Playlists</div>
            <div className="scroll-row">
              {myPlaylists.map(pl => (
                <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={`${pl.trackCount} tracks`} />
              ))}
            </div>
          </>
        )}

        {/* Liked Albums */}
        {showLiked && (
          <>
            <div className="shelf-row-label">Liked Albums</div>
            <div className="scroll-row">
              {likedAlbums.map(a => (
                <ShelfCard key={a.id} cover={a.cover} title={a.title} sub={a.artist} />
              ))}
            </div>
          </>
        )}

        {/* Saved Playlists / Podcasts */}
        {showPodcasts && (
          <>
            <div className="shelf-row-label">{shelfFilter === 'podcast' ? 'Podcasts & DJ Sets' : 'Saved Playlists'}</div>
            <div className="scroll-row">
              {savedPlaylists.map(pl => (
                <ShelfCard key={pl.id} cover={pl.cover} title={pl.title} sub={pl.curator} badge={pl.isAI ? 'AI' : null} />
              ))}
            </div>
          </>
        )}

        {/* Artist Radio */}
        {showRadios && (
          <>
            <div className="shelf-row-label">Artist Radio</div>
            <div className="scroll-row">
              {artistRadios.map(r => (
                <ShelfCard key={r.id} cover={r.cover} title={r.name} sub={r.artist} badge="Radio" badgeIcon={Radio} />
              ))}
            </div>
          </>
        )}

        {/* Merch */}
        {showMerch && (
          <>
            <div className="shelf-row-label">Merch</div>
            <div className="scroll-row">
              {merchItems.map(m => (
                <ShelfCard key={m.id} cover={m.cover} title={m.title} sub={m.price} />
              ))}
            </div>
          </>
        )}

        {/* Events */}
        {showEvents && (
          <>
            <div className="shelf-row-label">Upcoming Events</div>
            <div className="scroll-row">
              {upcomingEvents.map(e => (
                <ShelfCard key={e.id} cover={e.cover} title={e.title} sub={`${e.date} · ${e.venue}`} badge={e.date} />
              ))}
            </div>
          </>
        )}

      </section>

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

      {/* New Releases */}
      <section className="home-section">
        <div className="section-title">
          <span>New Releases</span>
          <Link to="/search">See All <ArrowRight size={12} /></Link>
        </div>
        <div className="scroll-row">
          {releases.map(r => <ReleaseCard key={r.id} release={r} />)}
        </div>
      </section>

      {/* AI Row */}
      <section className="home-section">
        <div className="section-title">
          <span>Because You Listened to Aura System</span>
        </div>
        <div className="scroll-row">
          {releases.slice(0, 4).map(r => <ReleaseCard key={r.id} release={r} size="sm" />)}
        </div>
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

      {/* Payout Promise Banner */}
      <section className="home-section">
        <Link to="/subscription" className="payout-banner glass">
          <div className="payout-banner-left">
            <div className="payout-banner-title">Your money goes directly to the artists you listen to.</div>
            <div className="payout-banner-sub">70% of your subscription goes to the artists you actually played this month — split by listening time. Not pooled. Not diluted.</div>
          </div>
          <div className="payout-banner-right">
            <div className="payout-stat">70%</div>
            <div className="payout-stat-label">To artists</div>
          </div>
          <ArrowRight size={20} className="payout-arrow" />
        </Link>
      </section>
    </div>
  );
}
