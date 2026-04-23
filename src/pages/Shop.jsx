import { useState } from 'react';
import { ShoppingBag, Download, Disc3, Check } from 'lucide-react';
import { releases, vinylMarketplace } from '../data/mockData';
import { ReleaseCard, VinylCard } from '../components/ui/Cards';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import './Shop.css';

const TABS = ['Digital', 'Vinyl (Direct)', 'Merch'];

export default function Shop() {
  const [activeTab, setActiveTab] = useState('Digital');
  const [selectedFormats, setSelectedFormats] = useState({});
  const [addedToCart, setAddedToCart] = useState({});
  const { playRelease } = usePlayer();
  const { addDownload } = useLibrary();

  function handleDownload(release) {
    const track = release.tracks?.[0];
    if (track) {
      addDownload({ ...track, artistName: release.artist, releaseCover: release.cover, releaseTitle: release.title });
      setAddedToCart(prev => ({ ...prev, [release.id]: true }));
      setTimeout(() => setAddedToCart(prev => ({ ...prev, [release.id]: false })), 2000);
    }
  }

  const vinylReleases = releases.filter(r => r.vinylPrice);

  return (
    <div className="page shop-page animate-in">

      <div className="shop-tabs">
        {TABS.map(tab => (
          <button key={tab} className={`shop-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {activeTab === tab && tab === 'Digital' && <Download size={14} />}
            {activeTab === tab && tab === 'Vinyl (Direct)' && <Disc3 size={14} />}
            {activeTab === tab && tab === 'Merch' && <ShoppingBag size={14} />}
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Digital' && (
        <div>
          <div className="shop-info-banner glass">
            <Download size={18} />
            <div>
              <div className="shop-info-title">DJ & Collector Downloads</div>
              <div className="shop-info-sub">High-quality audio files for professional use. Purchase individual tracks or full releases. Available in MP3, WAV, FLAC, and AIFF.</div>
            </div>
          </div>
          <div className="shop-release-list">
            {releases.map(release => (
              <div key={release.id} className="shop-release-row glass">
                <div className="shop-release-cover">
                  <img src={release.cover} alt={release.title} />
                </div>
                <div className="shop-release-info">
                  <div className="shop-release-title">{release.title}</div>
                  <div className="shop-release-artist">{release.artist}</div>
                  <div className="shop-release-tracks">{release.tracks?.length} tracks · {release.duration}</div>
                </div>
                <div className="shop-release-formats">
                  {['MP3', 'WAV', 'FLAC', 'AIFF'].map(fmt => (
                    <button
                      key={fmt}
                      className={`fmt-btn ${selectedFormats[release.id] === fmt ? 'selected' : ''}`}
                      onClick={() => setSelectedFormats(prev => ({ ...prev, [release.id]: fmt }))}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <div className="shop-release-price">
                  <div className="shop-price">€{(release.downloadPrice * (release.tracks?.length || 1)).toFixed(2)}</div>
                  <div className="shop-price-sub">€{release.downloadPrice.toFixed(2)} / track</div>
                </div>
                <button
                  className={`shop-buy-btn ${addedToCart[release.id] ? 'added' : ''}`}
                  onClick={() => handleDownload(release)}
                >
                  {addedToCart[release.id] ? <><Check size={14} /> Added</> : <><Download size={14} /> Purchase</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Vinyl (Direct)' && (
        <div>
          <div className="shop-info-banner glass">
            <Disc3 size={18} />
            <div>
              <div className="shop-info-title">Buy Direct from Labels & Artists</div>
              <div className="shop-info-sub">Support artists directly. New pressings shipped from the label or artist. No resellers — 100% goes to the source.</div>
            </div>
          </div>
          <div className="scroll-row">
            {vinylReleases.map(r => (
              <div key={r.id} className="vinyl-direct-card glass-card">
                <div className="card-cover-wrap">
                  <img src={r.cover} alt={r.title} className="card-cover" />
                </div>
                <div className="card-body">
                  <div className="card-title">{r.title}</div>
                  <div className="card-sub">{r.artist}</div>
                  <div className="card-meta">
                    <span className="card-genre">{r.formats.filter(f => f.includes('Vinyl')).join(', ')}</span>
                  </div>
                  <div className="vinyl-direct-price">€{r.vinylPrice?.toFixed(2)}</div>
                  <button className="vinyl-direct-buy-btn">Add to Cart</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Merch' && (
        <div className="shop-coming-soon glass">
          <ShoppingBag size={40} strokeWidth={1} />
          <div className="coming-soon-title">Merch Coming Soon</div>
          <div className="coming-soon-sub">Artist and label merchandise will be available in Phase 2. Artists can apply to list their merchandise through the dashboard.</div>
        </div>
      )}
    </div>
  );
}
