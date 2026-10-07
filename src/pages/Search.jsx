import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, X, Download, Heart, ListPlus, Play, UserPlus, UserCheck, ExternalLink, Disc3, Music, Tag, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import { unifiedSearch, resolveBandcamp, searchSingleProvider, categorizeDiscogs, cacheUnifiedResult, prefetchBandcamp } from '../lib/unifiedSearch';
import { rankResults, detectArtistSplit, normalize } from '../lib/searchRanker';
import { analyzeSearch, buildResults, stripInternal } from '../lib/searchOrchestrator';
import { openNativeAlbumFast } from '../components/ui/AlbumSheet';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import ContentStateBadge from '../components/ContentStateBadge';
import EntityPlaceholder from '../components/EntityPlaceholder';
import './Search.css';

function groupHistoryByDay(historyArr) {
  const groups = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  today.setHours(0,0,0,0);
  yesterday.setHours(0,0,0,0);

  const map = new Map();

  historyArr.forEach(item => {
    const date = new Date(item.timestamp);
    date.setHours(0,0,0,0);
    
    let label = date.toLocaleDateString();
    if (date.getTime() === today.getTime()) {
      label = 'Today';
    } else if (date.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else if (date.getTime() === yesterday.getTime() - 86400000) {
      label = `The day before yesterday (${date.toLocaleDateString()})`;
    }

    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label).push(item);
  });
  
  const sortedLabels = Array.from(map.keys()).sort((a, b) => {
    if (a === 'Today') return -1;
    if (b === 'Today') return 1;
    if (a === 'Yesterday') return -1;
    if (b === 'Yesterday') return 1;
    if (a.startsWith('The day before yesterday')) return -1;
    if (b.startsWith('The day before yesterday')) return 1;
    return new Date(map.get(b)[0].timestamp).getTime() - new Date(map.get(a)[0].timestamp).getTime();
  });

  return sortedLabels.map(label => ({
    label,
    items: map.get(label).sort((a, b) => b.timestamp - a.timestamp)
  }));
}

function SwipeableHistoryItem({ item, onClick, onRemove }) {
  const [translateX, setTranslateX] = useState(0);
  const [removed, setRemoved] = useState(false);
  const touchStartRef = useRef(0);

  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    const diff = e.touches[0].clientX - touchStartRef.current;
    if (diff < 0) {
      setTranslateX(diff);
    }
  };

  const handleTouchEnd = () => {
    if (translateX < -100) {
      setTranslateX(-window.innerWidth);
      setRemoved(true);
      setTimeout(onRemove, 300);
    } else {
      setTranslateX(0);
    }
  };

  if (removed) return null;

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Trash Icon */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '32px', color: '#888', zIndex: 0
      }}>
        <Trash2 size={18} />
      </div>

      {/* Foreground Item */}
      <div
        className="search-history-item swipeable-item"
        onClick={onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: translateX === 0 || translateX < -100 ? 'transform 0.3s ease-out' : 'none',
          position: 'relative',
          zIndex: 1,
          backgroundColor: '#000'
        }}
      >
        <Clock size={14} className="search-history-icon" />
        <span className="search-history-text">{item.query}</span>
        <span className="search-history-time">
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

