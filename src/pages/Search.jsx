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

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kyoyu-search-history');
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  // Register search handlers — multiple pathways for reliability
  useEffect(() => {
    // 1. Override the native-injected stubs with real React state setters
    window.__kyoyuSearchLive = (q) => {
      setQuery(q || '');
    };
    window.__kyoyuSetSearch = (q) => {
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

    // 2. Listen for document-level custom event (fired by native-injected stubs)
    const onSearch = (e) => {
      setQuery(e.detail || '');
    };
    document.addEventListener('kyoyu-search', onSearch);

    // 3. Check if native already set a pending query before React mounted
    if (window.__kyoyuSearchQuery) {
      setQuery(window.__kyoyuSearchQuery);
    }

    return () => {
      document.removeEventListener('kyoyu-search', onSearch);
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
      fetchPublicTracks(query.trim())
        .then(tracks => {
          setResults(tracks);
        })
        .catch(() => {
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
              <div key={i} className="search-history-item" onClick={() => setQuery(item)}>
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

      {/* No results */}
      {!loading && query.length >= 2 && !hasResults && (
        <div className="search-empty">No results found</div>
      )}
    </div>
  );
}
