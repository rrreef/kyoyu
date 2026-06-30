import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import { releases, artists } from '../data/mockData';
import { ReleaseCard, ArtistCard } from '../components/ui/Cards';
import './Search.css';

export default function Search() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kyoyu-search-history');
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  // Expose search setter so native can push queries
  useEffect(() => {
    window.__kyoyuSetSearch = (q) => {
      setQuery(q);
      if (q.trim().length >= 2) {
        setHistory(prev => {
          const cleaned = prev.filter(h => h.toLowerCase() !== q.toLowerCase());
          const next = [q, ...cleaned].slice(0, 20);
          localStorage.setItem('kyoyu-search-history', JSON.stringify(next));
          return next;
        });
      }
    };
    return () => { delete window.__kyoyuSetSearch; };
  }, []);

  const removeHistoryItem = (idx) => {
    const next = history.filter((_, i) => i !== idx);
    setHistory(next);
    localStorage.setItem('kyoyu-search-history', JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('kyoyu-search-history');
  };

  const filtered = query.length < 2 ? [] : releases.filter(r =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.artist.toLowerCase().includes(query.toLowerCase())
  );
  const filteredArtists = query.length < 2 ? [] : artists.filter(a =>
    a.name.toLowerCase().includes(query.toLowerCase())
  );

  const hasResults = filtered.length > 0 || filteredArtists.length > 0;

  return (
    <div className="page search-page animate-in">

      {/* Search History — shown when no active query */}
      {!hasResults && history.length > 0 && (
        <div className="search-history">
          <div className="search-history-header">
            <span className="search-history-title">Recent</span>
            <button className="search-history-clear" onClick={clearHistory}>Clear All</button>
          </div>
          <div className="search-history-list">
            {history.map((item, i) => (
              <div key={i} className="search-history-item" onClick={() => window.__kyoyuSetSearch?.(item)}>
                <Clock size={14} className="search-history-icon" />
                <span className="search-history-text">{item}</span>
                <button
                  className="search-history-remove"
                  onClick={(e) => { e.stopPropagation(); removeHistoryItem(i); }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {filtered.length > 0 && (
        <section className="home-section">
          <div className="section-title"><span>Releases</span></div>
          <div className="scroll-row">
            {filtered.map(r => <ReleaseCard key={r.id} release={r} />)}
          </div>
        </section>
      )}

      {filteredArtists.length > 0 && (
        <section className="home-section">
          <div className="section-title"><span>Artists</span></div>
          <div className="scroll-row">
            {filteredArtists.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
