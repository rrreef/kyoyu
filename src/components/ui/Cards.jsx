import { Link } from 'react-router-dom';
import { Play, Heart, ShoppingBag } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import './Cards.css';

export function ReleaseCard({ release, size = 'md' }) {
  const { playRelease } = usePlayer();
  const { isSaved, toggleSave } = useLibrary();
  const saved = isSaved(release.id);

  return (
    <div className={`release-card glass-card ${size}`}>
      <div className="card-cover-wrap">
        <img src={release.cover} alt={release.title} className="card-cover" />
        <div className="card-cover-overlay">
          <button className="card-play-btn" onClick={() => playRelease(release)} aria-label="Play">
            <Play size={18} fill="white" />
          </button>
        </div>
      </div>
      <div className="card-body">
        <Link to={`/release/${release.id}`} className="card-title">{release.title}</Link>
        <Link to={`/artist/${release.artistId}`} className="card-sub">{release.artist}</Link>
        <div className="card-meta">
          <span className="card-genre">{release.genre}</span>
          <span className="card-year">{release.year}</span>
        </div>
        <div className="card-actions">
          <button className={`card-action-btn ${saved ? 'active' : ''}`} onClick={() => toggleSave(release.id)} title="Save to Library">
            <Heart size={14} fill={saved ? 'currentColor' : 'none'} />
          </button>
          {release.vinylPrice && (
            <Link to={`/release/${release.id}`} className="card-action-btn" title="Buy Vinyl">
              <ShoppingBag size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArtistCard({ artist }) {
  const { isFollowing, toggleFollow } = useLibrary();
  const following = isFollowing(artist.id);

  return (
    <div className="artist-card glass-card">
      <Link to={`/artist/${artist.id}`}>
        <div className="artist-card-photo">
          <img src={artist.photo} alt={artist.name} />
        </div>
        <div className="card-body">
          <div className="card-title">{artist.name}</div>
          <div className="card-sub">{artist.genre}</div>
          <div className="card-meta">
            <span className="card-genre">{(artist.monthlyListeners / 1000).toFixed(0)}K listeners</span>
          </div>
        </div>
      </Link>
      <button
        className={`follow-btn glass-sm ${following ? 'following' : ''}`}
        onClick={() => toggleFollow(artist.id)}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

export function TrackRow({ track, index, release, onPlay }) {
  const { state } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(track.id);
  const isActive = state.currentTrack?.id === track.id;

  return (
    <div className={`track-row ${isActive ? 'track-row-active' : ''}`} onDoubleClick={() => onPlay?.(track)}>
      <div className="track-num">
        {isActive && state.isPlaying
          ? <div className="track-playing-ind"><span /><span /><span /></div>
          : <span>{index + 1}</span>}
      </div>
      <button className="track-play-trigger" onClick={() => onPlay?.(track)}>
        <Play size={14} fill="currentColor" />
      </button>
      <div className="track-info">
        <div className={`track-title ${isActive ? 'track-title-active' : ''}`}>{track.title}</div>
        {track.bpm && <div className="track-bpm">{track.bpm} BPM · {track.key}</div>}
      </div>
      <div className="track-actions">
        <button className={`track-action-btn ${liked ? 'liked' : ''}`} onClick={() => toggleLike(track.id)}>
          <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="track-duration">{track.duration}</div>
    </div>
  );
}

export function VinylCard({ listing }) {
  return (
    <div className="vinyl-card glass-card">
      <div className="vinyl-card-cover">
        <img src={listing.cover} alt={listing.release} />
        <div className="vinyl-card-condition">{listing.condition.split(' ')[0]}</div>
      </div>
      <div className="card-body">
        <Link to={`/marketplace/${listing.id}`} className="card-title">{listing.release}</Link>
        <div className="card-sub">{listing.artist}</div>
        <div className="card-meta">
          <span className="card-genre">{listing.format}</span>
          <span className="card-year">{listing.country}</span>
        </div>
        <div className="vinyl-card-footer">
          <div className="vinyl-price">€{listing.price.toFixed(2)}</div>
          <div className="vinyl-seller">
            <span>{listing.seller}</span>
            <div className="seller-rating">★ {listing.sellerRating}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LongFormCard({ item }) {
  const { playTrack } = usePlayer();
  return (
    <div className="longform-card glass-card">
      <div className="card-cover-wrap">
        <img src={item.cover} alt={item.title} className="card-cover" />
        <div className="card-cover-overlay">
          <button
            className="card-play-btn"
            onClick={() => playTrack({ id: item.id, title: item.title, releaseCover: item.cover, releaseTitle: item.title, artistName: item.artist, duration: item.duration })}
          >
            <Play size={18} fill="white" />
          </button>
        </div>
        <div className="longform-type-badge">{item.type === 'djset' ? 'DJ Set' : 'Podcast'}</div>
      </div>
      <div className="card-body">
        <Link to={`/longform/${item.id}`} className="card-title">{item.title}</Link>
        <div className="card-sub">{item.artist}</div>
        <div className="card-meta">
          <span className="card-genre">{item.duration}</span>
          <span className="card-year">{item.date?.split('-')[0]}</span>
        </div>
      </div>
    </div>
  );
}
