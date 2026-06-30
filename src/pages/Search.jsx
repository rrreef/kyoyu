import { useState, useEffect, useRef } from 'react';
import { Clock, X, Download, Heart, ListPlus, Play } from 'lucide-react';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import './Search.css';

export default function Search() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const queryRef = useRef('');

  // Keep queryRef in sync so callbacks can read latest
  queryRef.current = query;

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kyoyu-search-history');
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  // Expose search setter so native can push queries
  useEffect(() => {
    const handleLive = (q) => {
      setQuery(q || '');
    };

    const handleSubmit = (q) => {
      setQuery(q || '');
      if (q && q.trim().length >= 2) {
        setHistory(prev => {
          const cleaned = prev.filter(h => h.toLowerCase() !== q.toLowerCase());
          const next = [q, ...cleaned].slice(0, 20);
          localStorage.setItem('kyoyu-search-history', JSON.stringify(next));
          return next;
        });
      }
    };

    window.__kyoyuSearchLive = handleLive;
    window.__kyoyuSetSearch = handleSubmit;

    // Also listen for custom events as fallback
    const onLive = (e) => handleLive(e.detail);
    const onSubmit = (e) => handleSubmit(e.detail);
    window.addEventListener('kyoyu-search-live', onLive);
    window.addEventListener('kyoyu-search-submit', onSubmit);

    console.log('[Search] handlers registered');

    return () => {
      delete window.__kyoyuSearchLive;
      delete window.__kyoyuSetSearch;
      window.removeEventListener('kyoyu-search-live', onLive);
      window.removeEventListener('kyoyu-search-submit', onSubmit);
    };
  }, []);

  // Debounced search — fires on every query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const q = query.trim();
      console.log('[Search] fetching:', q);

      fetchPublicTracks(q)
        .then(tracks => {
          console.log('[Search] got', tracks.length, 'tracks');
          setResults(tracks);
        })
        .catch(err => {
          console.warn('[Search] error:', err);
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const removeHistoryItem = (idx) => {
    const next = history.filter((_, i) => i !== idx);
    setHistory(next);
    localStorage.setItem('kyoyu-search-history', JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('kyoyu-search-history');
  };

  const playTrack = (track) => {
    // Use the global player bridge
    const msg = JSON.stringify({
      type: 'play',
      title: track.title,
      artist: track.artist,
      artwork: track.cover || '',
      audioUrl: track.audioUrl || '',
    });
    if (window.webkit?.messageHandlers?.playerBridge) {
      window.webkit.messageHandlers.playerBridge.postMessage(msg);
    }
  };

  const hasResults = results.length > 0;
  const showHistory = !hasResults && query.length < 2 && history.length > 0;

  return (
    <div className="page search-page animate-in">

      {/* Search History — shown when no active query */}
      {showHistory && (
        <div className="search-history">
          <div className="search-history-header">
            <span className="search-history-title">Recent</span>
            <button className="search-history-clear" onClick={clearHistory}>Clear All</button>
          </div>
          <div className="search-history-list">
            {history.map((item, i) => (
              <div key={i} className="search-history-item" onClick={() => {
                setQuery(item);
              }}>
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

      {/* Live Results List */}
      {hasResults && (
        <div className="search-results-list">
          {results.map(track => (
            <div key={track.id} className="search-result-row">
              <div className="search-result-art">
                {track.cover ? (
                  <img src={track.cover} alt="" />
                ) : (
                  <div className="search-result-art-placeholder" />
                )}
              </div>
              <div className="search-result-info">
                <span className="search-result-title">{track.title}</span>
                {track.album && track.album !== track.title && (
                  <span className="search-result-album">{track.album}</span>
                )}
                <span className="search-result-artist">{track.artist}</span>
              </div>
              <div className="search-result-actions">
                {track.downloadUrl && (
                  <a href={track.downloadUrl} download className="search-action-btn" title="Download">
                    <Download size={16} />
                  </a>
                )}
                <button className="search-action-btn" title="Like">
                  <Heart size={16} />
                </button>
                <button className="search-action-btn" title="Add to Playlist">
                  <ListPlus size={16} />
                </button>
                <button className="search-action-btn search-play-btn" title="Play" onClick={() => playTrack(track)}>
                  <Play size={16} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && query.length >= 2 && !hasResults && (
        <div className="search-loading">Searching...</div>
      )}

      {/* Empty state */}
      {!loading && query.length >= 2 && !hasResults && (
        <div className="search-empty">No results found</div>
      )}

      {/* Debug info — remove once verified */}
      <div style={{ position: 'fixed', bottom: 80, left: 10, fontSize: 10, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none', zIndex: 9999 }}>
        q: "{query}" | r: {results.length} | l: {loading ? 'y' : 'n'}
      </div>
    </div>
  );
}
