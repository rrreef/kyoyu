import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Clock, X, Download, Heart, ListPlus, Play, UserPlus, UserCheck, ExternalLink, Disc3, Music, Tag, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import { unifiedSearch, resolveBandcamp, searchSingleProvider, categorizeDiscogs, cacheUnifiedResult, prefetchBandcamp } from '../lib/unifiedSearch';
import { fetchAccountLibrary, isStreamingAvailable, useProviderPriority } from '../lib/streaming';
import { rankResults, detectArtistSplit, normalize } from '../lib/searchRanker';
import { analyzeSearch, buildResults, stripInternal } from '../lib/searchOrchestrator';
import { openNativeAlbumFast, openNativePlaylistFast, openNativeArtistFast, openNativeLabelFast, openRichArtistSheet, openRichLabelSheet, openRichGenreSheet, playGenreTrack, openReleaseFromSheet } from '../components/ui/AlbumSheet';
import { matchGenreSearchQuery } from '../lib/genreIntelligence';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer, historyReplayInfo } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useConnectedLibrary } from '../lib/useConnectedLibrary';
import { toPlayable } from '../components/AccountItems';
import { releases as catalogReleases } from '../data/mockData';
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
    <div style={{ position: 'relative', overflow: 'hidden', backgroundColor: 'transparent' }}>
      {/* Background Trash Icon — only visible while swiping left */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '32px', color: '#888', zIndex: 0,
        opacity: translateX < -10 ? Math.min(1, Math.abs(translateX) / 80) : 0,
        pointerEvents: 'none',
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
          backgroundColor: 'transparent'
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
        style={{ cursor: 'pointer' }}
        onClick={() => openRichLabelSheet({
          name: label.title,
          trackUrl: label.trackUrl,
          artworkUrl: label.artworkUrl,
          provider: 'bandcamp',
          topReleases: (releases || []).map((rel, idx) => ({
            id: `bc-lbl-${idx}`,
            title: rel.title,
            artist: rel.artist || label.title,
            artworkUrl: rel.artworkUrl,
            trackUrl: rel.url,
            provider: 'bandcamp',
          })),
        })}>
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
        borderLeft: '2px solid var(--glass-border)', 
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
              style={{ cursor: 'pointer' }}
              onClick={() => openReleaseFromSheet({
                id: `bc-lbl-${idx}-${Date.now()}`,
                title: rel.title,
                artist: rel.artist || label.title,
                label: label.title,
                artworkUrl: rel.artworkUrl,
                trackUrl: rel.url,
                provider: 'bandcamp',
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
  const [externalResults, setExternalResults] = useState({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [], spotify: [], applemusic: [], tidal: [] });
  const [loading, setLoading] = useState(false);
  const [bandcampLoading, setBandcampLoading] = useState(null); // trackUrl of currently resolving BC track
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeProvider, setActiveProvider] = useState('all');
  // NOTE: window.__kyoyuProviderFilter is owned by the native filter bar (Swift) and read on mount below — never write it here.
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
  const { isFollowing, toggleFollow, followedArtists, getLikedUploads, likedTracks, savedReleases, playlists } = useLibrary();
  const { playTrack, playYouTube, playSoundCloud, setSearchQueue, playSearchItem, playSaved, playRelease } = usePlayer();
  const { user } = useAuth();
  const acct = useConnectedLibrary();

  useEffect(() => {
    try { window.webkit?.messageHandlers?.overlay?.postMessage(!!playlistSheet); } catch (e) {}
    return () => {
      try { window.webkit?.messageHandlers?.overlay?.postMessage(false); } catch (e) {}
    };
  }, [playlistSheet]);

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

    // 5. Listen for exact keyboard height changes (without scrolling search history upwards)
    const onKeyboard = (e) => {
      const newHeight = e.detail || 0;
      setKeyboardHeight(newHeight);
    };
    window.addEventListener('kyoyu-keyboard-change', onKeyboard);

    return () => {
      document.removeEventListener('kyoyu-search', onSearch);
      document.removeEventListener('kyoyu-search-filter', onFilter);
      document.removeEventListener('kyoyu-provider-filter', onProviderFilter);
      window.removeEventListener('kyoyu-keyboard-change', onKeyboard);
    };
  }, []);

  // Keep search history anchored at top when keyboard opens
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      if (query.trim().length === 0) {
        mainContent.scrollTop = 0;
      }
    }
  }, [keyboardHeight, query]);

  // Debounced search — fires on every query change
  useEffect(() => {
    let ignore = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length === 0) {
      setResults([]);
      setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [], spotify: [], applemusic: [], tidal: [] });
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
      const gMatch = matchGenreSearchQuery(q);
      // When searching a broad single-word genre (like "house" or "techno"), contextualize provider query
      // so streaming providers return genuine tracks/albums of that genre rather than pop songs with that word in the title
      const effectiveProviderQuery = (gMatch && /^(house|techno|dub|bass|trance|electro|ambient|funk|soul|disco|rock|indie|jungle|grime|dubstep|breakbeat|downtempo)$/i.test(q))
        ? `${gMatch.primaryGenre.name} ${gMatch.curatedLabels?.[0] || 'classic'}`.trim()
        : q;

      const genreExplorePromise = gMatch
        ? fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'genre-explore',
              genre: gMatch.primaryGenre.name.split(/[\/&]/)[0].trim(),
              artist: gMatch.curatedArtists?.[0] || '',
            }),
          }).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null);

      Promise.all([unifiedSearch(effectiveProviderQuery), genreExplorePromise])
        .then(([{ nativeTracks, external, pagination, failed }, genreExploreData]) => {
          if (ignore) return;
          const mergedExternal = { ...external };
          if (genreExploreData && Array.isArray(genreExploreData.similarTracks) && genreExploreData.similarTracks.length > 0) {
            const extraReleases = genreExploreData.similarTracks.map((t, idx) => ({
              id: t.id || `dc-gsearch-rel-${idx}`,
              discogsId: t.discogsId || '',
              title: t.title || 'Unknown',
              releaseName: t.title || 'Unknown',
              artistName: t.artist || '',
              year: t.year || '',
              label: t.label || '',
              coverImage: t.coverImage || t.thumb || '',
              thumb: t.thumb || t.coverImage || '',
              entityType: 'release',
              provider: 'discogs',
              _isGenreMatched: true,
            }));
            mergedExternal.releases = [...extraReleases, ...(mergedExternal.releases || [])];
          }
          setResults(nativeTracks);
          setExternalResults(mergedExternal);
          setVisibleCount(10);
          setPaginationCursors(pagination || { youtube: {}, soundcloud: {} });
          if (failed?.length) {
            console.warn('[Search] retrying providers that failed:', failed);
            retryMissing(failed, { nativeTracks, external: mergedExternal, pagination });
          }
        })
        .catch(() => {
          if (ignore) return;
          setResults([]);
          setExternalResults({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], soundcloudPlaylists: [], bandcamp: [], spotify: [], applemusic: [], tidal: [] });
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

  // ── Provider filter retry: if user switches to a provider (or Bandcamp category) with empty results, retry ──
  useEffect(() => {
    if (activeProvider === 'all' || !query || query.trim().length === 0) return;
    
    // Check if the selected provider currently has empty results
    const providerKey = activeProvider; // 'youtube', 'soundcloud', 'bandcamp', 'discogs', 'spotify', 'applemusic', 'tidal'
    let hasResults = false;
    if (providerKey === 'youtube') hasResults = externalResults.youtube?.length > 0;
    else if (providerKey === 'soundcloud') hasResults = externalResults.soundcloud?.length > 0;
    else if (providerKey === 'bandcamp') {
      const bcList = externalResults.bandcamp || [];
      if (activeFilter === 'albums') {
        hasResults = bcList.some(x => (x.entityType || x.type) === 'album' || (x.entityType || x.type) === 'release' || Boolean(x.albumName));
      } else if (activeFilter === 'artists') {
        hasResults = bcList.some(x => (x.entityType || x.type) === 'artist');
      } else if (activeFilter === 'labels') {
        hasResults = bcList.some(x => (x.entityType || x.type) === 'label' || _isLikelyLabelEntity(x.title || x.artistName, x.entityType || x.type) || Boolean(x.label));
      } else if (activeFilter === 'titles') {
        hasResults = bcList.some(x => !x.entityType || x.entityType === 'track' || x.type === 'track');
      } else {
        hasResults = bcList.length > 0;
      }
    }
    else if (providerKey === 'spotify') hasResults = externalResults.spotify?.length > 0;
    else if (providerKey === 'applemusic') hasResults = externalResults.applemusic?.length > 0;
    else if (providerKey === 'tidal') hasResults = externalResults.tidal?.length > 0;
    else if (providerKey === 'discogs') hasResults = externalResults.artists?.length > 0 || externalResults.releases?.length > 0 || externalResults.labels?.length > 0;
    
    if (hasResults) return; // Already have results, no need to retry
    
    let ignore = false;
    setProviderRetrying(true);
    
    searchSingleProvider(providerKey, query.trim(), { filter: activeFilter })
      .then(({ results: freshResults, pagination }) => {
        if (ignore || !freshResults || freshResults.length === 0) return;
        
        setExternalResults(prev => {
          const next = { ...prev };
          if (providerKey === 'youtube') next.youtube = freshResults;
          else if (providerKey === 'soundcloud') next.soundcloud = freshResults;
          else if (providerKey === 'bandcamp') {
            const existing = prev.bandcamp || [];
            const seenIds = new Set(existing.map(r => `${r.entityType || r.type}|${(r.title || '').toLowerCase()}|${(r.artistName || '').toLowerCase()}`));
            const merged = [...existing];
            for (const item of freshResults) {
              const k = `${item.entityType || item.type}|${(item.title || '').toLowerCase()}|${(item.artistName || '').toLowerCase()}`;
              if (!seenIds.has(k)) {
                seenIds.add(k);
                merged.push(item);
              }
            }
            next.bandcamp = merged;
          }
          else if (providerKey === 'spotify') next.spotify = freshResults;
          else if (providerKey === 'applemusic') next.applemusic = freshResults;
          else if (providerKey === 'tidal') next.tidal = freshResults;
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
  }, [activeProvider, activeFilter]);


  // ── Load More: fetch next 33 results for a specific provider ──
  async function loadMoreResults(providerKey) {
    if (!query || query.trim().length === 0) return;
    const cursor = paginationCursors[providerKey];
    if (!cursor) return;
    // Check if there's more to load
    if (providerKey === 'youtube' && !cursor.nextPageToken) return;
    if (providerKey === 'soundcloud' && !cursor.hasMore) return;
    if (providerKey === 'bandcamp' && !cursor.hasMore) return;
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
      ? ['bandcamp', 'soundcloud', 'youtube', 'discogs', 'spotify', 'applemusic', 'tidal']
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

  // Build the search queue from what the user actually sees: same provider / category filters, same order.
  // (Previously it concatenated EVERY provider's results, so with "Spotify only" next/prev jumped to Bandcamp etc.)
  function buildSearchQueue() {
    const queue = [];
    for (const item of displayAll) {
      if (categoryOf(item) !== 'titles') continue;
      if (!providerMatch(item.provider)) continue;
      const id = item.id || `${item.provider}-${item.trackId || item.videoId}`;
      switch (item.provider) {
        case 'youtube':
          queue.push({ id, title: item.title, artistName: item.artistName || item.channelTitle, artworkUrl: item.thumbnail || item.artworkUrl,
            duration: item.duration || 0, provider: 'youtube', providerItemId: item.videoId, videoId: item.videoId });
          break;
        case 'soundcloud':
          queue.push({ id, title: item.title, artistName: item.artistName, artworkUrl: item.artworkUrl, duration: item.duration || 0,
            provider: 'soundcloud', providerItemId: item.permalinkUrl, scTrackId: item.trackId, trackId: item.trackId });
          break;
        case 'bandcamp':
          queue.push({ id, title: item.title, artistName: item.artistName, artworkUrl: item.artworkUrl, duration: 0,
            provider: 'bandcamp', providerItemId: item.trackUrl, trackUrl: item.trackUrl });
          break;
        case 'spotify':
          queue.push({ id, title: item.title, artistName: item.artistName, artworkUrl: item.artworkUrl, duration: item.duration,
            provider: 'spotify', providerItemId: item.spotifyId, spotifyId: item.spotifyId, albumName: item.albumName });
          break;
        case 'applemusic': {
          const amId = item.trackId || item.appleMusicId || item.providerItemId || String(item.id || '').replace(/^am-/, '');
          queue.push({ id, title: item.title, artistName: item.artistName || item.artist, artworkUrl: item.artworkUrl || item.cover || '', duration: item.duration,
            provider: 'applemusic', providerItemId: amId, trackId: amId, appleMusicId: amId, albumName: item.albumName });
          break;
        }
        case 'tidal':
          queue.push({ id, title: item.title, artistName: item.artistName, artworkUrl: item.artworkUrl, duration: item.duration,
            provider: 'tidal', providerItemId: item.tidalId || item.providerItemId, tidalId: item.tidalId || item.providerItemId, albumName: item.albumName });
          break;
        default:
          break;
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
  const hasExternal = externalResults.artists.length > 0 || externalResults.releases.length > 0 || externalResults.labels.length > 0 || (externalResults.youtube && externalResults.youtube.length > 0) || (externalResults.soundcloud && externalResults.soundcloud.length > 0) || (externalResults.bandcamp && externalResults.bandcamp.length > 0) || (externalResults.spotify && externalResults.spotify.length > 0) || (externalResults.applemusic && externalResults.applemusic.length > 0) || (externalResults.tidal && externalResults.tidal.length > 0);

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
  const _normEntityName = (s) => String(s || '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const discogsLabelNormSet = new Set((externalResults.labels || []).map(l => _normEntityName(l.name || l.title)).filter(Boolean));
  const discogsArtistNormSet = new Set((externalResults.artists || []).map(a => _normEntityName(a.name || a.title)).filter(Boolean));
  const _isLikelyLabelEntity = (nameStr, rawType) => {
    if (rawType === 'label') return true;
    if (rawType !== 'artist') return false;
    const n = _normEntityName(nameStr);
    if (!n) return false;
    if (/\b(records|recordings|record label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos)\b/i.test(nameStr || '')) {
      return true;
    }
    if (discogsLabelNormSet.has(n) && !discogsArtistNormSet.has(n)) {
      return true;
    }
    return false;
  };

  const matchedGenreSearch = !isQueryEmpty ? matchGenreSearchQuery(query) : null;
  const fallbackGenreProvider = activeProvider === 'all' ? 'discogs' : activeProvider.split(',')[0];

  const allExternal = [
    ...(matchedGenreSearch ? [
      // Curated 50/50 Classic & Deep Cut Tracks for this genre
      ...(matchedGenreSearch.curatedTracks || []).map((t, idx) => ({
        id: `genre-curated-track-${matchedGenreSearch.primaryGenre.id}-${idx}`,
        title: t.title,
        artistName: t.artist,
        year: t.year || '',
        label: t.label || '',
        artworkUrl: t.coverImage || t.thumb || '',
        coverImage: t.coverImage || t.thumb || '',
        url: t.trackUrl || t.url || `resolve:${t.artist || ''} ${t.title || ''}`.trim(),
        trackUrl: t.trackUrl || t.url || `resolve:${t.artist || ''} ${t.title || ''}`.trim(),
        entityType: 'track',
        provider: fallbackGenreProvider,
        _isGenreCuratedTrack: true,
        _isGenreMatched: true,
      })),
      // Curated Albums / Releases for this genre
      ...(matchedGenreSearch.curatedTracks || []).slice(0, 8).map((t, idx) => ({
        id: `genre-curated-rel-${matchedGenreSearch.primaryGenre.id}-${idx}`,
        title: t.title,
        releaseName: t.title,
        artistName: t.artist,
        year: t.year || '',
        label: t.label || '',
        artworkUrl: t.coverImage || t.thumb || '',
        coverImage: t.coverImage || t.thumb || '',
        entityType: 'release',
        provider: fallbackGenreProvider,
        _isGenreMatched: true,
      })),
      // Pioneer & Key Artists for this genre
      ...(matchedGenreSearch.curatedArtists || []).map((artistName, idx) => ({
        id: `genre-curated-artist-${matchedGenreSearch.primaryGenre.id}-${idx}`,
        title: artistName,
        name: artistName,
        artistName: `${matchedGenreSearch.primaryGenre.name} · Pioneer Artist`,
        entityType: 'artist',
        provider: fallbackGenreProvider,
        _isGenreMatched: true,
      })),
      // Classic & Defining Labels for this genre
      ...(matchedGenreSearch.curatedLabels || []).map((labelName, idx) => ({
        id: `genre-curated-label-${matchedGenreSearch.primaryGenre.id}-${idx}`,
        title: labelName,
        name: labelName,
        artistName: `${matchedGenreSearch.primaryGenre.name} · Defining Label`,
        entityType: 'label',
        provider: fallbackGenreProvider,
        _isGenreMatched: true,
      })),
    ] : []),
    ...(providerMatch('youtube') ? (externalResults.youtube || []).filter(yt => /^[\w-]{11}$/.test(yt.videoId || '') && yt.entityType !== 'playlist' && yt.entityType !== 'artist').map(yt => ({
      ...yt, artistName: yt.channelTitle || yt.artistName, entityType: 'track', provider: 'youtube',
    })) : []),
    ...(providerMatch('soundcloud') ? (externalResults.soundcloud || []).map(sc => ({
      ...sc, entityType: 'track', provider: sc.provider || 'soundcloud',
    })) : []),
    ...(providerMatch('soundcloud') ? (externalResults.soundcloudPlaylists || []).map(pl => ({
      ...pl, entityType: 'playlist', provider: 'soundcloud',
    })) : []),
    ...(providerMatch('bandcamp') ? (() => {
      const mapped = bcItems.map(bc => {
        const rawType = bc.entityType || bc.type || 'track';
        const resolvedType = _isLikelyLabelEntity(bc.title || bc.artistName, rawType) ? 'label' : rawType;
        return {
          ...bc, entityType: resolvedType, provider: bc.provider || 'bandcamp',
        };
      });
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const seenAlbums = new Set(mapped.filter(x => x.entityType === 'album' || x.entityType === 'release').map(x => `${norm(x.title)}|${norm(x.artistName)}`));
      const seenArtists = new Set(mapped.filter(x => x.entityType === 'artist').map(x => norm(x.title)));
      const seenLabels = new Set(mapped.filter(x => x.entityType === 'label').map(x => norm(x.title)));
      const extra = [];

      for (const bc of mapped) {
        // Synthesize parent Album from any Bandcamp track that has albumName or /album/ URL
        if (bc.entityType === 'track' && (bc.albumName || /\/album\//i.test(bc.trackUrl || ''))) {
          const albTitle = (bc.albumName || bc.title || '').trim();
          const albKey = `${norm(albTitle)}|${norm(bc.artistName)}`;
          if (albTitle && !seenAlbums.has(albKey)) {
            seenAlbums.add(albKey);
            extra.push({
              ...bc,
              id: `${bc.id}-syn-album`,
              title: albTitle,
              albumName: albTitle,
              albumUrl: bc.albumUrl || bc.trackUrl,
              entityType: 'album',
              provider: 'bandcamp',
            });
          }
        }
        // Synthesize Artist from Bandcamp album/track artistName
        if ((bc.entityType === 'album' || bc.entityType === 'track') && bc.artistName) {
          const artName = bc.artistName.trim();
          const artKey = norm(artName);
          if (artKey.length >= 2 && !/^various(\s+artists)?$/i.test(artName) && !seenArtists.has(artKey)) {
            seenArtists.add(artKey);
            extra.push({
              id: `${bc.id}-syn-artist-${artKey}`,
              title: artName,
              artistName: artName,
              artworkUrl: bc.artworkUrl,
              trackUrl: bc.labelUrl || bc.trackUrl,
              labelUrl: bc.labelUrl || '',
              location: bc.location || '',
              genre: bc.genre || '',
              entityType: 'artist',
              provider: 'bandcamp',
            });
          }
        }
        // Synthesize Label from Bandcamp album/track label field
        if ((bc.entityType === 'album' || bc.entityType === 'track') && bc.label) {
          const lblName = bc.label.trim();
          const lblKey = norm(lblName);
          if (lblKey.length >= 2 && !seenLabels.has(lblKey)) {
            seenLabels.add(lblKey);
            extra.push({
              id: `${bc.id}-syn-label-${lblKey}`,
              title: lblName,
              artistName: lblName,
              label: lblName,
              artworkUrl: bc.artworkUrl,
              trackUrl: bc.labelUrl || bc.trackUrl,
              labelUrl: bc.labelUrl || '',
              location: bc.location || '',
              genre: bc.genre || '',
              entityType: 'label',
              provider: 'bandcamp',
            });
          }
        }
        // On Bandcamp, labels and artists share 'b' band accounts. When filtering by 'labels' on Bandcamp, allow band accounts to surface as labels if not already present.
        if (activeProvider === 'bandcamp' && activeFilter === 'labels' && bc.entityType === 'artist') {
          const bandName = (bc.title || bc.artistName || '').trim();
          const bandKey = norm(bandName);
          if (bandKey.length >= 2 && !seenLabels.has(bandKey) && /\.bandcamp\.com/i.test(bc.trackUrl || bc.labelUrl || '')) {
            seenLabels.add(bandKey);
            extra.push({
              ...bc,
              id: `${bc.id}-syn-bclabel-${bandKey}`,
              entityType: 'label',
              provider: 'bandcamp',
            });
          }
        }
      }
      return [...mapped, ...extra];
    })() : []),
    ...(providerMatch('spotify') ? (externalResults.spotify || []).map(sp => ({
      ...sp, entityType: sp.entityType || 'track', provider: sp.provider || 'spotify',
    })) : []),
    ...(providerMatch('applemusic') ? (externalResults.applemusic || []).map(am => ({
      ...am, entityType: am.entityType || 'track', provider: am.provider || 'applemusic',
    })) : []),
    ...(providerMatch('tidal') ? (externalResults.tidal || []).map(td => ({
      ...td, entityType: td.entityType || 'track', provider: td.provider || 'tidal',
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
    
    if (activeProvider === 'youtube' && et === 'playlist' && activeFilter === 'albums') return 'albums'; // YouTube playlists act as albums too
    if (activeProvider === 'discogs' && (et === 'release' || et === 'master') && activeFilter === 'versions') return 'versions'; // Let Discogs albums show as titles when searched
    if (et === 'artist') return 'artists';
    if (et === 'label') return 'labels';
    if (et === 'profile' || et === 'user') return 'profiles';
    if (et === 'fan') return 'fans';
    if (et === 'playlist') return 'playlists'; // Map playlist to 'playlists' filter
    if (et === 'release' || et === 'album') return 'albums';
    return 'titles';
  };
  const [providerPriority] = useProviderPriority();

  const getProviderScore = (provider) => {
    const idx = providerPriority.indexOf(provider);
    return idx !== -1 ? (100 - idx * 10) : 0; // Higher is better
  };

  const genreKnownArtistsNorm = new Set(
    (matchedGenreSearch?.curatedArtists || []).map(a => _normEntityName(a.replace(/\s*\(.*?\)\s*/g, '')))
  );
  const genreKnownLabelsNorm = new Set(
    (matchedGenreSearch?.curatedLabels || []).map(l => _normEntityName(l.replace(/\s*\(.*?\)\s*/g, '')))
  );

  const orderedAll = (() => {
    // Score all results strictly using searchRanker, plus our dynamic provider priority
    let scored = allExternal.map(r => {
      // Basic text matching based on words and characters
      const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
      const tNorm = (r.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aNorm = (r.artistName || r.channelTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const albNorm = (r.albumName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const lblNorm = (r.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const combinedNorm = `${aNorm}${tNorm}${albNorm}${lblNorm}`;
      const entityNameNorm = _normEntityName(r.title || '');
      const artistEntityNorm = _normEntityName(r.artistName || r.channelTitle || '');
      
      let textScore = 0;
      if (r._isGenreMatched) {
        textScore += 3200;
      } else if (matchedGenreSearch && (
        genreKnownArtistsNorm.has(entityNameNorm) ||
        genreKnownArtistsNorm.has(artistEntityNorm) ||
        genreKnownLabelsNorm.has(entityNameNorm)
      )) {
        textScore += 2800;
      } else if (tNorm === qNorm || aNorm === qNorm || albNorm === qNorm || lblNorm === qNorm) {
        textScore += matchedGenreSearch ? 400 : 1000;
      } else if (tNorm.includes(qNorm) || aNorm.includes(qNorm) || albNorm.includes(qNorm) || lblNorm.includes(qNorm) || combinedNorm.includes(qNorm)) {
        textScore += matchedGenreSearch ? 300 : 500;
      } else {
        const words = query.toLowerCase().split(' ').filter(Boolean);
        const haystack = `${r.title || ''} ${r.artistName || ''} ${r.albumName || ''} ${r.label || ''}`.toLowerCase();
        const matches = words.filter(w => haystack.includes(w));
        textScore += (matches.length / (words.length || 1)) * 100;
      }
      
      const providerScore = getProviderScore(r.provider);
      return { ...r, _rawScore: textScore + providerScore + (r.ratingCount ? r.ratingCount / 1000 : 0) };
    });

    // Sort by strict score
    scored.sort((a, b) => b._rawScore - a._rawScore);

    // Dedupe (and enrich merged artist/label items with cross-provider IDs/URLs)
    const seenMap = new Map();
    const deduped = [];
    for (const r of scored) {
      const title = _normEntityName(r.title || '');
      const artist = _normEntityName(r.artistName || r.channelTitle || '');
      const kind = r.entityType || 'track';
      const key = (kind === 'label' || kind === 'artist') ? `${kind}|${title}` : `${kind}|${title}|${artist}`;
      const existing = seenMap.get(key);
      if (existing) {
        if (!existing.discogsId && r.discogsId) existing.discogsId = r.discogsId;
        if (!existing.trackUrl && r.trackUrl && !String(r.trackUrl).startsWith('resolve:')) existing.trackUrl = r.trackUrl;
        if (!existing.artworkUrl && (r.artworkUrl || r.coverImage || r.thumb)) {
          existing.artworkUrl = r.artworkUrl || r.coverImage || r.thumb;
          existing.coverImage = existing.artworkUrl;
        }
        if (!existing.location && r.location) existing.location = r.location;
        continue;
      }
      const copy = { ...r };
      seenMap.set(key, copy);
      deduped.push(copy);
    }
    scored = deduped;

    // Apply Filter constraints
    if (activeFilter !== 'all') {
      const categoryOnly = scored.filter(item => filterMatch(categoryOf(item)));
      // Rules B & C: show exactly 33 items (or as many as possible)
      return categoryOnly.slice(0, 33);
    } else {
      // Filter == 'all': include top artists, top labels, top albums, and top titles
      const artists = scored.filter(i => categoryOf(i) === 'artists').slice(0, 4);
      const extLabels = scored.filter(i => categoryOf(i) === 'labels').slice(0, 4);
      const albums = scored.filter(i => categoryOf(i) === 'albums').slice(0, 10);
      const titles = scored.filter(i => categoryOf(i) === 'titles').slice(0, 20);
      return [...artists, ...extLabels, ...albums, ...titles].sort((a, b) => b._rawScore - a._rawScore);
    }
  })();

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
  const rankedAll = displayAll.slice(0, activeFilter === 'all' ? Math.max(visibleCount, 40) : visibleCount);

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
  const providerColors = { bandcamp: '#1da0c3', soundcloud: '#FF5500', youtube: '#FF0000', discogs: 'rgba(255,255,255,0.7)', spotify: '#1DB954', applemusic: '#FA243C', tidal: '#00FFFF' };

  // Inline provider logo SVGs
  const providerIcons = {
    soundcloud: <img src="/icons/soundcloud_light_24x24.png" alt="SoundCloud" width="14" height="14" style={{ flexShrink: 0 }} />,
    bandcamp: <img src="/icons/bandcamp_light_24x24.png" alt="Bandcamp" width="14" height="14" style={{ flexShrink: 0 }} />,
    youtube: <img src="/icons/youtube_light_24x24.png" alt="YouTube" width="14" height="14" style={{ flexShrink: 0 }} />,
    discogs: <img src="/icons/discogs_light_24x24.png" alt="Discogs" width="14" height="14" style={{ flexShrink: 0 }} />,
    spotify: <img src="/icons/spotify_light_24x24.png" alt="Spotify" width="14" height="14" style={{ flexShrink: 0 }} />,
    applemusic: <img src="/icons/apple_light_24x24.png" alt="Apple Music" width="14" height="14" style={{ flexShrink: 0 }} />,
    tidal: <img src="/icons/tidal_light_24x24.png" alt="TIDAL" width="14" height="14" style={{ flexShrink: 0 }} />,
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
    <div key={track.id} className="search-result-row" style={{ cursor: 'pointer' }} onClick={() => playTrack(track, [track])}>
      <div className="search-result-art">
        {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder" />}
      </div>
      <div className="search-result-info">
        <span className="search-result-title">{track.title}</span>
        <span className="search-result-artist">
          {track.artist}{track.album && track.album !== track.title && !isPodcast ? ` · ${track.album}` : ''}
        </span>
      </div>
      <div className="search-result-actions">
        <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
      </div>
    </div>
  );

  const renderAlbumRow = (track) => (
    <div key={`album-${track.album}`} className="search-result-row" style={{ cursor: 'pointer' }} onClick={() => playTrack(track, [track])}>
      <div className="search-result-art">
        {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder" />}
      </div>
      <div className="search-result-info">
        <span className="search-result-title">{track.album}</span>
        <span className="search-result-artist">{track.artist}</span>
      </div>
      <div className="search-result-actions">
        <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
      </div>
    </div>
  );

  const renderArtistRow = (track) => {
    const aid = track.artistId || track.artist;
    const following = isFollowing(aid);
    const avatar = track.profileAvatar || track.cover;
    const name = track.profileName || track.artist;

    return (
      <div
        key={`artist-${aid}`}
        className="search-result-row search-artist-row"
        style={{ cursor: 'pointer' }}
        onClick={() => openRichArtistSheet({ id: aid, name, cover: avatar })}
      >
        <div className="search-result-art artist-avatar circle">
          {avatar ? <img src={avatar} alt="" /> : <div className="search-result-art-placeholder circle" />}
        </div>
        <div className="search-result-info">
          <span className="search-result-title">{name}</span>
          <span className="search-result-artist">Artist</span>
        </div>
        <div className="search-result-actions">
          <button
            className={`search-action-btn search-follow-btn ${following ? 'following' : ''}`}
            title="Follow"
            onClick={(e) => { e.stopPropagation(); toggleFollow(aid); }}
          >
            {following ? <UserCheck size={16} strokeWidth={2.5} /> : <UserPlus size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    );
  };

  const renderLabelRow = (track) => {
    const lid = track.label;
    const following = isFollowing(lid);

    return (
      <div
        key={`label-${lid}`}
        className="search-result-row search-artist-row"
        style={{ cursor: 'pointer' }}
        onClick={() => openRichLabelSheet({ id: lid, name: track.label, cover: track.cover })}
      >
        <div className="search-result-art artist-avatar circle">
          {track.cover ? <img src={track.cover} alt="" /> : <div className="search-result-art-placeholder circle" />}
        </div>
        <div className="search-result-info">
          <span className="search-result-title">{track.label}</span>
          <span className="search-result-artist">Label</span>
        </div>
        <div className="search-result-actions">
          <button
            className={`search-action-btn search-follow-btn ${following ? 'following' : ''}`}
            title="Follow"
            onClick={(e) => { e.stopPropagation(); toggleFollow(lid); }}
          >
            {following ? <UserCheck size={16} strokeWidth={2.5} /> : <UserPlus size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    );
  };

  // ── Library search matches (shown FIRST regardless of active provider/category filter) ──
  const libraryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qWords = q.split(/\s+/).filter(Boolean);

    const candidates = [];

    // 1. Liked uploads / tracks
    const likedUploadsArr = getLikedUploads ? getLikedUploads(user?.id) : [];
    for (const u of likedUploadsArr) {
      const prov = historyReplayInfo(u).provider || u.provider || 'native';
      candidates.push({
        id: `lib-upl-${u.id}`,
        title: u.title || 'Untitled',
        artistName: u.artist || u.artistName || '',
        albumName: u.album || '',
        artworkUrl: (u.artworkUrl && u.artworkUrl !== 'undefined' && u.artworkUrl !== 'null' ? u.artworkUrl : null) || (u.cover && u.cover !== 'undefined' && u.cover !== 'null' ? u.cover : null) || '',
        provider: prov,
        kind: 'track',
        _libType: 'likedUpload',
        _raw: u,
      });
    }

    // 2. Catalog liked tracks
    for (const id of (likedTracks || [])) {
      const rel = (catalogReleases || []).find(r => (r.tracks || []).some(x => String(x.id) === String(id)));
      const t = rel ? (rel.tracks || []).find(x => String(x.id) === String(id)) : null;
      if (t) {
        candidates.push({
          id: `lib-cat-${t.id}`,
          title: t.title || 'Untitled',
          artistName: t.artist || rel?.artist || '',
          albumName: rel?.title || '',
          artworkUrl: rel?.cover || '',
          provider: 'native',
          kind: 'track',
          _libType: 'catalogTrack',
          _raw: { ...t, cover: rel?.cover, artist: t.artist || rel?.artist, album: rel?.title, src: t.src || t.audioUrl || '' },
        });
      }
    }

    // 3. Saved releases
    for (const rid of (savedReleases || [])) {
      const rel = (catalogReleases || []).find(r => String(r.id) === String(rid));
      if (rel) {
        candidates.push({
          id: `lib-rel-${rel.id}`,
          title: rel.title || 'Untitled',
          artistName: rel.artist || '',
          albumName: rel.title || '',
          label: rel.label || '',
          artworkUrl: rel.cover || '',
          provider: 'native',
          kind: 'album',
          _libType: 'savedRelease',
          _raw: rel,
        });
      }
    }

    // 4. Kyoyu Playlists + tracks inside Playlists
    for (const pl of (playlists || [])) {
      candidates.push({
        id: `lib-pl-${pl.id}`,
        title: pl.title || pl.name || 'Playlist',
        artistName: pl.creator || user?.displayName || 'Playlist',
        artworkUrl: pl.cover || pl.artworkUrl || '',
        provider: pl.provider || 'native',
        kind: 'playlist',
        _libType: 'playlist',
        _raw: pl,
      });
      for (const pt of (pl.tracks || [])) {
        if (!pt) continue;
        const prov = historyReplayInfo(pt).provider || pt.provider || 'native';
        candidates.push({
          id: `lib-pl-tr-${pl.id}-${pt.id || pt.title}`,
          title: pt.title || 'Untitled',
          artistName: pt.artistName || pt.artist || '',
          albumName: pt.albumName || pt.album || pl.title || pl.name || '',
          artworkUrl: pt.artworkUrl || pt.cover || pl.cover || pl.artworkUrl || '',
          provider: prov,
          kind: 'track',
          _libType: prov !== 'native' ? 'acctItem' : 'likedUpload',
          _raw: pt,
        });
      }
    }

    // 5. Bandcamp Baskets (Wishlist playlists) + items inside baskets
    try {
      const rawBaskets = localStorage.getItem('kyoyu-bandcamp-baskets-v1');
      const baskets = rawBaskets ? JSON.parse(rawBaskets) : [];
      if (Array.isArray(baskets)) {
        for (const b of baskets) {
          if (!b || !b.id) continue;
          const bItems = Array.isArray(b.items) ? b.items : [];
          const mappedTracks = bItems.map((it, idx) => ({
            id: it.id || `bc-basket-item-${b.id}-${idx}`,
            title: it.title || 'Untitled',
            artistName: it.artist || 'Bandcamp',
            artist: it.artist || 'Bandcamp',
            artworkUrl: it.artworkUrl || '',
            cover: it.artworkUrl || '',
            trackUrl: it.url || '',
            url: it.url || '',
            provider: 'bandcamp',
            kind: (it.url && it.url.includes('/album/')) ? 'album' : 'track',
          }));
          const basketPl = {
            id: `bc-basket-${b.id}`,
            title: b.name || 'Wishlist Basket',
            name: b.name || 'Wishlist Basket',
            creator: 'Bandcamp Basket',
            artistName: `Bandcamp · ${mappedTracks.length} ${mappedTracks.length === 1 ? 'item' : 'items'}`,
            cover: b.coverUrl || mappedTracks[0]?.artworkUrl || '',
            artworkUrl: b.coverUrl || mappedTracks[0]?.artworkUrl || '',
            provider: 'bandcamp',
            tracks: mappedTracks,
          };
          candidates.push({
            id: `lib-bcbasket-${b.id}`,
            title: basketPl.title,
            artistName: basketPl.artistName,
            artworkUrl: basketPl.artworkUrl,
            provider: 'bandcamp',
            kind: 'playlist',
            _libType: 'playlist',
            _raw: basketPl,
          });
          for (const bt of mappedTracks) {
            candidates.push({
              id: `lib-bcbasket-item-${b.id}-${bt.id}`,
              title: bt.title,
              artistName: bt.artistName,
              albumName: b.name || 'Wishlist',
              artworkUrl: bt.artworkUrl,
              provider: 'bandcamp',
              kind: bt.kind,
              _libType: 'acctItem',
              _raw: bt,
            });
          }
        }
      }
    } catch {}

    // 6. User uploads
    try {
      const rawUploads = localStorage.getItem(`kyoyu-uploads-${user?.id}`);
      const userUploads = rawUploads ? JSON.parse(rawUploads) : [];
      if (Array.isArray(userUploads)) {
        for (const u of userUploads) {
          if (!u) continue;
          candidates.push({
            id: `lib-myupl-${u.id}`,
            title: u.title || 'Untitled',
            artistName: u.artist || user?.displayName || '',
            albumName: u.album || '',
            artworkUrl: u.artworkUrl || u.cover || '',
            provider: 'native',
            kind: 'track',
            _libType: 'likedUpload',
            _raw: u,
          });
        }
      }
    } catch {}

    // 7. Followed artists / labels (local + connected accounts)
    for (const fid of (followedArtists || [])) {
      const fStr = String(fid || '').trim();
      if (!fStr) continue;
      candidates.push({
        id: `lib-follow-${fStr}`,
        title: fStr,
        artistName: 'Following',
        artworkUrl: '',
        provider: 'native',
        kind: 'artist',
        _libType: 'followedArtist',
        _raw: { id: fStr, name: fStr, title: fStr },
      });
    }
    try {
      const storedArtists = JSON.parse(localStorage.getItem('kyoyu-followed-artists') || '[]');
      if (Array.isArray(storedArtists)) {
        for (const a of storedArtists) {
          const name = typeof a === 'string' ? a : (a?.name || a?.title || '');
          if (!name) continue;
          candidates.push({
            id: `lib-fol-art-${name}`,
            title: name,
            artistName: 'Following · Artist',
            artworkUrl: (typeof a === 'object' && (a.avatar || a.artworkUrl || a.cover)) || '',
            provider: (typeof a === 'object' && a.provider) || 'native',
            kind: 'artist',
            _libType: 'followedArtist',
            _raw: typeof a === 'object' ? a : { id: name, name, title: name },
          });
        }
      }
      const storedLabels = JSON.parse(localStorage.getItem('kyoyu-followed-labels') || '[]');
      if (Array.isArray(storedLabels)) {
        for (const l of storedLabels) {
          const name = typeof l === 'string' ? l : (l?.name || l?.title || '');
          if (!name) continue;
          candidates.push({
            id: `lib-fol-lbl-${name}`,
            title: name,
            artistName: 'Following · Label',
            artworkUrl: (typeof l === 'object' && (l.avatar || l.artworkUrl || l.cover)) || '',
            provider: (typeof l === 'object' && l.provider) || 'native',
            kind: 'label',
            _libType: 'followedLabel',
            _raw: typeof l === 'object' ? l : { id: name, name, title: name },
          });
        }
      }
    } catch {}

    // 8. Connected account library items (Bandcamp, SoundCloud, YouTube, Spotify, Apple Music, Discogs, etc.)
    const acctLists = [
      ...(acct?.bandcamp?.collection || []),
      ...(acct?.bandcamp?.wishlist || []),
      ...(acct?.bandcamp?.playlists || []),
      ...(acct?.bandcamp?.following || []),
      ...(acct?.soundcloud?.likes || []),
      ...(acct?.soundcloud?.playlists || []),
      ...(acct?.soundcloud?.following || []),
      ...(acct?.youtube?.likes || []),
      ...(acct?.youtube?.albums || []),
      ...(acct?.youtube?.playlists || []),
      ...(acct?.youtube?.following || []),
      ...(acct?.spotify?.likes || []),
      ...(acct?.spotify?.albums || []),
      ...(acct?.spotify?.playlists || []),
      ...(acct?.spotify?.following || []),
      ...(acct?.applemusic?.likes || []),
      ...(acct?.applemusic?.albums || []),
      ...(acct?.applemusic?.playlists || []),
      ...(acct?.applemusic?.following || []),
      ...(acct?.tidal?.likes || []),
      ...(acct?.tidal?.albums || []),
      ...(acct?.tidal?.playlists || []),
      ...(acct?.discogs?.collection || []),
      ...(acct?.discogs?.wishlist || []),
      ...(acct?.discogs?.purchases || []),
    ];
    for (const it of acctLists) {
      if (!it) continue;
      const isProfile = it.kind === 'profile' || it.kind === 'artist';
      candidates.push({
        id: `lib-acct-${it.provider || 'ext'}-${it.id || it.title}`,
        title: it.title || it.name || 'Untitled',
        artistName: isProfile ? 'Following' : (it.artistName || it.artist || ''),
        albumName: it.albumName || it.album || '',
        artworkUrl: it.artworkUrl || it.cover || '',
        provider: it.provider || 'native',
        kind: isProfile ? 'artist' : (it.kind || 'track'),
        _libType: isProfile ? 'followedArtist' : 'acctItem',
        _raw: it,
      });
      if (Array.isArray(it.tracks)) {
        for (const pt of it.tracks) {
          if (!pt) continue;
          candidates.push({
            id: `lib-acct-pltr-${it.id}-${pt.id || pt.title}`,
            title: pt.title || 'Untitled',
            artistName: pt.artistName || pt.artist || '',
            albumName: it.title || '',
            artworkUrl: pt.artworkUrl || pt.cover || it.artworkUrl || it.cover || '',
            provider: pt.provider || it.provider || 'native',
            kind: 'track',
            _libType: 'acctItem',
            _raw: pt,
          });
        }
      }
    }

    const scored = [];
    const seen = new Set();

    // IMPORTANT: Do NOT filter out library matches by activeProvider or activeFilter —
    // matching library content must ALWAYS appear first whatever filter is selected.
    for (const item of candidates) {
      const titleL = (item.title || '').toLowerCase();
      const artistL = (item.artistName || '').toLowerCase();
      const albumL = (item.albumName || '').toLowerCase();
      const haystack = `${titleL} ${artistL} ${albumL}`.trim();
      if (!haystack) continue;

      const matchesFull = haystack.includes(q);
      const matchesWords = qWords.length > 0 && qWords.every(w => haystack.includes(w));
      if (!matchesFull && !matchesWords) continue;

      const dedupKey = `${item.kind}|${titleL}|${artistL}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let score = 0;
      if (titleL === q) score += 100;
      else if (titleL.startsWith(q)) score += 75;
      else if (titleL.includes(q)) score += 50;
      if (artistL === q) score += 80;
      else if (artistL.startsWith(q)) score += 60;
      else if (artistL.includes(q)) score += 40;
      if (matchesWords) score += 20;

      scored.push({ ...item, _score: score });
    }

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, 10);
  }, [query, getLikedUploads, user?.id, user?.displayName, likedTracks, savedReleases, playlists, followedArtists, acct]);

  const hasLibraryMatches = libraryMatches.length > 0;

  const handleLibraryItemClick = async (item) => {
    const raw = item._raw;
    if (!raw) return;
    if (item._libType === 'followedArtist') {
      openRichArtistSheet({
        id: raw.id || item.title,
        name: raw.name || raw.title || item.title,
        cover: item.artworkUrl || raw.artworkUrl || raw.cover || '',
      });
      return;
    }
    if (item._libType === 'followedLabel') {
      openRichLabelSheet({
        id: raw.id || item.title,
        name: raw.name || raw.title || item.title,
        cover: item.artworkUrl || raw.artworkUrl || raw.cover || '',
      });
      return;
    }
    if (item._libType === 'likedUpload') {
      if (historyReplayInfo(raw).provider !== 'native') {
        playSaved(raw);
      } else {
        const t = {
          id: raw.id,
          title: raw.title || 'Untitled',
          artistName: raw.artist || '',
          artist: raw.artist || '',
          releaseCover: raw.artworkUrl || raw.cover || '',
          releaseTitle: raw.album || raw.title || '',
          src: raw.fileUrl || raw.audioUrl || '',
        };
        playTrack(t, [t]);
      }
      window.__kyoyuPlayerCmd?.('expand');
      return;
    }
    if (item._libType === 'catalogTrack') {
      playTrack(raw, [raw]);
      window.__kyoyuPlayerCmd?.('expand');
      return;
    }
    if (item._libType === 'savedRelease') {
      playRelease(raw);
      openNativeAlbumFast(raw);
      return;
    }
    if (item._libType === 'playlist' || item.kind === 'playlist') {
      const latestPl = playlists.find(p => String(p.id) === String(raw.id)) || raw;
      let tracks = latestPl.tracks || [];
      if (!tracks.length && isStreamingAvailable() && latestPl.provider && (latestPl.playlistId || latestPl.url)) {
        try {
          tracks = await fetchAccountLibrary(latestPl.provider, 'playlistTracks', { playlistId: latestPl.playlistId, playlistUrl: latestPl.url });
          latestPl.tracks = tracks;
        } catch {}
      }
      if (window.webkit?.messageHandlers?.player) {
        openNativePlaylistFast({
          ...latestPl,
          id: latestPl.id,
          title: latestPl.title || latestPl.name || 'Playlist',
          creator: latestPl.artistName || latestPl.creator || user?.displayName || 'You',
          cover: latestPl.artworkUrl || latestPl.cover || '/album1.png',
          provider: latestPl.provider || null,
          tracks,
        });
      } else {
        setPlaylistSheet({
          id: latestPl.id,
          title: latestPl.title || latestPl.name || 'Playlist',
          artistName: latestPl.artistName || latestPl.creator || user?.displayName || 'You',
          artworkUrl: latestPl.artworkUrl || latestPl.cover || null,
          provider: latestPl.provider || null,
          trackCount: tracks.length,
          tracks,
        });
      }
      return;
    }
    if (item._libType === 'acctItem') {
      if (raw.kind === 'album') {
        if (raw.provider === 'bandcamp' && (raw.trackUrl || raw.url)) {
          const bcUrl = raw.trackUrl || raw.url;
          try {
            const r = await fetch('/api/bandcamp-search', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'fetch-album', albumUrl: bcUrl }),
            });
            const data = r.ok ? await r.json() : { tracks: [] };
            const tracks = (data.tracks || []).map(t => ({
              id: `bc-${t.trackId}`,
              title: t.title,
              artist: t.artistName || raw.artistName,
              cover: t.artworkUrl || raw.artworkUrl,
              trackUrl: t.trackUrl,
              provider: 'bandcamp',
            }));
            openNativeAlbumFast({
              id: raw.id,
              title: raw.title,
              artist: raw.artistName,
              cover: raw.artworkUrl,
              provider: 'bandcamp',
              tracks,
            });
          } catch {}
          return;
        }
        let tracks = raw.tracks || [];
        if (!tracks.length && isStreamingAvailable() && raw.provider && (raw.playlistId || raw.url)) {
          try {
            tracks = await fetchAccountLibrary(raw.provider, 'playlistTracks', { playlistId: raw.playlistId, playlistUrl: raw.url });
            raw.tracks = tracks;
          } catch {}
        }
        openNativeAlbumFast({
          id: raw.id,
          title: raw.title,
          artist: raw.artistName || raw.artist || '',
          cover: raw.artworkUrl || raw.cover || '',
          provider: raw.provider || null,
          tracks,
        });
        return;
      }
      const playable = toPlayable(raw);
      setSearchQueue([playable], 0);
      playSearchItem(playable);
      window.__kyoyuPlayerCmd?.('expand');
    }
  };

  return (
    <div className="page search-page animate-in">

      {/* Spacer for native filter overlay — exact same 82px height as Library page barSpacer */}
      <div style={{ height: 82 }} />

      {/* Search History — shown when no active query */}
      {showHistory && (
        <div className="search-history">
          {history.length > 0 ? (
            <div className="search-history-list">
              {groupHistoryByDay(history).map((group, idx) => (
                <div key={group.label} className="search-history-group">
                  <div className="search-history-group-label" style={idx === 0 ? { marginTop: 0, paddingTop: 0 } : undefined}>
                    <span>{group.label}</span>
                    {idx === 0 && (
                      <button className="search-history-clear" onClick={clearHistory}>Clear All</button>
                    )}
                  </div>
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

      {/* #0 First Search Results Category: Library (ALWAYS shown first whatever filter is selected) */}
      {!isQueryEmpty && hasLibraryMatches && (
        <div className="search-results-list" style={{ marginBottom: 18 }}>
          {/* Thin full-width horizontal line above the Library title */}
          <div style={{
            height: 1,
            background: 'var(--glass-border, rgba(128, 128, 128, 0.25))',
            marginLeft: -20,
            marginRight: -20,
            marginBottom: 12,
          }} />
          <div className="search-section">
            <div className="search-section-title">Library</div>
            {libraryMatches.map(item => {
              const cleanArt = (item.artworkUrl && item.artworkUrl.includes('bcbits.com'))
                ? item.artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg')
                : item.artworkUrl;
              const isCircle = item.kind === 'artist' || item.kind === 'label';
              const subtitleSuffix = item.kind === 'album'
                ? ' · Album'
                : item.kind === 'playlist'
                ? ' · Playlist'
                : item.kind === 'artist' && !String(item.artistName || '').includes('Artist')
                ? ' · Artist'
                : item.kind === 'label' && !String(item.artistName || '').includes('Label')
                ? ' · Label'
                : '';
              return (
                <div
                  key={item.id}
                  className={`search-result-row${isCircle ? ' search-artist-row' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleLibraryItemClick(item)}
                >
                  <div className={`search-result-art${isCircle ? ' artist-avatar circle' : ''}`}>
                    {cleanArt ? (
                      <img src={cleanArt} alt="" loading="lazy" />
                    ) : (
                      <div className={`search-result-art-placeholder${isCircle ? ' circle' : ''}`} />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{item.title}</span>
                    <span className="search-result-artist">
                      {item.artistName}{subtitleSuffix}
                    </span>
                  </div>
                  {!isCircle && (
                    <div className="search-result-actions">
                      <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Thin full-width horizontal line below the last result of the Library section */}
          <div style={{
            height: 1,
            background: 'var(--glass-border, rgba(128, 128, 128, 0.25))',
            marginLeft: -20,
            marginRight: -20,
            marginTop: 10,
          }} />
        </div>
      )}

      {/* Pinned Genre Results (1 Primary Genre + 4 Related Genres) */}
      {!isQueryEmpty && matchedGenreSearch && (
        <div className="search-results-list" style={{ marginBottom: 18 }}>
          <div className="search-section">
            <div className="search-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Genres</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251, 127, 51, 0.85)', textTransform: 'none', letterSpacing: 0 }}>
                Tap any genre to open its intelligence sheet
              </span>
            </div>

            {/* #1 Primary Matched Genre Result */}
            {(() => {
              const g = matchedGenreSearch.primaryGenre;
              return (
                <div
                  key={`genre-primary-${g.id}`}
                  className="search-result-row"
                  style={{
                    cursor: 'pointer',
                    background: 'rgba(251, 127, 51, 0.09)',
                    border: '1px solid rgba(251, 127, 51, 0.28)',
                    borderRadius: 12,
                    padding: '8px 10px',
                    marginBottom: 8,
                  }}
                  onClick={() => openRichGenreSheet(g.name)}
                >
                  <div
                    className="search-result-art"
                    style={{
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(251, 127, 51, 0.32), rgba(251, 127, 51, 0.12))',
                      border: '1px solid rgba(251, 127, 51, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Disc size={22} color="#fb7f33" />
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title" style={{ color: '#fb7f33', fontWeight: 700 }}>
                      {g.name}
                    </span>
                    <span className="search-result-artist">
                      Genre · {g.superGenre || 'Electronic'}
                      {g.originYear ? ` · ${g.originYear}` : ''}
                      {g.bpmRange ? ` · ${g.bpmRange}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fb7f33',
                      background: 'rgba(251, 127, 51, 0.16)',
                      padding: '4px 9px',
                      borderRadius: 999,
                    }}>
                      Genre Sheet
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* #2–#5: 4 Related Genre Results directly underneath */}
            {(matchedGenreSearch.relatedGenres || []).slice(0, 4).map((relG) => (
              <div
                key={`genre-rel-${relG.id}`}
                className="search-result-row"
                style={{ cursor: 'pointer' }}
                onClick={() => openRichGenreSheet(relG.name)}
              >
                <div
                  className="search-result-art"
                  style={{
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Disc size={19} color="rgba(251, 127, 51, 0.8)" />
                </div>
                <div className="search-result-info">
                  <span className="search-result-title">{relG.name}</span>
                  <span className="search-result-artist">
                    Related Genre · {relG.superGenre || 'Electronic'}
                    {relG.bpmRange ? ` · ${relG.bpmRange}` : relG.originYear ? ` · ${relG.originYear}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '3px 8px',
                    borderRadius: 999,
                  }}>
                    Related
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{
            height: 1,
            background: 'var(--glass-border, rgba(128, 128, 128, 0.25))',
            marginLeft: -20,
            marginRight: -20,
            marginTop: 10,
          }} />
        </div>
      )}

      {/* Loading state */}
      {(loading || providerRetrying) && query.length > 0 && !hasResults && !hasExternal && !hasLibraryMatches && !matchedGenreSearch && (
        <div className="search-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <Loader2 className="spin-icon" size={28} color="var(--text-muted)" />
          <span>{providerRetrying ? 'Loading results...' : 'Searching...'}</span>
        </div>
      )}

      {/* No results */}
      {!loading && !providerRetrying && query.length > 0 && !hasResults && !hasExternal && !hasLibraryMatches && !matchedGenreSearch && (
        <div className="search-empty">No results found</div>
      )}

      {/* ── Results (Grouped into Artist, Release, Title, Label with separation lines when activeFilter === 'all') ── */}
      {!isQueryEmpty && (hasResults || rankedAll.length > 0) && (() => {
        const renderExternalRow = (item) => {
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
                } else if (isPlaylist && item.provider === 'tidal') {
                  try {
                    let tracks = [];
                    if (isStreamingAvailable()) {
                      const raw = await fetchAccountLibrary('tidal', 'playlistTracks', { playlistId: item.id });
                      tracks = (raw || []).map(t => ({
                        id: t.id || `td-${t.tidalId || t.providerItemId}`,
                        title: t.title,
                        artist: t.artist || t.artistName || '',
                        duration: t.duration || 0,
                        provider: 'tidal',
                        providerItemId: t.tidalId || t.providerItemId || String(t.id || '').replace(/^td-/, ''),
                        cover: t.cover || t.artworkUrl || item.artworkUrl || '',
                      }));
                    }
                    if (!tracks.length) {
                      const r = await fetch('/api/youtube-search', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'fetch-tidal-playlist', provider: 'tidal', playlistId: item.id }),
                      });
                      if (r.ok) {
                        tracks = ((await r.json()).tracks || []).map(t => ({
                          ...t,
                          artist: t.artistName || t.artist || '',
                          provider: 'tidal',
                          providerItemId: t.tidalId || t.providerItemId,
                          cover: t.artworkUrl || item.artworkUrl || '',
                        }));
                      }
                    }
                    openNativeAlbumFast({
                      id: item.id || `td-pl-${item.tidalId}`,
                      title: item.title || '',
                      artist: item.artistName || 'TIDAL',
                      cover: item.artworkUrl || '',
                      provider: 'tidal',
                      tracks,
                    });
                  } catch (e) { /* ignore */ }
                } else if (isArtist) {
                  openRichArtistSheet({
                    ...item,
                    name: item.title || item.artistName || 'Unknown Artist',
                    cover: item.coverImage || item.artworkUrl || item.thumbnail || item.thumb || item.profileAvatar || item.cover || '',
                    url: item.trackUrl || item.url || '',
                  });
                } else if (isLabel) {
                  openRichLabelSheet({
                    ...item,
                    name: item.title || item.artistName || 'Unknown Label',
                    cover: item.coverImage || item.artworkUrl || item.thumbnail || item.thumb || item.profileAvatar || item.cover || '',
                    url: item.trackUrl || item.url || '',
                  });
                } else if (isRelease) {
                  // Universal Album Sheet: fetch tracks from provider, info from Discogs
                  try {
                    let tracks = [];
                    let bcAlbumMeta = null;
                    if (item.provider === 'bandcamp') {
                      const r = await fetch('/api/bandcamp-search', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'fetch-album', albumUrl: item.albumUrl || item.trackUrl }),
                      });
                      if (r.ok) {
                        const bcData = await r.json();
                        bcAlbumMeta = bcData.album || null;
                        tracks = (bcData.tracks || []).map(t => ({ ...t, id: `bc-${t.trackId}`, url: t.streamUrl, trackUrl: t.trackUrl, providerItemId: t.trackUrl, cover: t.artworkUrl || item.artworkUrl || '' }));
                      }
                    } else if (item.provider === 'spotify') {
                      const r = await fetch('/api/youtube-search', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'fetch-spotify-album', provider: 'spotify', albumId: item.id }),
                      });
                      if (r.ok) tracks = (await r.json()).tracks.map(t => ({ ...t, providerItemId: t.spotifyId }));
                    } else if (item.provider === 'applemusic') {
                      if (isStreamingAvailable()) {
                        try {
                          const raw = await fetchAccountLibrary('applemusic', 'playlistTracks', { playlistId: item.playlistId || item.albumId || item.id });
                          tracks = (raw || []).map(t => {
                            const rawId = t.trackId || t.appleMusicId || t.providerItemId || String(t.id || '').replace(/^am-/, '');
                            const art = t.cover || t.artworkUrl || item.artworkUrl || item.cover || '';
                            return {
                              id: t.id || `am-${rawId}`,
                              title: t.title,
                              artist: t.artist || t.artistName || item.artistName || '',
                              duration: t.duration || 0,
                              provider: 'applemusic',
                              providerItemId: String(rawId),
                              trackId: String(rawId),
                              appleMusicId: String(rawId),
                              cover: art,
                              artworkUrl: art,
                            };
                          });
                        } catch {}
                      }
                      if (!tracks.length) {
                        const amId = String(item.albumId || item.providerItemId || item.id || '').replace(/^am-alb?-/, '');
                        const r = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(amId)}&entity=song`);
                        if (r.ok) {
                          const data = await r.json();
                          tracks = (data.results || []).slice(1).map(t => {
                            const art = (t.artworkUrl100 || '').replace(/\/[0-9]+x[0-9]+([a-zA-Z0-9._-]*)$/, '/600x600$1') || item.artworkUrl || item.cover || '';
                            return {
                              id: `am-${t.trackId}`,
                              title: t.trackName,
                              artist: t.artistName,
                              duration: Math.floor((t.trackTimeMillis || 0) / 1000),
                              provider: 'applemusic',
                              providerItemId: String(t.trackId),
                              trackId: String(t.trackId),
                              appleMusicId: String(t.trackId),
                              cover: art,
                              artworkUrl: art,
                            };
                          });
                        }
                      }
                    } else if (item.provider === 'tidal') {
                      if (isStreamingAvailable()) {
                        try {
                          const raw = await fetchAccountLibrary('tidal', 'playlistTracks', { playlistId: item.id });
                          tracks = (raw || []).map(t => ({
                            id: t.id || `td-${t.tidalId || t.providerItemId}`,
                            title: t.title,
                            artist: t.artist || t.artistName || item.artistName || '',
                            duration: t.duration || 0,
                            provider: 'tidal',
                            providerItemId: t.tidalId || t.providerItemId || String(t.id || '').replace(/^td-/, ''),
                            cover: t.cover || t.artworkUrl || item.artworkUrl || '',
                          }));
                        } catch {}
                      }
                      if (!tracks.length) {
                        const r = await fetch('/api/youtube-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'fetch-tidal-album', provider: 'tidal', albumId: item.id }),
                        });
                        if (r.ok) {
                          tracks = ((await r.json()).tracks || []).map(t => ({
                            ...t,
                            artist: t.artistName || t.artist || item.artistName || '',
                            provider: 'tidal',
                            providerItemId: t.tidalId || t.providerItemId,
                            cover: t.artworkUrl || item.artworkUrl || '',
                          }));
                        }
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
                    const mergedFormats = Array.from(new Set([...(bcAlbumMeta?.formats || []), ...(info.formats || [])]));
                    const desc = [
                      mergedFormats.length ? `Format: ${mergedFormats.join(' / ')}` : '',
                      info.country ? `Country: ${info.country}` : '',
                      info.description || '',
                      info.credits?.mixing?.length ? `Mixed by: ${info.credits.mixing.join(', ')}` : '',
                      info.credits?.mastering?.length ? `Mastered by: ${info.credits.mastering.join(', ')}` : '',
                      bioText,
                      formatLinks(info.links)
                    ].filter(Boolean).join('\n');

                    openNativeAlbumFast({
                      id: item.id || `album-${item.title}`,
                      title: bcAlbumMeta?.title || info.album || item.title || '',
                      artist: bcAlbumMeta?.artistName || info.artist || item.artistName || '',
                      cover: bcAlbumMeta?.artworkUrl || item.coverImage || item.artworkUrl || item.thumbnail || item.thumb || '',
                      year: bcAlbumMeta?.year || info.year || item.year || null,
                      genre: info.genre || item.genre || '',
                      label: bcAlbumMeta?.label || info.label || item.label || '',
                      provider: item.provider,
                      formats: mergedFormats,
                      description: desc,
                      tracks: tracks,
                    });
                  } catch (e) { /* ignore */ }
                } else if (item._isGenreCuratedTrack || String(item.url || '').startsWith('resolve:')) {
                  playGenreTrack({
                    id: item.id,
                    title: item.title,
                    artist: item.artistName,
                    label: item.label,
                    year: item.year,
                    trackUrl: item.trackUrl || item.url,
                    coverImage: item.artworkUrl || item.coverImage,
                  });
                  window.__kyoyuPlayerCmd?.('expand');
                } else if (!isArtist && !isLabel) {
                  handleSearchPlay({
                    id: item.id || `${item.provider}-${item.trackId || item.videoId}`,
                    title: item.title,
                    artistName: item.artistName,
                    artworkUrl: item.artworkUrl || item.thumbnail,
                    duration: item.duration || 0,
                    provider: item.provider,
                    providerItemId: item.permalinkUrl || item.trackUrl || item.providerItemId || item.spotifyId || item.tidalId,
                    spotifyId: item.spotifyId,
                    tidalId: item.tidalId,
                    albumName: item.albumName,
                    url: item.url,
                    scTrackId: item.trackId,
                    trackId: item.trackId,
                    videoId: item.videoId,
                  });
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="search-result-art discogs-art" style={{ borderRadius: isArtist || isLabel ? '50%' : '8px' }}>
                {(item.coverImage || item.artworkUrl || item.thumbnail || item.thumb) ? (() => {
                  const rawArt = item.coverImage || item.artworkUrl || item.thumbnail || item.thumb;
                  const cleanArt = rawArt.includes('bcbits.com') ? rawArt.replace(/_[0-9]+\.jpg/, '_10.jpg') : rawArt;
                  return <img src={cleanArt} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />;
                })() : (
                  <EntityPlaceholder name={item.title} type={isArtist ? 'artist' : isLabel ? 'label' : 'release'} />
                )}
              </div>
              <div className="search-result-info">
                <span className="search-result-title">{item.title}</span>
                <span className="search-result-artist">
                  {item.artistName || entityLabel(item)}
                  {isPlaylist ? ` · ${item.trackCount || 0} tracks` : ''}
                  {(item.year || item.released) ? ` · ${item.year || item.released}` : ''}
                </span>
              </div>
              {!isArtist && !isLabel && (
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>
                  <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
                </div>
              )}
            </div>
          );
        };

        if (activeFilter === 'all') {
          const extArtists = rankedAll.filter(i => i.entityType === 'artist');
          const extReleases = rankedAll.filter(i => i.entityType === 'release' || i.entityType === 'album' || i.entityType === 'playlist');
          const extTitles = rankedAll.filter(i => !i.entityType || i.entityType === 'track');
          const extLabels = rankedAll.filter(i => i.entityType === 'label');

          const sections = [
            {
              key: 'artist',
              title: 'Artist',
              hasItems: artists.length > 0 || extArtists.length > 0,
              content: (
                <>
                  {artists.map(renderArtistRow)}
                  {extArtists.map(renderExternalRow)}
                </>
              ),
            },
            {
              key: 'release',
              title: 'Release',
              hasItems: albums.length > 0 || extReleases.length > 0,
              content: (
                <>
                  {albums.map(renderAlbumRow)}
                  {extReleases.map(renderExternalRow)}
                </>
              ),
            },
            {
              key: 'title',
              title: 'Title',
              hasItems: titleList.length > 0 || podcastList.length > 0 || extTitles.length > 0,
              content: (
                <>
                  {titleList.map(t => renderTrackRow(t, false))}
                  {podcastList.map(t => renderTrackRow(t, true))}
                  {extTitles.map(renderExternalRow)}
                </>
              ),
            },
            {
              key: 'label',
              title: 'Label',
              hasItems: labels.length > 0 || extLabels.length > 0,
              content: (
                <>
                  {labels.map(renderLabelRow)}
                  {extLabels.map(renderExternalRow)}
                </>
              ),
            },
          ].filter(s => s.hasItems);

          const hadTopDivider = hasLibraryMatches || Boolean(matchedGenreSearch);

          return (
            <div className="search-results-list search-external-section">
              {sections.map((sec, idx) => (
                <div key={sec.key} style={{ marginBottom: 18 }}>
                  {idx === 0 && !hadTopDivider && (
                    <div style={{
                      height: 1,
                      background: 'var(--glass-border, rgba(128, 128, 128, 0.25))',
                      marginLeft: -20,
                      marginRight: -20,
                      marginBottom: 12,
                    }} />
                  )}
                  <div className="search-section">
                    <div className="search-section-title">{sec.title}</div>
                    {sec.content}
                  </div>
                  <div style={{
                    height: 1,
                    background: 'var(--glass-border, rgba(128, 128, 128, 0.25))',
                    marginLeft: -20,
                    marginRight: -20,
                    marginTop: 10,
                  }} />
                </div>
              ))}
            </div>
          );
        }

        return (
          <>
            {hasResults && (
              <div className="search-results-list">
                {filterMatch('albums') && albums.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Releases</div>
                    {albums.map(renderAlbumRow)}
                  </div>
                )}
                {filterMatch('titles') && titleList.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Titles</div>
                    {titleList.map(t => renderTrackRow(t, false))}
                  </div>
                )}
                {filterMatch('artists') && artists.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Artists</div>
                    {artists.map(renderArtistRow)}
                  </div>
                )}
                {filterMatch('labels') && labels.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Labels</div>
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
            {rankedAll.length > 0 && (
              <div className="search-results-list search-external-section">
                {rankedAll.map(renderExternalRow)}
              </div>
            )}
          </>
        );
      })()}


      {!isQueryEmpty && rankedAll.length > 0 && hasMoreToShow && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0', color: 'var(--text-muted)' }}>
          {isLoadingMore ? <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : null}
        </div>
      )}

      {playlistSheet && (
        <div className="search-playlist-sheet" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'var(--glass-bg-elevated)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', padding: '60px 16px 20px',
          overflowY: 'auto',
        }}>
          <button onClick={() => setPlaylistSheet(null)} style={{
            position: 'absolute', top: 16, right: 16, background: 'var(--glass-bg-active)',
            border: 'none', borderRadius: '50%', width: 36, height: 36, color: 'var(--text-primary)',
            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {playlistSheet.artworkUrl && (
              <img src={playlistSheet.artworkUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
            )}
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>{playlistSheet.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{playlistSheet.artistName} · {(playlistSheet.tracks || []).length} tracks</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(playlistSheet.tracks || []).map((t, i) => (
              <div key={t.id || t.trackId || i} className="search-result-row search-external-row"
                onClick={() => {
                  if (t.id && !t.permalinkUrl) {
                    playSaved(t, playlistSheet.tracks);
                  } else {
                    handleSearchPlay({
                      id: t.id || `sc-${t.trackId}`,
                      title: t.title,
                      artistName: t.artistName || t.artist,
                      artworkUrl: t.artworkUrl || t.cover,
                      duration: t.duration || 0,
                      provider: t.provider || 'soundcloud',
                      providerItemId: t.permalinkUrl || t.providerItemId || t.trackUrl,
                      scTrackId: t.scTrackId || t.trackId,
                    });
                  }
                }}>
                <div className="search-result-art discogs-art" style={{ borderRadius: '8px' }}>
                  {(t.artworkUrl || t.cover) ? (
                    <img src={t.artworkUrl || t.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--grey-800)', borderRadius: 'inherit' }} />
                  )}
                </div>
                <div className="search-result-info">
                  <span className="search-result-title">{t.title}</span>
                  <span className="search-result-artist">{t.artistName || t.artist}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>
                  <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
