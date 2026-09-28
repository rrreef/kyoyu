import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, X, Download, Heart, ListPlus, Play, UserPlus, UserCheck, ExternalLink, Disc3, Music, Tag, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import { unifiedSearch, resolveBandcamp, searchSingleProvider } from '../lib/unifiedSearch';
import { rankResults, detectArtistSplit, normalize } from '../lib/searchRanker';
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
  const [externalResults, setExternalResults] = useState({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [] });
  const [loading, setLoading] = useState(false);
  const [bandcampLoading, setBandcampLoading] = useState(null); // trackUrl of currently resolving BC track
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeProvider, setActiveProvider] = useState('all');
  const [providerRetrying, setProviderRetrying] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState({});  // { albumId: tracksArray | true }
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [paginationCursors, setPaginationCursors] = useState({ youtube: {}, soundcloud: {} });
  const [loadingMore, setLoadingMore] = useState({ youtube: false, soundcloud: false });
  const [currentPage, setCurrentPage] = useState(1);
  const [playlistSheet, setPlaylistSheet] = useState(null); // { title, artistName, artworkUrl, tracks: [] }
  const debounceRef = useRef(null);
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
      setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [] });
      setCurrentPage(1);
      setLoading(false);
      return () => { ignore = true; };
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      unifiedSearch(query.trim())
        .then(({ nativeTracks, external, pagination }) => {
          if (ignore) return;
          console.log('[SEARCH DEBUG] query:', query.trim(), 'SC results:', external.soundcloud?.length, 'YT results:', external.youtube?.length, 'BC results:', external.bandcamp?.length);
          if (external.soundcloud?.length > 0) {
            console.log('[SEARCH DEBUG] SC first 3:', external.soundcloud.slice(0,3).map(r => r.title));
          }
          setResults(nativeTracks);
          setExternalResults(external);
          setCurrentPage(1);
          setPaginationCursors(pagination || { youtube: {}, soundcloud: {} });
        })
        .catch(() => {
          if (ignore) return;
          setResults([]);
          setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [] });
          setCurrentPage(1);
          setPaginationCursors({ youtube: {}, soundcloud: {} });
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 100);

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
          else if (providerKey === 'discogs') {
            // Discogs results need categorization — put them all in releases for now
            const artists = freshResults.filter(r => r.type === 'artist').map(r => ({ ...r, entityType: 'artist', name: r.title }));
            const labels = freshResults.filter(r => r.type === 'label').map(r => ({ ...r, entityType: 'label', name: r.title }));
            const releases = freshResults.filter(r => r.type === 'release' || r.type === 'master').map(r => ({ ...r, entityType: 'release', releaseName: r.title }));
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
      ? ['bandcamp', 'soundcloud', 'youtube', 'discogs']
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
  const hasExternal = externalResults.artists.length > 0 || externalResults.releases.length > 0 || externalResults.labels.length > 0 || (externalResults.youtube && externalResults.youtube.length > 0) || (externalResults.soundcloud && externalResults.soundcloud.length > 0) || (externalResults.bandcamp && externalResults.bandcamp.length > 0);

  const ITEMS_PER_PAGE = 11;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const slicePage = (arr) => arr.slice(startIndex, endIndex);

  const maxLoadedItems = Math.max(
    (externalResults.bandcamp || []).length,
    (externalResults.soundcloud || []).length,
    (externalResults.youtube || []).length,
    (externalResults.releases || []).length,
    (externalResults.artists || []).length,
    (externalResults.labels || []).length
  );
  
  const loadedPages = Math.ceil(maxLoadedItems / ITEMS_PER_PAGE) || 1;
  const canFetchMore = Object.values(paginationCursors).some(c => c.hasMore || c.nextPageToken);
  const totalPages = canFetchMore ? loadedPages + 1 : loadedPages;

  const handlePageClick = async (p) => {
    if (p > loadedPages && canFetchMore) {
      await loadMoreAll();
    }
    setCurrentPage(p);
    const scrollContainer = document.querySelector('.main-content');
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPaginationBar = () => {
    if (totalPages <= 1 && !canFetchMore) return null;
    
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    
    return (
      <div className="search-pagination-bar" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '16px 0', margin: '8px 0' }}>
        <button 
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage === 1}
          style={{ width: '40px', height: '40px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : '#fff', border: 'none', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        
        {pages.map(p => (
          <button 
            key={p}
            onClick={() => handlePageClick(p)}
            style={{
              width: '40px', height: '40px', borderRadius: '20px',
              border: currentPage === p ? '1px solid rgba(255,255,255,0.2)' : 'none',
              background: currentPage === p ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: currentPage === p ? '#fff' : 'rgba(255,255,255,0.6)',
              fontWeight: currentPage === p ? '700' : '500',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              boxShadow: currentPage === p ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {p > loadedPages ? (Object.values(loadingMore).some(Boolean) ? '...' : p) : p}
          </button>
        ))}

        <button 
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{ width: '40px', height: '40px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: currentPage >= totalPages ? 'rgba(255,255,255,0.2)' : '#fff', border: 'none', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    );
  };

  const isQueryEmpty = query.trim().length === 0;
  const showHistory = isQueryEmpty;

  // Multi-select filter helpers
  const filterMatch = (key) => activeFilter === 'all' || activeFilter.split(',').includes(key);
  const providerMatch = (key) => activeProvider === 'all' || activeProvider.split(',').includes(key);

  // ── Rank external results within each provider ──
  // External providers already return relevance-sorted results — just map fields and slice per page
  const rankedYoutube = slicePage((externalResults.youtube || []).map(yt => ({
    ...yt, artistName: yt.channelTitle, entityType: 'track',
  })));
  const rankedSoundcloud = slicePage((externalResults.soundcloud || []).map(sc => ({
    ...sc, entityType: 'track',
  })));
  const rankedSoundcloudPlaylists = slicePage((externalResults.soundcloudPlaylists || []).map(pl => ({
    ...pl, entityType: 'playlist',
  })));
  const rankedBandcamp = slicePage((externalResults.bandcamp || []).map(bc => ({
    ...bc, entityType: bc.entityType || 'track',
  })));
  const rankedDiscogsArtists = slicePage((externalResults.artists || []).map(a => ({
    ...a, title: a.name || a.title, artistName: a.name || a.title, entityType: 'artist', provider: 'discogs',
  })));
  const rankedDiscogsReleases = slicePage((externalResults.releases || []).map(r => ({
    ...r, title: r.releaseName || r.title, entityType: 'release', provider: 'discogs',
  })));
  const rankedDiscogsLabels = slicePage((externalResults.labels || []).map(l => ({
    ...l, title: l.name || l.title, artistName: l.name || l.title, entityType: 'label', provider: 'discogs',
  })));

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

      {!isQueryEmpty && renderPaginationBar()}

      {/* ── Bandcamp Results ── */}
      {!isQueryEmpty && providerMatch('bandcamp') && rankedBandcamp.length > 0 && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#629aa9' }}>
            Bandcamp
          </div>
          
          {filterMatch('artists') && rankedBandcamp.filter(x => x.entityType === 'artist').length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Artists</div>
              {rankedBandcamp.filter(x => x.entityType === 'artist').map(bc => (
                <div key={bc.id} className="search-result-row search-external-row search-artist-row"
                  onClick={() => {
                    openNativeArtistFast({
                      id: bc.id || `bc-artist-${Date.now()}`,
                      name: bc.title || bc.artistName,
                      cover: bc.artworkUrl || null,
                      description: '',
                    });
                  }}>
                  <div className="search-result-art artist-avatar discogs-art">
                    {bc.artworkUrl ? (
                      <img src={bc.artworkUrl} alt={bc.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={bc.title} type="artist" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{bc.title}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filterMatch('labels') && rankedBandcamp.filter(x => x.entityType === 'label').length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Labels</div>
              {rankedBandcamp.filter(x => x.entityType === 'label').map(bc => (
                <div key={bc.id} className="search-result-row search-external-row search-artist-row"
                  onClick={() => {
                    openNativeArtistFast({
                      id: bc.id || `bc-label-${Date.now()}`,
                      name: bc.title || bc.artistName,
                      cover: bc.artworkUrl || null,
                      description: '',
                    });
                  }}>
                  <div className="search-result-art artist-avatar discogs-art">
                    {bc.artworkUrl ? (
                      <img src={bc.artworkUrl} alt={bc.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={bc.title} type="label" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{bc.title}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filterMatch('albums') && rankedBandcamp.filter(x => x.entityType === 'track' || x.entityType === 'album').length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Releases</div>
              {rankedBandcamp.filter(x => x.entityType === 'track' || x.entityType === 'album').map(bc => (
                <div key={bc.id} className="search-result-row search-external-row"
                  style={{ opacity: bandcampLoading === (bc.trackUrl || bc.id) ? 0.5 : 1 }}
                  onClick={() => {
                    if (bandcampLoading) return;
                    setBandcampLoading(bc.trackUrl || bc.id);
                    handleSearchPlay({
                      id: bc.id || `bc-${bc.trackId}`,
                      title: bc.title,
                      artistName: bc.artistName,
                      artworkUrl: bc.artworkUrl,
                      duration: 0,
                      provider: 'bandcamp',
                      providerItemId: bc.trackUrl || bc.id,
                    });
                    setTimeout(() => setBandcampLoading(null), 3000);
                  }}>
                  <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
                    {bc.artworkUrl ? (
                      <img src={bc.artworkUrl} alt={bc.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={bc.title} type="release" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{bc.title}</span>
                    <span className="search-result-artist">{bc.artistName}{bc.entityType === 'track' && bc.albumName ? ` · ${bc.albumName}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Recommendations / Fans Also Bought */}
          {activeProvider === 'bandcamp' && externalResults.bandcamp[0] && 
           (externalResults.bandcamp[0].entityType === 'album' || externalResults.bandcamp[0].entityType === 'track') && (
            <BandcampRecommendations 
              trackUrl={externalResults.bandcamp[0].trackUrl} 
              onPlay={(item) => {
                setBandcampLoading(item.providerItemId);
                handleSearchPlay(item);
                setTimeout(() => setBandcampLoading(null), 3000);
              }} 
            />
          )}
        </div>
      )}

      {/* ── SoundCloud Results ── */}
      {!isQueryEmpty && providerMatch('soundcloud') && (rankedSoundcloud.length > 0 || rankedSoundcloudPlaylists.length > 0) && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#FF5500' }}>
            SoundCloud
          </div>
          
          {filterMatch('titles') && rankedSoundcloud.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Titles</div>
              {rankedSoundcloud.map(sc => (
                <div key={sc.id} className="search-result-row search-external-row"
                  onClick={() => handleSearchPlay({
                    id: sc.id || `sc-${sc.trackId}`,
                    title: sc.title,
                    artistName: sc.artistName,
                    artworkUrl: sc.artworkUrl,
                    duration: sc.duration || 0,
                    provider: 'soundcloud',
                    providerItemId: sc.permalinkUrl,
                    scTrackId: sc.trackId,
                  })}>
                  <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
                    {sc.artworkUrl ? (
                      <img src={sc.artworkUrl} alt={sc.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={sc.title} type="release" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{sc.title}</span>
                    <span className="search-result-artist">{sc.artistName}</span>
                  </div>
                </div>
              ))}
              
            </div>
          )}

          {filterMatch('albums') && rankedSoundcloudPlaylists.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Playlists</div>
              {rankedSoundcloudPlaylists.map(pl => (
                <div key={pl.id} className="search-result-row search-external-row"
                  onClick={() => setPlaylistSheet(pl)}>
                  <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
                    {pl.artworkUrl ? (
                      <img src={pl.artworkUrl} alt={pl.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={pl.title} type="release" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{pl.title}</span>
                    <span className="search-result-artist">{pl.artistName} · {pl.trackCount} tracks</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── YouTube Results ── */}
      {!isQueryEmpty && providerMatch('youtube') && rankedYoutube.length > 0 && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#FF0000' }}>
            YouTube
          </div>
          
          {filterMatch('titles') && (
            <div className="search-section">
              <div className="search-section-subtitle">Titles</div>
              {rankedYoutube.map(yt => (
                <div key={yt.id} className="search-result-row search-external-row"
                  onClick={() => handleSearchPlay({
                    id: yt.id || `yt-${yt.videoId}`,
                    title: yt.title,
                    artistName: yt.channelTitle,
                    artworkUrl: yt.thumbnail,
                    duration: yt.duration || 0,
                    provider: 'youtube',
                    providerItemId: yt.videoId,
                  })}>
                  <div className="search-result-art discogs-art" style={{ borderRadius: '6px' }}>
                    {yt.thumbnail ? (
                      <img src={yt.thumbnail} alt={yt.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={yt.title} type="release" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{yt.title}</span>
                    <span className="search-result-artist">{yt.channelTitle}</span>
                  </div>
                </div>
              ))}
              
            </div>
          )}
        </div>
      )}

      {/* ── Discogs Results ── */}
      {!isQueryEmpty && providerMatch('discogs') && (rankedDiscogsArtists.length > 0 || rankedDiscogsReleases.length > 0 || rankedDiscogsLabels.length > 0) && (
        <div className="search-results-list search-external-section">
          {((filterMatch('artists') && rankedDiscogsArtists.length > 0) || (filterMatch('labels') && rankedDiscogsLabels.length > 0) || (filterMatch('albums') && rankedDiscogsReleases.length > 0)) && (
            <div className="search-section-title search-external-header">
              Discogs
            </div>
          )}

          {filterMatch('artists') && rankedDiscogsArtists.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Artists</div>
              {rankedDiscogsArtists.map(artist => (
                <div key={artist.id || artist.discogsId} className="search-result-row search-artist-row search-external-row"
                  onClick={() => {
                    if (artist.isAlias) {
                      if (window.__kyoyuSetSearch) window.__kyoyuSetSearch(artist.name);
                      else syncNativeSearch(artist.name);
                    } else {
                      window.__kyoyuGo && window.__kyoyuGo(`/artist/discogs-${artist.discogsId}`);
                    }
                  }}>
                  <div className="search-result-art artist-avatar discogs-art">
                    {artist.thumb ? (
                      <img src={artist.thumb} alt={artist.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={artist.name} type="artist" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{artist.name}</span>
                    {artist.canonicalLabel && (
                      <span className="search-result-artist" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '2px' }}>
                        {artist.canonicalLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {filterMatch('labels') && rankedDiscogsLabels.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Labels</div>
              {rankedDiscogsLabels.map(label => (
                <div key={label.id} className="search-result-row search-artist-row search-external-row"
                  onClick={() => window.__kyoyuGo && window.__kyoyuGo(`/label/discogs-${label.discogsId}`)}>
                  <div className="search-result-art artist-avatar discogs-art">
                    {label.thumb ? (
                      <img src={label.thumb} alt={label.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={label.name} type="label" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{label.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filterMatch('albums') && rankedDiscogsReleases.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Albums</div>
              {rankedDiscogsReleases.map(release => (
                <div key={release.id} className="search-result-row search-external-row"
                  onClick={() => window.__kyoyuGo && window.__kyoyuGo(`/release/discogs-${release.discogsId}`)}>
                  <div className="search-result-art discogs-art">
                    {release.thumb ? (
                      <img src={release.thumb} alt={release.releaseName || release.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={release.releaseName || release.title} type="release" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{release.releaseName}</span>
                    <span className="search-result-artist">
                      {release.artistName}
                      {release.year ? ` · ${release.year}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {!isQueryEmpty && renderPaginationBar()}

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