function BandcampLabelResult({ label, onPlay, onGo }) {
  const [releases, setReleases] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bandcamp-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'label-releases', url: label.trackUrl }),
    })
      .then(res => res.json())
      .then(d => { setReleases(d.releases); setLoading(false); })
      .catch(() => setLoading(false));
  }, [label.trackUrl]);

  return (
    <div className="search-label-group" style={{ marginBottom: '16px' }}>
      <div className="search-result-row search-artist-row search-external-row"
        onClick={() => window.open(label.trackUrl, '_blank')}>
        <div className="search-result-art artist-avatar discogs-art">
          {label.artworkUrl ? (
            <img src={label.artworkUrl} alt={label.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
          ) : (
            <EntityPlaceholder name={label.title} type="label" />
          )}
        </div>
        <div className="search-result-info">
          <span className="search-result-title">{label.title}</span>
          <span className="search-result-artist" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '2px' }}>Bandcamp Label</span>
        </div>
      </div>

      {/* Indented Releases List */}
      <div className="search-label-releases" style={{ 
        paddingLeft: '16px', 
        marginLeft: '24px', 
        borderLeft: '2px solid rgba(255,255,255,0.1)', 
        marginTop: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {loading ? (
          <div style={{ fontSize: '12px', opacity: 0.5, padding: '8px 0' }}>Loading releases...</div>
        ) : releases && releases.length > 0 ? (
          releases.map((rel, idx) => (
            <div key={idx} className="search-result-row search-external-row"
              onClick={() => onPlay({
                id: `bc-lbl-${idx}-${Date.now()}`,
                title: rel.title,
                artistName: rel.artist || label.title,
                artworkUrl: rel.artworkUrl,
                duration: 0,
                provider: 'bandcamp',
                providerItemId: rel.url,
              })}>
              <div className="search-result-art discogs-art" style={{ borderRadius: '4px', width: '36px', height: '36px' }}>
                {rel.artworkUrl ? (
                  <img src={rel.artworkUrl} alt={rel.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                ) : (
                  <EntityPlaceholder name={rel.title} type="release" />
                )}
              </div>
              <div className="search-result-info">
                <span className="search-result-title" style={{ fontSize: '14px' }}>{rel.title}</span>
                <span className="search-result-artist" style={{ fontSize: '12px' }}>{rel.artist || label.title}</span>
              </div>
              <div className="search-result-actions">
                <Play size={14} style={{ opacity: 0.6 }} />
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '12px', opacity: 0.5, padding: '8px 0' }}>No releases found.</div>
        )}
      </div>
    </div>
  );
}

function BandcampRecommendations({ trackUrl, onPlay }) {
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch('/api/bandcamp-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recommendations', url: trackUrl }),
    })
      .then(r => r.json())
      .then(d => { setRecs(d.recommendations || []); setLoading(false); })
      .catch(() => { setRecs([]); setLoading(false); });
  }, [trackUrl]);

  if (loading) {
    return <div className="search-loading" style={{ marginTop: '20px', fontSize: '12px' }}>Loading fans also bought...</div>;
  }
  if (!recs || recs.length === 0) return null;

  const currentRecs = recs.slice(page * 10, (page + 1) * 10);
  const hasMore = (page + 1) * 10 < recs.length;

  return (
    <div className="search-results-list search-external-section" style={{ marginTop: '30px' }}>
      <div className="search-section-title search-external-header" style={{ color: '#1DA0C3' }}>
        Fans Also Bought
      </div>
      <div className="search-section">
        {currentRecs.map((rec, idx) => (
          <div key={idx} className="search-result-row search-external-row"
            onClick={() => onPlay({
              id: `bc-rec-${idx}-${Date.now()}`,
              title: rec.title,
              artistName: rec.artistName,
              artworkUrl: rec.artworkUrl,
              duration: 0,
              provider: 'bandcamp',
              providerItemId: rec.trackUrl,
            })}>
            <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
              {rec.artworkUrl ? (
                <img src={rec.artworkUrl} alt={rec.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
              ) : (
                <EntityPlaceholder name={rec.title} type="release" />
              )}
            </div>
            <div className="search-result-info">
              <span className="search-result-title">{rec.title}</span>
              <span className="search-result-artist">{rec.artistName}</span>
            </div>
            <div className="search-result-actions">
              <Play size={16} style={{ opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button 
          onClick={() => setPage(p => p + 1)}
          style={{
            marginTop: '10px', width: '100%', padding: '12px', borderRadius: '8px', 
            background: 'rgba(29, 160, 195, 0.1)', color: '#1DA0C3', border: 'none', 
            fontSize: '14px', fontWeight: 'bold', cursor: 'pointer'
          }}>
          Show next 10 suggestions
        </button>
      )}
    </div>
  );
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState([]);
  const [externalResults, setExternalResults] = useState({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [], spotify: [], applemusic: [] });
  const [loading, setLoading] = useState(false);
  const [bandcampLoading, setBandcampLoading] = useState(null); // trackUrl of currently resolving BC track
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeProvider, setActiveProvider] = useState('all');
  const [providerRetrying, setProviderRetrying] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState({});  // { albumId: tracksArray | true }
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [paginationCursors, setPaginationCursors] = useState({ youtube: {}, soundcloud: {} });
  const [loadingMore, setLoadingMore] = useState({ youtube: false, soundcloud: false });
  const [visibleCount, setVisibleCount] = useState(10); // results rendered so far (first 10 immediately, more on scroll)
  const [playlistSheet, setPlaylistSheet] = useState(null); // { title, artistName, artworkUrl, tracks: [] }
  const [searchExtras, setSearchExtras] = useState({ key: '', artistReleases: null, trackRelease: null }); // intent follow-up data (artist releases by rating, release containing a title)
  const debounceRef = useRef(null);
  const frozenOrderRef = useRef({ key: '', ids: [] });
  const fetchingMoreRef = useRef(false);
  const { isFollowing, toggleFollow } = useLibrary();
  const { playTrack, playYouTube, playSoundCloud, setSearchQueue, playSearchItem } = usePlayer();

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kyoyu-search-history');
      if (raw) {
        let parsed = JSON.parse(raw);
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
          parsed = parsed.map(q => ({ query: q, timestamp: Date.now() }));
        }
        setHistory(parsed);
      }
    } catch {}
  }, []);

  // Register search handlers — multiple pathways for reliability
  useEffect(() => {
    // 1. Override the native-injected stubs with real React state setters
    window.__kyoyuSearchLive = (q) => {
      setQuery(q || '');
    };
    window.__kyoyuSetSearch = (q) => {
      syncNativeSearch(q || '');
      if (q && q.trim().length > 0) {
        setHistory(prev => {
          const cleaned = prev.filter(h => {
            const queryStr = typeof h === 'string' ? h : h.query;
            return queryStr.toLowerCase() !== q.toLowerCase();
          });
          const next = [{ query: q, timestamp: Date.now() }, ...cleaned].slice(0, 20);
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

    // 3. Listen for filter changes from native SearchFilterBar
    const onFilter = (e) => {
      setActiveFilter(e.detail || 'all');
    };
    document.addEventListener('kyoyu-search-filter', onFilter);

    // 3b. Listen for provider filter changes from native SearchProviderFilterBar
    const onProviderFilter = (e) => {
      setActiveProvider(e.detail || 'all');
    };
    document.addEventListener('kyoyu-provider-filter', onProviderFilter);

    // 4. Check if native already set a pending query before React mounted
    if (window.__kyoyuSearchQuery) {
      setQuery(window.__kyoyuSearchQuery);
    }
    if (window.__kyoyuSearchFilter) {
      setActiveFilter(window.__kyoyuSearchFilter);
    }
    if (window.__kyoyuProviderFilter) {
      setActiveProvider(window.__kyoyuProviderFilter);
    }

    // 5. Listen for exact keyboard height changes
    const onKeyboard = (e) => {
      const newHeight = e.detail || 0;
      setKeyboardHeight(prevHeight => {
        const oldPadding = prevHeight > 0 ? prevHeight + 128 : 128;
        const newPadding = newHeight > 0 ? newHeight + 128 : 128;
        const paddingDiff = newPadding - oldPadding;
        
        // If padding increased (keyboard opened/grew), scroll down to push content up smoothly
        if (paddingDiff > 0) {
          setTimeout(() => {
            const scrollContainer = document.querySelector('.main-content');
            if (scrollContainer) {
              scrollContainer.scrollBy({ top: paddingDiff, behavior: 'smooth' });
            }
          }, 50); // slight delay to allow React to apply the new padding first
        }
        return newHeight;
      });
    };
    window.addEventListener('kyoyu-keyboard-change', onKeyboard);

    return () => {
      document.removeEventListener('kyoyu-search', onSearch);
      document.removeEventListener('kyoyu-search-filter', onFilter);
      document.removeEventListener('kyoyu-provider-filter', onProviderFilter);
      window.removeEventListener('kyoyu-keyboard-change', onKeyboard);
    };
  }, []);

  // Override .main-content padding dynamically for perfect alignment
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      // 114px is the top of the filter card. 128px padding creates a perfect 14px gap.
      // When open, the filter card moves up by keyboardHeight, so we add exactly that!
      const paddingStyle = keyboardHeight > 0 
        ? (keyboardHeight + 128) + 'px' 
        : '128px';
      mainContent.style.paddingBottom = paddingStyle;
      mainContent.style.transition = 'padding-bottom 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
    }

    return () => {
      // Clear inline styles when leaving the search page
      if (mainContent) {
        mainContent.style.paddingBottom = '';
        mainContent.style.transition = '';
      }
    };
  }, [keyboardHeight]);

  // Debounced search — fires on every query change
  useEffect(() => {
    let ignore = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length === 0) {
      setResults([]);
      setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [], spotify: [], applemusic: [] });
      setVisibleCount(10);
      setLoading(false);
      return () => { ignore = true; };
    }

    setLoading(true);
    const q = query.trim();

    // Discogs / Bandcamp decide the result order. If either failed (rate limit, timeout…),
    // keep retrying it in the background and merge it in — the ordering re-applies automatically.
    const RETRY_DELAYS = [1200, 3000, 6000];
    const retryMissing = async (failed, snapshot, attempt = 0) => {
      if (ignore || !failed.length || attempt >= RETRY_DELAYS.length) return;
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      if (ignore) return;
      const stillFailed = [];
      await Promise.all(failed.map(async (prov) => {
        try {
          const { results: fresh, pagination } = await searchSingleProvider(prov, q);
          if (ignore) return;
          if (!fresh || fresh.length === 0) { stillFailed.push(prov); return; }
          const patch = prov === 'bandcamp' ? { bandcamp: fresh } : categorizeDiscogs(fresh);
          snapshot.external = { ...snapshot.external, ...patch };
          if (prov === 'discogs' && pagination) snapshot.pagination = { ...snapshot.pagination, discogs: pagination };
          frozenOrderRef.current = { key: '', ids: [] };
          setExternalResults(prev => ({ ...prev, ...patch }));
          if (prov === 'discogs' && pagination) setPaginationCursors(prev => ({ ...prev, discogs: pagination }));
        } catch (e) { stillFailed.push(prov); }
      }));
      if (ignore) return;
      if (stillFailed.length) retryMissing(stillFailed, snapshot, attempt + 1);
      else cacheUnifiedResult(q, { ...snapshot, failed: [] });
    };

    debounceRef.current = setTimeout(() => {
      unifiedSearch(q)
        .then(({ nativeTracks, external, pagination, failed }) => {
          if (ignore) return;
          setResults(nativeTracks);
          setExternalResults(external);
          setVisibleCount(10);
          setPaginationCursors(pagination || { youtube: {}, soundcloud: {} });
          if (failed?.length) {
            console.warn('[Search] retrying providers that failed:', failed);
            retryMissing(failed, { nativeTracks, external, pagination });
          }
        })
        .catch(() => {
          if (ignore) return;
          setResults([]);
          setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [], spotify: [], applemusic: [] });
          setVisibleCount(10);
          setPaginationCursors({ youtube: {}, soundcloud: {} });
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 250); // wait for a short typing pause so every keystroke doesn't fire 4 provider searches

    return () => {
      ignore = true;
      clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Provider filter retry: if user switches to a provider with empty results, retry ──
  useEffect(() => {
    if (activeProvider === 'all' || !query || query.trim().length === 0) return;
    
    // Check if the selected provider currently has empty results
    const providerKey = activeProvider; // 'youtube', 'soundcloud', 'bandcamp', 'discogs'
    let hasResults = false;
    if (providerKey === 'youtube') hasResults = externalResults.youtube?.length > 0;
    else if (providerKey === 'soundcloud') hasResults = externalResults.soundcloud?.length > 0;
    else if (providerKey === 'bandcamp') hasResults = externalResults.bandcamp?.length > 0;
    else if (providerKey === 'spotify') hasResults = externalResults.spotify?.length > 0;
    else if (providerKey === 'applemusic') hasResults = externalResults.applemusic?.length > 0;
    else if (providerKey === 'discogs') hasResults = externalResults.artists?.length > 0 || externalResults.releases?.length > 0 || externalResults.labels?.length > 0;
    
    if (hasResults) return; // Already have results, no need to retry
    
    let ignore = false;
    setProviderRetrying(true);
    
    searchSingleProvider(providerKey, query.trim())
      .then(({ results: freshResults, pagination }) => {
        if (ignore || !freshResults || freshResults.length === 0) return;
        
        setExternalResults(prev => {
          const next = { ...prev };
          if (providerKey === 'youtube') next.youtube = freshResults;
          else if (providerKey === 'soundcloud') next.soundcloud = freshResults;
          else if (providerKey === 'bandcamp') next.bandcamp = freshResults;
          else if (providerKey === 'spotify') next.spotify = freshResults;
          else if (providerKey === 'applemusic') next.applemusic = freshResults;
          else if (providerKey === 'discogs') {
            // Same categorization as the main search (artist / release title split, entity types)
            const { artists, releases, labels } = categorizeDiscogs(freshResults);
            if (artists.length > 0) next.artists = [...next.artists, ...artists];
            if (labels.length > 0) next.labels = [...next.labels, ...labels];
            if (releases.length > 0) next.releases = [...next.releases, ...releases];
          }
          return next;
        });
        if (pagination) {
          setPaginationCursors(prev => ({ ...prev, [providerKey]: pagination }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!ignore) setProviderRetrying(false); });
    
    return () => { ignore = true; };
  }, [activeProvider]);


  // ── Load More: fetch next 33 results for a specific provider ──
  async function loadMoreResults(providerKey) {
    if (!query || query.trim().length === 0) return;
    const cursor = paginationCursors[providerKey];
    if (!cursor) return;
    // Check if there's more to load
    if (providerKey === 'youtube' && !cursor.nextPageToken) return;
    if (providerKey === 'soundcloud' && !cursor.hasMore) return;
    if (providerKey === 'discogs' && !cursor.hasMore) return;

    setLoadingMore(prev => ({ ...prev, [providerKey]: true }));
    try {
      const { results: moreResults, pagination } = await searchSingleProvider(providerKey, query.trim(), cursor);
      if (moreResults && moreResults.length > 0) {
        setExternalResults(prev => {
          const next = { ...prev };
          if (providerKey === 'discogs') {
            next.artists = [...(next.artists || [])];
            next.labels = [...(next.labels || [])];
            next.releases = [...(next.releases || [])];
            moreResults.forEach(r => {
              if (r.type === 'artist') {
                if (!next.artists.find(a => a.id === r.id)) next.artists.push({ ...r, name: r.title, entityType: 'artist' });
              } else if (r.type === 'label') {
                if (!next.labels.find(a => a.id === r.id)) next.labels.push({ ...r, name: r.title, entityType: 'label' });
              } else {
                if (!next.releases.find(a => a.id === r.id)) {
                  let artist = '';
                  let release = r.title;
                  const parts = r.title.split(' - ');
                  if (parts.length >= 2) {
                    artist = parts[0].trim();
                    release = parts.slice(1).join(' - ').trim();
                  }
                  next.releases.push({ ...r, releaseName: release, artistName: artist, entityType: 'release' });
                }
              }
            });
          } else {
            // Deduplicate by ID before appending
            const existingIds = new Set((next[providerKey] || []).map(r => r.id));
            const fresh = moreResults.filter(r => !existingIds.has(r.id));
            next[providerKey] = [...(next[providerKey] || []), ...fresh];
          }
          return next;
        });
      }
      if (pagination) {
        setPaginationCursors(prev => ({ ...prev, [providerKey]: pagination }));
      }
    } catch (err) {
      console.warn(`Load more ${providerKey} failed:`, err);
    } finally {
      setLoadingMore(prev => ({ ...prev, [providerKey]: false }));
    }
  }

  
  async function loadMoreAll() {
    const providersToLoad = activeProvider === 'all' 
      ? ['bandcamp', 'soundcloud', 'youtube', 'discogs', 'spotify', 'applemusic']
      : [activeProvider];
    await Promise.all(providersToLoad.map(p => loadMoreResults(p)));
  }

  function syncNativeSearch(text) {
    setQuery(text);
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.searchSync) {
      window.webkit.messageHandlers.searchSync.postMessage(text);
    }
  }

  const removeHistoryItem = (timestamp) => {
    const next = history.filter(item => item.timestamp !== timestamp);
    setHistory(next);
    localStorage.setItem('kyoyu-search-history', JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('kyoyu-search-history');
  };

  // Build a unified search queue from all visible external results (in display order)
  function buildSearchQueue() {
    const queue = [];
    // YouTube results
    if (externalResults.youtube) {
      for (const yt of externalResults.youtube) {
        queue.push({
          id: yt.id || `yt-${yt.videoId}`,
          title: yt.title,
          artistName: yt.channelTitle,
          artworkUrl: yt.thumbnail,
          duration: yt.duration || 0,
          provider: 'youtube',
          providerItemId: yt.videoId,
        });
      }
    }
    // SoundCloud results
    if (externalResults.soundcloud) {
      for (const sc of externalResults.soundcloud) {
        queue.push({
          id: sc.id || `sc-${sc.trackId}`,
          title: sc.title,
          artistName: sc.artistName,
          artworkUrl: sc.artworkUrl,
          duration: sc.duration || 0,
          provider: 'soundcloud',
          providerItemId: sc.permalinkUrl,
          scTrackId: sc.trackId,
        });
      }
    }
    // Bandcamp results
    if (externalResults.bandcamp) {
      for (const bc of externalResults.bandcamp) {
        queue.push({
          id: bc.id || `bc-${bc.trackId}`,
          title: bc.title,
          artistName: bc.artistName,
          artworkUrl: bc.artworkUrl,
          duration: 0,
          provider: 'bandcamp',
          providerItemId: bc.trackUrl,
        });
      }
    }
    // Spotify results
    if (externalResults.spotify) {
      for (const sp of externalResults.spotify) {
        queue.push({
          id: sp.id,
          title: sp.title,
          artistName: sp.artistName,
          artworkUrl: sp.artworkUrl,
          duration: sp.duration,
          provider: 'spotify',
          providerItemId: sp.spotifyId,
        });
      }
    }
    // Apple Music results
    if (externalResults.applemusic) {
      for (const am of externalResults.applemusic) {
        queue.push({
          id: am.id,
          title: am.title,
          artistName: am.artistName,
          artworkUrl: am.artworkUrl,
          duration: am.duration,
          provider: 'applemusic',
          providerItemId: am.trackId,
        });
      }
    }
    return queue;
  }

  // Play a search result and set up the queue for next/prev
  function handleSearchPlay(item) {
    const queue = buildSearchQueue();
    const idx = queue.findIndex(q => q.id === item.id);
    setSearchQueue(queue, idx >= 0 ? idx : 0);
    playSearchItem(item);
    window.__kyoyuPlayerCmd?.('expand');
  }

  // Process and Group Results
  const q = query.toLowerCase();
  
  const albumMap = new Map();
  const artistMap = new Map();
  const labelMap = new Map();
  const titleList = [];
  const podcastList = [];

  results.forEach(track => {
    const matchAlbum = (track.album || '').toLowerCase().includes(q);
    const matchArtist = track.artist.toLowerCase().includes(q);
    const matchLabel = (track.label || '').toLowerCase().includes(q);
    const matchTitle = track.title.toLowerCase().includes(q);
    const isPodcast = (track.genre || '').toLowerCase().includes('podcast');

    if (matchAlbum && track.album) {
      if (!albumMap.has(track.album)) albumMap.set(track.album, track);
    }
    if (matchArtist && track.artist) {
      const key = track.artistId || track.artist;
      if (!artistMap.has(key)) artistMap.set(key, track);
    }
    if (matchLabel && track.label) {
      if (!labelMap.has(track.label)) labelMap.set(track.label, track);
    }
    if (isPodcast && matchTitle) {
      podcastList.push(track);
    }
    if (matchTitle && !isPodcast) {
      titleList.push(track);
    }
  });

  const albums = Array.from(albumMap.values());
  const artists = Array.from(artistMap.values());
  const labels = Array.from(labelMap.values());

  const hasResults = results.length > 0;
  const hasExternal = externalResults.artists.length > 0 || externalResults.releases.length > 0 || externalResults.labels.length > 0 || (externalResults.youtube && externalResults.youtube.length > 0) || (externalResults.soundcloud && externalResults.soundcloud.length > 0) || (externalResults.bandcamp && externalResults.bandcamp.length > 0) || (externalResults.spotify && externalResults.spotify.length > 0) || (externalResults.applemusic && externalResults.applemusic.length > 0);

  const canFetchMore = Object.values(paginationCursors).some(c => c.hasMore || c.nextPageToken);
  const isLoadingMore = Object.values(loadingMore).some(Boolean);

  const isQueryEmpty = query.trim().length === 0;
  const showHistory = isQueryEmpty;

  // Multi-select filter helpers
  const filterMatch = (key) => activeFilter === 'all' || activeFilter.split(',').includes(key);
  const providerMatch = (key) => activeProvider === 'all' || activeProvider.split(',').includes(key);

  // ── Build unified result list across all providers ──
  // Tag every item with its provider and normalize fields
  // Category filtering is applied to the final ordered list (see orderedAll)
  const bcItems = externalResults.bandcamp || [];

  const allExternal = [
    ...(providerMatch('youtube') ? (externalResults.youtube || []).map(yt => ({
      ...yt, artistName: yt.channelTitle || yt.artistName, entityType: 'track', provider: 'youtube',
    })) : []),
    ...(providerMatch('soundcloud') ? (externalResults.soundcloud || []).map(sc => ({
      ...sc, entityType: 'track', provider: sc.provider || 'soundcloud',
    })) : []),
    ...(providerMatch('soundcloud') ? (externalResults.soundcloudPlaylists || []).map(pl => ({
      ...pl, entityType: 'playlist', provider: 'soundcloud',
    })) : []),
    ...(providerMatch('bandcamp') ? bcItems.map(bc => ({
      ...bc, entityType: bc.entityType || bc.type || 'track', provider: bc.provider || 'bandcamp',
    })) : []),
    ...(providerMatch('spotify') ? (externalResults.spotify || []).map(sp => ({
      ...sp, entityType: sp.entityType || 'track', provider: sp.provider || 'spotify',
    })) : []),
    ...(providerMatch('applemusic') ? (externalResults.applemusic || []).map(am => ({
      ...am, entityType: am.entityType || 'track', provider: am.provider || 'applemusic',
    })) : []),
    ...(providerMatch('discogs') ? (externalResults.artists || []).map(a => ({
      ...a, title: a.name || a.title, artistName: a.name || a.title, entityType: 'artist', provider: 'discogs',
    })) : []),
    ...(providerMatch('discogs') ? (externalResults.releases || []).map(r => ({
      ...r, title: r.releaseName || r.title, entityType: 'release', provider: 'discogs',
    })) : []),
    ...(providerMatch('discogs') ? (externalResults.labels || []).map(l => ({
      ...l, title: l.name || l.title, artistName: l.name || l.title, entityType: 'label', provider: 'discogs',
    })) : []),
  ];

  // ── Intent-aware ordering: one result per title / album / artist ──
  // With all providers: detect artist / release / title intent and order accordingly.
  // With a single provider selected: plain relevance order, deduped within that provider.
  const searchAnalysis = (() => {
    const a = analyzeSearch(query, allExternal);
    return activeProvider === 'all' ? a : { ...a, intent: 'general' };
  })();

  // Follow-up fetch key: artist → releases sorted by rating; title → Discogs release containing it
  let extrasKey = '';
  if (searchAnalysis.intent === 'artist') {
    extrasKey = `artist|${searchAnalysis.discogsArtist?.discogsId || ''}|${searchAnalysis.artistPick._ent.title}`;
  } else if (searchAnalysis.intent === 'title' && searchAnalysis.bestTrack && !searchAnalysis.instantRelease) {
    extrasKey = `title|${searchAnalysis.bestTrack._ent.artist}|${searchAnalysis.bestTrack._ent.title}`;
  }
  const activeExtras = searchExtras.key && searchExtras.key === extrasKey ? searchExtras : {};

  const categoryOf = (item) => {
    const et = (item.entityType || 'track').toLowerCase();
    if (et === 'artist') return 'artists';
    if (et === 'label') return 'labels';
    if (et === 'release' || et === 'album' || et === 'playlist') return 'albums';
    return 'titles';
  };
  const orderedAll = stripInternal(buildResults(query, searchAnalysis, activeExtras))
    .filter(item => activeFilter === 'all' || filterMatch(categoryOf(item)));

  // Keep the order of already-loaded results stable when more provider pages arrive
  // (otherwise rows would jump around above the user while they scroll).
  const orderKey = `${query}|${activeFilter}|${activeProvider}|${searchExtras.key}`;
  let displayAll = orderedAll;
  if (frozenOrderRef.current.key === orderKey && frozenOrderRef.current.ids.length > 0) {
    const byId = new Map(orderedAll.map(i => [i.id, i]));
    const frozenIds = new Set(frozenOrderRef.current.ids);
    displayAll = [
      ...frozenOrderRef.current.ids.map(id => byId.get(id)).filter(Boolean),
      ...orderedAll.filter(i => !frozenIds.has(i.id)),
    ];
  }
  const rankedAll = displayAll.slice(0, visibleCount);

  // Warm the Bandcamp stream for the top Bandcamp titles on screen, so tapping one starts instantly
  const isBcTrack = (i) => i.provider === 'bandcamp' && (i.entityType || 'track') === 'track' && /^https?:\/\//.test(i.trackUrl || '');
  const bcPrefetchKey = rankedAll.filter(isBcTrack).slice(0, 4).map(i => i.trackUrl).join('|');
  useEffect(() => {
    if (!bcPrefetchKey) return;
    const t = setTimeout(() => bcPrefetchKey.split('|').forEach(u => prefetchBandcamp(u)), 250);
    return () => clearTimeout(t);
  }, [bcPrefetchKey]);
  const hasMoreToShow = visibleCount < displayAll.length || canFetchMore;

  // Infinite scroll: reveal 20 more rows when the user nears the bottom; when everything
  // loaded is shown, fetch the next page from the providers.
  const scrollStateRef = useRef({});
  scrollStateRef.current = { visibleCount, total: displayAll.length, canFetchMore, isLoadingMore, orderKey, ids: displayAll.map(i => i.id) };
  useEffect(() => {
    const container = document.querySelector('.main-content');
    if (!container) return;
    const check = () => {
      const st = scrollStateRef.current;
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 500;
      if (!nearBottom || !st.total) return;
      if (st.visibleCount < st.total) {
        setVisibleCount(c => c + 20);
      } else if (st.canFetchMore && !st.isLoadingMore && !fetchingMoreRef.current) {
        fetchingMoreRef.current = true;
        frozenOrderRef.current = { key: st.orderKey, ids: st.ids };
        loadMoreAll().finally(() => {
          fetchingMoreRef.current = false;
          setVisibleCount(c => c + 20); // show the newly fetched results right away
        });
      }
    };
    container.addEventListener('scroll', check, { passive: true });
    return () => container.removeEventListener('scroll', check);
  }, [query, activeProvider, paginationCursors]);

  // If the first rows don't fill the screen (nothing to scroll), reveal more until they do
  useEffect(() => {
    const container = document.querySelector('.main-content');
    if (!container) return;
    if (container.scrollHeight <= container.clientHeight + 40 && visibleCount < displayAll.length) {
      setVisibleCount(c => c + 20);
    }
  }, [rankedAll.length, displayAll.length]);

  // Reset to the first 10 results whenever the result set itself changes
  useEffect(() => {
    setVisibleCount(10);
    frozenOrderRef.current = { key: '', ids: [] };
    const container = document.querySelector('.main-content');
    if (container) container.scrollTop = 0;
  }, [query, activeFilter, activeProvider]);

  useEffect(() => {
    if (!extrasKey) return;
    let ignore = false;
    const [kind, a, b] = extrasKey.split('|');
    const timer = setTimeout(async () => {
      try {
        const body = kind === 'artist'
          ? { action: 'artist-top-releases', artistId: a || null, artistName: b }
          : { action: 'track-release', artist: a, title: b };
        const r = await fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok || ignore) return;
        const d = await r.json();
        if (ignore) return;
        setSearchExtras(kind === 'artist'
          ? { key: extrasKey, artistReleases: d.releases || [], trackRelease: null }
          : { key: extrasKey, artistReleases: null, trackRelease: d.release || null });
      } catch (e) { /* keep interim results */ }
    }, 350);
    return () => { ignore = true; clearTimeout(timer); };
  }, [extrasKey]);

  // Provider icon colors
  const providerColors = { bandcamp: '#1da0c3', soundcloud: '#FF5500', youtube: '#FF0000', discogs: 'rgba(255,255,255,0.7)', spotify: '#1DB954', applemusic: '#FA243C' };

  // Inline provider logo SVGs
  const providerIcons = {
    soundcloud: <img src="/icons/soundcloud_light_24x24.png" alt="SoundCloud" width="14" height="14" style={{ flexShrink: 0 }} />,
    bandcamp: <img src="/icons/bandcamp_light_24x24.png" alt="Bandcamp" width="14" height="14" style={{ flexShrink: 0 }} />,
    youtube: <img src="/icons/youtube_light_24x24.png" alt="YouTube" width="14" height="14" style={{ flexShrink: 0 }} />,
    discogs: <img src="/icons/discogs_light_24x24.png" alt="Discogs" width="14" height="14" style={{ flexShrink: 0 }} />,
    spotify: <img src="/icons/spotify_light_24x24.png" alt="Spotify" width="14" height="14" style={{ flexShrink: 0 }} />,
    applemusic: <img src="/icons/apple_light_24x24.png" alt="Apple Music" width="14" height="14" style={{ flexShrink: 0 }} />,
  };

  // Entity type display labels
  const entityLabel = (item) => {
    if (item.entityType === 'playlist') return 'Playlist';
    if (item.entityType === 'artist') return 'Artist';
    if (item.entityType === 'label') return 'Label';
    if (item.entityType === 'release' || item.entityType === 'album') return 'Album';
    return 'Title';
  };

  // Check if a single provider is selected
  const singleProvider = activeProvider !== 'all' && !activeProvider.includes(',') ? activeProvider : null;

  // Renderers
  const renderTrackRow = (track, isPodcast = false) => (
    <div key={track.id} className="search-result-row">
      <div className="search-result-art">
        {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder" />}
      </div>
      <div className="search-result-info">
        <span className="search-result-title">{track.title}</span>
        {track.album && track.album !== track.title && !isPodcast && (
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
        <button className="search-action-btn search-play-btn" title="Play" onClick={() => playTrack(track, [track])}>
          <Play size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  );

  const renderAlbumRow = (track) => (
    <div key={`album-${track.album}`} className="search-result-row">
      <div className="search-result-art">
        {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder" />}
      </div>
      <div className="search-result-info">
        <span className="search-result-title">{track.album}</span>
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
        <button className="search-action-btn search-play-btn" title="Play Album" onClick={() => playTrack(track, [track])}>
          <Play size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  );

  const renderArtistRow = (track) => {
    const aid = track.artistId || track.artist;
    const following = isFollowing(aid);
    const avatar = track.profileAvatar || track.cover;
    const name = track.profileName || track.artist;

    return (
      <div key={`artist-${aid}`} className="search-result-row search-artist-row">
        <div className="search-result-art artist-avatar">
          {avatar ? <img src={avatar} alt="" /> : <div className="search-result-art-placeholder circle" />}
        </div>
        <div className="search-result-info">
          <span className="search-result-title">{name}</span>
        </div>
        <div className="search-result-actions">
          <button className={`search-action-btn search-follow-btn ${following ? 'following' : ''}`} title="Follow" onClick={() => toggleFollow(aid)}>
            {following ? <UserCheck size={16} strokeWidth={2.5} /> : <UserPlus size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    );
  };

  const renderLabelRow = (track) => {
    const lid = track.label;
    const following = isFollowing(lid); // Using same follow logic for now

    return (
      <div key={`label-${lid}`} className="search-result-row search-artist-row">
        <div className="search-result-art artist-avatar">
          {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder circle" />}
        </div>
        <div className="search-result-info">
          <span className="search-result-title">{track.label}</span>
        </div>
        <div className="search-result-actions">
          <button className={`search-action-btn search-follow-btn ${following ? 'following' : ''}`} title="Follow" onClick={() => toggleFollow(lid)}>
            {following ? <UserCheck size={16} strokeWidth={2.5} /> : <UserPlus size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page search-page animate-in" style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 80}px` : undefined }}>

      {/* Spacer for native filter overlay */}
      <div style={{ height: '80px' }} />

      {/* Search History — shown when no active query */}
      {showHistory && (
        <div className="search-history">
          <div className="search-history-header">
            <span className="search-history-title">Recent</span>
            {history.length > 0 && (
              <button className="search-history-clear" onClick={clearHistory}>Clear All</button>
            )}
          </div>
          {history.length > 0 ? (
            <div className="search-history-list">
              {groupHistoryByDay(history).map(group => (
                <div key={group.label} className="search-history-group">
                  <div className="search-history-group-label">{group.label}</div>
                  {group.items.map(item => (
                    <SwipeableHistoryItem
                      key={item.timestamp}
                      item={item}
                      onClick={() => syncNativeSearch(item.query)}
                      onRemove={() => removeHistoryItem(item.timestamp)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', fontSize: '0.9rem', fontWeight: 500 }}>
              No recent searches
            </div>
          )}
        </div>
      )}

      {/* Live Results List */}
      {!isQueryEmpty && hasResults && (
        <div className="search-results-list">
          
          {filterMatch('albums') && albums.length > 0 && (
            <div className="search-section">
              {<div className="search-section-title">Albums</div>}
              {albums.map(renderAlbumRow)}
            </div>
          )}

          {/* Native Tracks */}
          {!isQueryEmpty && hasResults && filterMatch('titles') && titleList.length > 0 && (
            <div className="search-section">
              {<div className="search-section-title">Titles</div>}
              {titleList.map(t => renderTrackRow(t, false))}
            </div>
          )}

          {filterMatch('artists') && artists.length > 0 && (
            <div className="search-section">
              {<div className="search-section-title">Artists</div>}
              {artists.map(renderArtistRow)}
            </div>
          )}

          {filterMatch('labels') && labels.length > 0 && (
            <div className="search-section">
              {<div className="search-section-title">Labels</div>}
              {labels.map(renderLabelRow)}
            </div>
          )}

          {filterMatch('podcasts') && podcastList.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">Sets</div>
              {podcastList.map(t => renderTrackRow(t, true))}
            </div>
          )}

        </div>
      )}

      {/* Loading state */}
      {(loading || providerRetrying) && query.length > 0 && !hasResults && !hasExternal && (
        <div className="search-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <Loader2 className="spin-icon" size={28} color="rgba(255,255,255,0.4)" />
          <span>{providerRetrying ? 'Loading results...' : 'Searching...'}</span>
        </div>
      )}

      {/* No results */}
      {!loading && !providerRetrying && query.length > 0 && !hasResults && !hasExternal && (
        <div className="search-empty">No results found</div>
      )}

      {/* ── Unified Results (all providers merged by relevance) ── */}
      {!isQueryEmpty && rankedAll.length > 0 && (
        <div className="search-results-list search-external-section">
          {rankedAll.map(item => {
            const pColor = providerColors[item.provider] || '#fff';
            const isPlaylist = item.entityType === 'playlist';
            const isArtist = item.entityType === 'artist';
            const isLabel = item.entityType === 'label';
            const isRelease = item.entityType === 'release' || item.entityType === 'album';

            return (
              <div key={item.id || `${item.provider}-${item.title}-${Math.random()}`}
                className="search-result-row search-external-row"
                onPointerDown={() => { if (isBcTrack(item)) prefetchBandcamp(item.trackUrl, item.title); }}
                onClick={async () => {
                  if (isPlaylist && item.tracks) {
                    setPlaylistSheet(item);
                  } else if ((item.provider === 'spotify' || item.provider === 'applemusic') && isArtist) {
                    if (item.url) window.open(item.url, '_blank');
                  } else if (isRelease) {
                    // Universal Album Sheet: fetch tracks from provider, info from Discogs
                    try {
                      let tracks = [];
                      if (item.provider === 'bandcamp') {
                        const r = await fetch('/api/bandcamp-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'fetch-album', albumUrl: item.trackUrl }),
                        });
                        if (r.ok) tracks = (await r.json()).tracks.map(t => ({ ...t, id: `bc-${t.trackId}`, url: t.streamUrl, trackUrl: t.trackUrl, providerItemId: t.trackUrl, cover: t.artworkUrl || item.artworkUrl || '' }));
                      } else if (item.provider === 'spotify') {
                        const r = await fetch('/api/youtube-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'fetch-spotify-album', provider: 'spotify', albumId: item.id }),
                        });
                        if (r.ok) tracks = (await r.json()).tracks.map(t => ({ ...t, providerItemId: t.spotifyId }));
                      } else if (item.provider === 'applemusic') {
                        const amId = item.id.replace('am-al-', '');
                        const r = await fetch(`https://itunes.apple.com/lookup?id=${amId}&entity=song`);
                        if (r.ok) {
                          const data = await r.json();
                          tracks = data.results.slice(1).map(t => ({ id: `am-${t.trackId}`, title: t.trackName, artist: t.artistName, duration: Math.floor(t.trackTimeMillis / 1000), provider: 'applemusic', providerItemId: String(t.trackId) }));
                        }
                      }
                      
                      let info = {};
                      if (item.provider !== 'discogs') {
                        const rInfo = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'track-info', title: item.title, artist: item.artistName || '', album: item.title }),
                        });
                        if (rInfo.ok) info = await rInfo.json();
                      } else {
                        const rInfo = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'track-info', title: item.title, artist: item.artistName || '', album: item.title, discogsReleaseId: item.id }),
                        });
                        if (rInfo.ok) info = await rInfo.json();
                        tracks = (info.tracklist || []).map((t, i) => ({
                          id: `discogs-track-${i}`,
                          title: `${t.position ? t.position + '. ' : ''}${t.title || ''}`,
                          artist: t.artists?.join(', ') || info.artist || item.artistName || '',
                          url: `resolve:${t.artists?.join(', ') || info.artist || item.artistName || ''} ${t.title || ''}`,
                          provider: '',
                        }));
                      }

                      const formatLinks = (links) => {
                        if (!links || !links.length) return '';
                        const md = links.map(l => {
                           let name = l.name.toLowerCase();
                           let url = l.url.toLowerCase();
                           let label = l.name;
                           if (url.includes('discogs.com') || name.includes('discogs')) label = 'Discogs';
                           else if (url.includes('musicbrainz.org') || name.includes('musicbrainz')) label = 'MusicBrainz';
                           else if (url.includes('bandcamp.com') || name.includes('bandcamp')) label = 'Bandcamp';
                           else if (url.includes('instagram.com') || name.includes('instagram')) label = 'Instagram';
                           else if (url.includes('soundcloud.com') || name.includes('soundcloud')) label = 'SoundCloud';
                           else if (url.includes('youtube.com') || name.includes('youtube')) label = 'YouTube';
                           else label = 'Website';
                           return `[${label}](${l.url})`;
                        });
                        const uniqueMd = [];
                        const seen = new Set();
                        for (const m of md) {
                          const label = m.match(/\[(.*?)\]/)[1];
                          if (!seen.has(label)) { seen.add(label); uniqueMd.push(m); }
                        }
                        return `\nLinks:\n${uniqueMd.join('  •  ')}`;
                      };

                      const aliases = info.artistAliases?.length ? `Aliases: ${info.artistAliases.join(', ')}` : '';
                      const bioText = info.artistBio ? `\nAbout the artist:\n${info.artistBio}${aliases ? '\n' + aliases : ''}` : (aliases ? `\nAbout the artist:\n${aliases}` : '');
                      const desc = [
                        info.formats?.length ? `Format: ${info.formats.join(' / ')}` : '',
                        info.country ? `Country: ${info.country}` : '',
                        info.description || '',
                        info.credits?.mixing?.length ? `Mixed by: ${info.credits.mixing.join(', ')}` : '',
                        info.credits?.mastering?.length ? `Mastered by: ${info.credits.mastering.join(', ')}` : '',
                        bioText,
                        formatLinks(info.links)
                      ].filter(Boolean).join('\n');

                      openNativeAlbumFast({
                        id: item.id || `album-${item.title}`,
                        title: info.album || item.title || '',
                        artist: info.artist || item.artistName || '',
                        cover: item.coverImage || item.artworkUrl || item.thumbnail || item.thumb || '',
                        year: info.year || item.year || null,
                        genre: info.genre || '',
                        label: info.label || '',
                        provider: item.provider,
                        description: desc,
                        tracks: tracks,
                      });
                    } catch (e) { /* ignore */ }
                  } else if (!isArtist && !isLabel) {
                    handleSearchPlay({
                      id: item.id || `${item.provider}-${item.trackId || item.videoId}`,
                      title: item.title,
                      artistName: item.artistName,
                      artworkUrl: item.artworkUrl || item.thumbnail,
                      duration: item.duration || 0,
                      provider: item.provider,
                      providerItemId: item.permalinkUrl || item.trackUrl,
                      scTrackId: item.trackId,
                      videoId: item.videoId,
                    });
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="search-result-art discogs-art" style={{ borderRadius: isArtist || isLabel ? '50%' : '6px' }}>
                  {(item.coverImage || item.artworkUrl || item.thumbnail || item.thumb) ? (
                    <img src={item.coverImage || item.artworkUrl || item.thumbnail || item.thumb} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                  ) : (
                    <EntityPlaceholder name={item.title} type={isArtist ? 'artist' : isLabel ? 'label' : 'release'} />
                  )}
                </div>
                <div className="search-result-info">
                  <span className="search-result-title">{item.title}</span>
                  <span className="search-result-artist">
                    {item.artistName || ''}
                    {isPlaylist ? ` · ${item.trackCount || 0} tracks` : ''}
                    {(item.year || item.released) ? ` · ${item.year || item.released}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 11, opacity: 0.7 }}>
                    {providerIcons[item.provider] || null}
                    <span style={{ opacity: 0.7 }}>{entityLabel(item)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {!isQueryEmpty && rankedAll.length > 0 && hasMoreToShow && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0', color: 'rgba(255,255,255,0.4)' }}>
          {isLoadingMore ? <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : null}
        </div>
      )}

      {playlistSheet && (
        <div className="search-playlist-sheet" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', padding: '60px 16px 20px',
          overflowY: 'auto',
        }}>
          <button onClick={() => setPlaylistSheet(null)} style={{
            position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff',
            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {playlistSheet.artworkUrl && (
              <img src={playlistSheet.artworkUrl} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
            )}
            <div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{playlistSheet.title}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{playlistSheet.artistName} · {playlistSheet.trackCount} tracks</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(playlistSheet.tracks || []).map((t, i) => (
              <div key={t.trackId || i} className="search-result-row search-external-row"
                onClick={() => {
                  handleSearchPlay({
                    id: `sc-${t.trackId}`,
                    title: t.title,
                    artistName: t.artistName,
                    artworkUrl: t.artworkUrl,
                    duration: t.duration || 0,
                    provider: 'soundcloud',
                    providerItemId: t.permalinkUrl,
                    scTrackId: t.trackId,
                  });
                }}>
                <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
                  {t.artworkUrl ? (
                    <img src={t.artworkUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 'inherit' }} />
                  )}
                </div>
                <div className="search-result-info">
                  <span className="search-result-title">{t.title}</span>
                  <span className="search-result-artist">{t.artistName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
