import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search as SearchIcon, Loader2 } from 'lucide-react';
import { artists, labels, vinylMarketplace, djSets } from '../data/mockData';
import { ReleaseCard, ArtistCard, VinylCard, LongFormCard } from '../components/ui/Cards';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import './Search.css';

const TABS = ['All', 'Music', 'Artists', 'Labels', 'Vinyl', 'DJ Sets'];
const GENRES = ['Techno', 'Jazz', 'Hip-Hop', 'Ambient', 'Experimental', 'Drone', 'Electronic', 'Podcast'];

export default function Search() {
  const [query,         setQuery]         = useState('');
  const [activeTab,     setActiveTab]     = useState('All');
  const [selectedGenre, setSelectedGenre] = useState(null);

  // Real public tracks from backend
  const [publicTracks,  setPublicTracks]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Debounced fetch so we don't hammer the API on every keystroke
  const loadTracks = useCallback(async (q) => {
    setLoading(true);
    const tracks = await fetchPublicTracks(q);
    setPublicTracks(tracks);
    setLoading(false);
  }, []);

  // Load all on mount
  useEffect(() => { loadTracks(''); }, [loadTracks]);

  // Debounce search query → reload from server
  useEffect(() => {
    const t = setTimeout(() => loadTracks(query), 400);
    return () => clearTimeout(t);
  }, [query, loadTracks]);

  // Toggle genre — clicking the same one deselects
  const handleGenre = (g) => {
    setSelectedGenre(prev => prev === g ? null : g);
  };

  // Client-side genre filter on server results
  const filteredPublicTracks = useMemo(() => {
    if (!selectedGenre) return publicTracks;
    return publicTracks.filter(t =>
      t.genre?.toLowerCase().includes(selectedGenre.toLowerCase())
    );
  }, [publicTracks, selectedGenre]);

  // Mock data — still used for Artists / Labels / Vinyl / DJ Sets
  const mockResults = useMemo(() => {
    const q = query.toLowerCase();
    const genreMatch = (val) => !selectedGenre || val?.toLowerCase().includes(selectedGenre.toLowerCase());
    return {
      artists: artists.filter(a =>
        genreMatch(a.genre) &&
        (!q || a.name.toLowerCase().includes(q) || a.genre?.toLowerCase().includes(q))
      ),
      labels: labels.filter(l =>
        genreMatch(l.genre) &&
        (!q || l.name.toLowerCase().includes(q) || l.genre?.toLowerCase().includes(q))
      ),
      vinyl: vinylMarketplace.filter(v =>
        (!q || v.release?.toLowerCase().includes(q) || v.artist?.toLowerCase().includes(q))
      ),
      djSets: djSets.filter(d =>
        (!q || d.title?.toLowerCase().includes(q) || d.artist?.toLowerCase().includes(q))
      ),
    };
  }, [query, selectedGenre]);

  const showReleases = (activeTab === 'All' || activeTab === 'Music');
  const showArtists  = (activeTab === 'All' || activeTab === 'Artists') && mockResults.artists.length > 0;
  const showLabels   = (activeTab === 'All' || activeTab === 'Labels')  && mockResults.labels.length  > 0;
  const showVinyl    = (activeTab === 'All' || activeTab === 'Vinyl')   && mockResults.vinyl.length   > 0;
  const showDJ       = (activeTab === 'All' || activeTab === 'DJ Sets') && mockResults.djSets.length  > 0;
  const hasResults   = (showReleases && (filteredPublicTracks.length > 0 || loading)) ||
                       showArtists || showLabels || showVinyl || showDJ;

  return (
    <div className="page search-page animate-in">
      {/* Search bar */}
      <div className="search-bar-wrap">
        <div className="search-bar">
          {loading
            ? <Loader2 size={18} className="search-icon" style={{ animation: 'spin 1s linear infinite' }} />
            : <SearchIcon size={18} className="search-icon" />
          }
          <input
            id="search-input"
            type="text"
            placeholder="Search releases, artists, labels…"
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

      {/* Real releases from DB */}
      {showReleases && (
        <section className="search-section">
          <div className="section-title"><span>Releases</span></div>
          {loading ? (
            <div className="search-loading">
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
              <span>Loading releases…</span>
            </div>
          ) : filteredPublicTracks.length > 0 ? (
            <div className="search-grid">
              {filteredPublicTracks.map(t => (
                <ReleaseCard key={t.id} release={{
                  ...t,
                  // Wrap the flat track in a release shape so playRelease works
                  tracks: [{ ...t, src: t.audioUrl || t.src || '' }],
                }} />
              ))}
            </div>
          ) : (
            <p className="search-empty-inline">
              {query || selectedGenre ? 'No releases match your search.' : 'No public releases yet.'}
            </p>
          )}
        </section>
      )}

      {showArtists && (
        <section className="search-section">
          <div className="section-title"><span>Artists</span></div>
          <div className="search-grid">
            {mockResults.artists.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
        </section>
      )}

      {showLabels && (
        <section className="search-section">
          <div className="section-title"><span>Labels</span></div>
          <div className="label-list">
            {mockResults.labels.map(l => (
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
            {mockResults.vinyl.map(v => <VinylCard key={v.id} listing={v} />)}
          </div>
        </section>
      )}

      {showDJ && (
        <section className="search-section">
          <div className="section-title"><span>DJ Sets &amp; Podcasts</span></div>
          <div className="search-grid">
            {mockResults.djSets.map(d => <LongFormCard key={d.id} item={d} />)}
          </div>
        </section>
      )}

      {!hasResults && !loading && (query || selectedGenre) && (
        <div className="search-empty">
          <SearchIcon size={40} strokeWidth={1} />
          <p>No results{selectedGenre ? ` in ${selectedGenre}` : ''}{query ? ` for "${query}"` : ''}</p>
          <p className="search-empty-sub">Try a different search term or genre.</p>
        </div>
      )}
    </div>
  );
}
