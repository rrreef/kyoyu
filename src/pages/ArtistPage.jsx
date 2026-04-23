import { useParams, Link } from 'react-router-dom';
import { MapPin, Users, Music, Calendar } from 'lucide-react';
import { artists, releases } from '../data/mockData';
import { ReleaseCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import './ArtistPage.css';

export default function ArtistPage() {
  const { id } = useParams();
  const artist = artists.find(a => a.id === id) || artists[0];
  const artistReleases = releases.filter(r => r.artistId === artist.id);
  const { playRelease } = usePlayer();
  const { isFollowing, toggleFollow } = useLibrary();
  const following = isFollowing(artist.id);

  return (
    <div className="artist-page animate-in">
      {/* Hero */}
      <div className="artist-hero">
        <div className="artist-hero-bg" style={{ backgroundImage: `url(${artist.photo})` }} />
        <div className="artist-hero-content">
          <div className="artist-hero-badge glass-sm">{artist.genre}</div>
          <h1 className="artist-hero-name">{artist.name}</h1>
          <div className="artist-stats">
            <div className="artist-stat">
              <Users size={14} />
              <span>{(artist.monthlyListeners / 1000).toFixed(0)}K monthly listeners</span>
            </div>
            <div className="artist-stat">
              <Users size={14} />
              <span>{(artist.followers / 1000).toFixed(1)}K followers</span>
            </div>
            {artist.location && (
              <div className="artist-stat">
                <MapPin size={14} />
                <span>{artist.location}</span>
              </div>
            )}
          </div>
          <div className="artist-hero-actions">
            <button className="artist-follow-btn" onClick={() => toggleFollow(artist.id)}>
              {following ? 'Following' : 'Follow'}
            </button>
            {artistReleases.length > 0 && (
              <button className="artist-play-btn glass-sm" onClick={() => playRelease(artistReleases[0])}>
                Play Latest
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page">
        {/* Bio */}
        <section className="artist-bio-section">
          <div className="section-title"><span>About</span></div>
          <p className="artist-bio">{artist.bio}</p>
        </section>

        {/* Discography */}
        {artistReleases.length > 0 && (
          <section className="artist-discography">
            <div className="section-title"><span>Discography</span></div>
            <div className="scroll-row">
              {artistReleases.map(r => <ReleaseCard key={r.id} release={r} />)}
            </div>
          </section>
        )}

        {/* Events */}
        {artist.events.length > 0 && (
          <section className="artist-events">
            <div className="section-title"><span><Calendar size={16} /> Upcoming Events</span></div>
            <div className="event-list">
              {artist.events.map((ev, i) => (
                <div key={i} className="event-item glass">
                  <div className="event-date">
                    <span className="event-month">{new Date(ev.date).toLocaleString('en', { month: 'short' })}</span>
                    <span className="event-day">{new Date(ev.date).getDate()}</span>
                  </div>
                  <div className="event-info">
                    <div className="event-venue">{ev.venue}</div>
                    <div className="event-city">{ev.city}</div>
                  </div>
                  <button className="event-tickets-btn">Tickets</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Label link */}
        {artist.label !== 'self-released' && (
          <section>
            <div className="section-title"><span>Label</span></div>
            <Link to={`/label/${artist.label}`} className="artist-label-link glass">
              <Music size={16} />
              <span>{artist.label.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</span>
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
