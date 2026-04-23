import { useState, useMemo } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { releases, artists, labels, vinylMarketplace, djSets } from '../data/mockData';
import { ReleaseCard, ArtistCard, VinylCard, LongFormCard } from '../components/ui/Cards';
import './Search.css';

const TABS = ['All', 'Music', 'Artists', 'Labels', 'Vinyl', 'DJ Sets'];
const GENRES = ['Techno', 'Jazz', 'Hip-Hop', 'Ambient', 'Experimental', 'Drone', 'Electronic', 'Podcast'];

export default function Search() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [selectedGenre, setSelectedGenre] = useState(null);

  // Toggle genre — clicking the same one deselects
  const handleGenre = (g) => {
    setSelectedGenre(prev => prev === g ? null : g);
  };

  const results = useMemo(() => {
    const q = query.toLowerCase();
    const genreMatch = (val) => !selectedGenre || val.toLowerCase().includes(selectedGenre.toLowerCase());

    const filterByQuery = (val) => !q || val.toLowerCase().includes(q);

    return {
      releases: releases.filter(r =>
        genreMatch(r.genre) &&
        (!q || r.title.toLowerCase().includes(q) || r.artist.toLowerCase().includes(q) || r.genre.toLowerCase().includes(q) || r.year.toString().includes(q))
      ),
      artists: artists.filter(a =>
        genreMatch(a.genre) &&
        (!q || a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q))
      ),
      labels: labels.filter(l =>
        genreMatch(l.genre) &&
        (!q || l.name.toLowerCase().includes(q) || l.genre.toLowerCase().includes(q))
      ),
      vinyl: vinylMarketplace.filter(v =>
        (!q || v.release.toLowerCase().includes(q) || v.artist.toLowerCase().includes(q))
      ),
      djSets: djSets.filter(d =>
        (!q || d.title.toLowerCase().includes(q) || d.artist.toLowerCase().includes(q))
      ),
    };
  }, [query, selectedGenre]);

  const showReleases = (activeTab === 'All' || activeTab === 'Music') && results.releases.length > 0;
  const showArtists  = (activeTab === 'All' || activeTab === 'Artists') && results.artists.length > 0;
  const showLabels   = (activeTab === 'All' || activeTab === 'Labels') && results.labels.length > 0;
  const showVinyl    = (activeTab === 'All' || activeTab === 'Vinyl') && results.vinyl.length > 0;
  const showDJ       = (activeTab === 'All' || activeTab === 'DJ Sets') && results.djSets.length > 0;
  const hasResults   = showReleases || showArtists || showLabels || showVinyl || showDJ;

  return (
    <div className="page search-page animate-in">
      {/* Search bar */}
      <div className="search-bar-wrap">
        <div className="search-bar">
          <SearchIcon size={18} className="search-icon" />
          <input
            id="search-input"
            type="text"
            placeholder="Search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-input"
            autoFocus
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="search-tabs">
        {TABS.map(tab => (
          <button key={tab} className={`search-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* Browse Catalog — always visible */}
      <div className="search-browse">
        <h2 className="browse-title">Browse Catalog</h2>
        <div className="browse-genres">
          {GENRES.map(g => (
            <button
              key={g}
              className={`browse-genre-btn${selectedGenre === g ? ' active' : ''}`}
              onClick={() => handleGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {showReleases && (
        <section className="search-section">
          <div className="section-title"><span>Releases</span></div>
          <div className="search-grid">
            {results.releases.map(r => <ReleaseCard key={r.id} release={r} />)}
          </div>
        </section>
      )}

      {showArtists && (
        <section className="search-section">
          <div className="section-title"><span>Artists</span></div>
          <div className="search-grid">
            {results.artists.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
        </section>
      )}

      {showLabels && (
        <section className="search-section">
          <div className="section-title"><span>Labels</span></div>
          <div className="label-list">
            {results.labels.map(l => (
              <div key={l.id} className="label-row glass">
                <div className="label-row-logo"><img src={l.logo} alt={l.name} /></div>
                <div className="label-row-info">
                  <div className="label-row-name">{l.name}</div>
                  <div className="label-row-meta">{l.genre} · Founded {l.founded}</div>
                </div>
                <div className="label-row-followers">{(l.followers / 1000).toFixed(1)}K followers</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showVinyl && (
        <section className="search-section">
          <div className="section-title"><span>Vinyl Marketplace</span></div>
          <div className="search-grid">
            {results.vinyl.map(v => <VinylCard key={v.id} listing={v} />)}
          </div>
        </section>
      )}

      {showDJ && (
        <section className="search-section">
          <div className="section-title"><span>DJ Sets &amp; Podcasts</span></div>
          <div className="search-grid">
            {results.djSets.map(d => <LongFormCard key={d.id} item={d} />)}
          </div>
        </section>
      )}

      {!hasResults && (query || selectedGenre) && (
        <div className="search-empty">
          <SearchIcon size={40} strokeWidth={1} />
          <p>No results{selectedGenre ? ` in ${selectedGenre}` : ''}{query ? ` for "${query}"` : ''}</p>
          <p className="search-empty-sub">Try a different search term or genre.</p>
        </div>
      )}
    </div>
  );
}
