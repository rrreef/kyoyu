import { useParams, Link } from 'react-router-dom';
import { Play, Heart, ShoppingBag, Download, Share2, ArrowLeft } from 'lucide-react';
import { releases } from '../data/mockData';
import { TrackRow, ReleaseCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import './ReleasePage.css';

export default function ReleasePage() {
  const { id } = useParams();
  const release = releases.find(r => r.id === id) || releases[0];
  const { playRelease, playTrack, state } = usePlayer();
  const { isSaved, toggleSave } = useLibrary();
  const saved = isSaved(release.id);
  const related = releases.filter(r => r.id !== release.id && (r.labelId === release.labelId || r.genre === release.genre)).slice(0, 4);

  function handlePlayTrack(track) {
    const queue = release.tracks.map(t => ({ ...t, releaseCover: release.cover, releaseTitle: release.title, artistName: release.artist }));
    const full = { ...track, releaseCover: release.cover, releaseTitle: release.title, artistName: release.artist };
    playTrack(full, queue);
  }

  return (
    <div className="page release-page animate-in">
      {/* Header */}
      <div className="release-header">
        <div className="release-cover-wrap">
          <img src={release.cover} alt={release.title} className="release-cover" />
        </div>
        <div className="release-info">
          <div className="release-format-badges">
            {release.formats.map(f => <span key={f} className="format-badge glass-sm">{f}</span>)}
          </div>
          <h1 className="release-title">{release.title}</h1>
          <Link to={`/artist/${release.artistId}`} className="release-artist">{release.artist}</Link>

          <div className="release-meta-row">
            <Link to={`/label/${release.labelId}`} className="release-meta-item">{release.label}</Link>
            <span className="release-meta-dot">·</span>
            <span className="release-meta-item">{release.year}</span>
            <span className="release-meta-dot">·</span>
            <span className="release-meta-item">{release.catalogNumber}</span>
            <span className="release-meta-dot">·</span>
            <span className="release-meta-item">{release.genre}</span>
          </div>

          <div className="release-description">{release.description}</div>

          <div className="release-actions">
            <button className="release-play-btn" onClick={() => playRelease(release)}>
              <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
              <span>Play All</span>
            </button>
            <button className={`release-icon-btn glass-sm ${saved ? 'saved' : ''}`} onClick={() => toggleSave(release.id)} title="Save to Library">
              <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button className="release-icon-btn glass-sm" title="Share">
              <Share2 size={18} />
            </button>
          </div>

          {/* Buy Vinyl / Download */}
          <div className="release-commerce">
            {release.vinylPrice && (
              <div className="release-buy-option glass-sm">
                <ShoppingBag size={16} />
                <div>
                  <div className="buy-opt-label">Buy Vinyl</div>
                  <div className="buy-opt-price">€{release.vinylPrice.toFixed(2)}</div>
                </div>
                <button className="buy-btn">Add to Cart</button>
              </div>
            )}
            <div className="release-buy-option glass-sm">
              <Download size={16} />
              <div>
                <div className="buy-opt-label">DJ Download</div>
                <div className="buy-opt-price">€{release.downloadPrice.toFixed(2)} / track · WAV, FLAC, AIFF, MP3</div>
              </div>
              <Link to={`/dj-download/${release.id}`} className="buy-btn">Download</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <section className="release-tracks">
        <div className="section-title"><span>Tracklist</span><span className="track-total">{release.tracks.length} tracks · {release.duration}</span></div>
        <div className="track-list">
          {release.tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} release={release} onPlay={handlePlayTrack} />
          ))}
        </div>
      </section>

      {/* Credits */}
      <section className="release-credits">
        <div className="section-title"><span>Credits</span></div>
        <div className="credits-grid glass">
          {Object.entries(release.credits).map(([key, value]) => (
            <div key={key} className="credit-item">
              <span className="credit-key">{key.replace(/([A-Z])/g, ' $1')}</span>
              <span className="credit-val">{value}</span>
            </div>
          ))}
          <div className="credit-item">
            <span className="credit-key">Total Streams</span>
            <span className="credit-val">{release.streamCount.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="release-related">
          <div className="section-title"><span>More from this Label</span></div>
          <div className="scroll-row">
            {related.map(r => <ReleaseCard key={r.id} release={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
