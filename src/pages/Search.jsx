import { useState, useEffect, useRef } from 'react';
import { Clock, X, Download, Heart, ListPlus, Play, UserPlus, UserCheck, ExternalLink, Disc3, Music, Tag } from 'lucide-react';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import { unifiedSearch, resolveBandcamp } from '../lib/unifiedSearch';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import ContentStateBadge from '../components/ContentStateBadge';
import EntityPlaceholder from '../components/EntityPlaceholder';
import './Search.css';

export default function Search() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState([]);
  const [externalResults, setExternalResults] = useState({ artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [] });
  const [loading, setLoading] = useState(false);
  const [bandcampLoading, setBandcampLoading] = useState(null); // trackUrl of currently resolving BC track
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeProvider, setActiveProvider] = useState('all');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const debounceRef = useRef(null);
  const { isFollowing, toggleFollow } = useLibrary();
  const { playTrack, playYouTube, playSoundCloud, setSearchQueue, playSearchItem } = usePlayer();

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
      // 114px was the top of the first filter card. 128px padding created a perfect 14px gap.
      // Now we have a second filter bar stacked on top (33px height + 8px gap = 41px extra).
      // So we increase padding to 169px (128 + 41).
      const paddingStyle = keyboardHeight > 0 
        ? (keyboardHeight + 169) + 'px' 
        : '169px';
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
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      unifiedSearch(query.trim())
        .then(({ nativeTracks, external }) => {
          setResults(nativeTracks);
          setExternalResults(external);
        })
        .catch(() => {
          setResults([]);
          setExternalResults({ artists: [], releases: [], labels: [], soundcloud: [] });
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
  const hasExternal = externalResults.artists.length > 0 || externalResults.releases.length > 0 || externalResults.labels.length > 0 || (externalResults.youtube && externalResults.youtube.length > 0);
  const showHistory = !hasResults && !hasExternal && query.length < 2 && history.length > 0;

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
          
          {(activeProvider === 'all' || activeProvider === 'native') && (activeFilter === 'all' || activeFilter === 'albums') && albums.length > 0 && (
            <div className="search-section">
              {activeFilter === 'all' && <div className="search-section-title">Albums</div>}
              {albums.map(renderAlbumRow)}
            </div>
          )}

          {(activeProvider === 'all' || activeProvider === 'native') && (activeFilter === 'all' || activeFilter === 'titles') && titleList.length > 0 && (
            <div className="search-section">
              {activeFilter === 'all' && <div className="search-section-title">Titles</div>}
              {titleList.map(t => renderTrackRow(t, false))}
            </div>
          )}

          {(activeProvider === 'all' || activeProvider === 'native') && (activeFilter === 'all' || activeFilter === 'artists') && artists.length > 0 && (
            <div className="search-section">
              {activeFilter === 'all' && <div className="search-section-title">Artists</div>}
              {artists.map(renderArtistRow)}
            </div>
          )}

          {(activeProvider === 'all' || activeProvider === 'native') && (activeFilter === 'all' || activeFilter === 'labels') && labels.length > 0 && (
            <div className="search-section">
              {activeFilter === 'all' && <div className="search-section-title">Labels</div>}
              {labels.map(renderLabelRow)}
            </div>
          )}

          {(activeProvider === 'all' || activeProvider === 'native') && (activeFilter === 'all' || activeFilter === 'podcasts') && podcastList.length > 0 && (
            <div className="search-section">
              {activeFilter === 'all' && <div className="search-section-title">Podcasts</div>}
              {podcastList.map(t => renderTrackRow(t, true))}
            </div>
          )}

        </div>
      )}

      {/* Loading state */}
      {loading && query.length >= 2 && !hasResults && (
        <div className="search-loading">Searching...</div>
      )}

      {/* No results */}
      {!loading && query.length >= 2 && !hasResults && !hasExternal && (
        <div className="search-empty">No results found</div>
      )}

      {/* External Results from Discogs */}
      {hasExternal && (activeFilter === 'all') && (activeProvider === 'all' || activeProvider === 'discogs') && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header">
            Discogs
          </div>

          {externalResults.artists.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Artists</div>
              {externalResults.artists.map(artist => (
                <div key={artist.id} className="search-result-row search-artist-row search-external-row"
                  onClick={() => window.__kyoyuGo && window.__kyoyuGo(`/artist/discogs-${artist.discogsId}`)}>
                  <div className="search-result-art artist-avatar discogs-art">
                    {artist.thumb ? (
                      <img src={artist.thumb} alt={artist.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      <EntityPlaceholder name={artist.name} type="artist" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <span className="search-result-title">{artist.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {externalResults.releases.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Releases</div>
              {externalResults.releases.map(release => (
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

          {externalResults.labels.length > 0 && (
            <div className="search-section">
              <div className="search-section-subtitle">Labels</div>
              {externalResults.labels.map(label => (
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
        </div>
      )}

      {/* ── YouTube Results ── */}
      {externalResults.youtube && externalResults.youtube.length > 0 && activeFilter === 'all' && (activeProvider === 'all' || activeProvider === 'youtube') && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#FF0000' }}>
            YouTube
          </div>
          <div className="search-section">
            {externalResults.youtube.map(yt => (
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
                <div className="search-result-actions">
                  <Play size={16} style={{ opacity: 0.6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SoundCloud Results ── */}
      {externalResults.soundcloud && externalResults.soundcloud.length > 0 && activeFilter === 'all' && (activeProvider === 'all' || activeProvider === 'soundcloud') && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#FF5500' }}>
            SoundCloud
          </div>
          <div className="search-section">
            {externalResults.soundcloud.map(sc => (
              <div key={sc.id} className="search-result-row search-external-row"
                onClick={() => handleSearchPlay({
                  id: sc.id || `sc-${sc.trackId}`,
                  title: sc.title,
                  artistName: sc.artistName,
                  artworkUrl: sc.artworkUrl,
                  duration: sc.duration || 0,
                  provider: 'soundcloud',
                  providerItemId: sc.permalinkUrl,
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
                <div className="search-result-actions">
                  <Play size={16} style={{ opacity: 0.6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Bandcamp Results ── */}
      {externalResults.bandcamp && externalResults.bandcamp.length > 0 && activeFilter === 'all' && (activeProvider === 'all' || activeProvider === 'bandcamp') && (
        <div className="search-results-list search-external-section">
          <div className="search-section-title search-external-header" style={{ color: '#1DA0C3' }}>
            Bandcamp
          </div>
          <div className="search-section">
            {externalResults.bandcamp.map(bc => (
              <div key={bc.id} className="search-result-row search-external-row"
                style={{ opacity: bandcampLoading === bc.trackUrl ? 0.5 : 1 }}
                onClick={() => {
                  if (bandcampLoading) return;
                  setBandcampLoading(bc.trackUrl);
                  handleSearchPlay({
                    id: bc.id || `bc-${bc.trackId}`,
                    title: bc.title,
                    artistName: bc.artistName,
                    artworkUrl: bc.artworkUrl,
                    duration: 0,
                    provider: 'bandcamp',
                    providerItemId: bc.trackUrl,
                  });
                  // Clear loading after a delay (resolve happens in PlayerContext)
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
                  <span className="search-result-artist">{bc.artistName}{bc.albumName ? ` · ${bc.albumName}` : ''}</span>
                </div>
                <div className="search-result-actions">
                  {bandcampLoading === bc.trackUrl ? (
                    <span style={{ opacity: 0.4, fontSize: 11 }}>···</span>
                  ) : (
                    <Play size={16} style={{ opacity: 0.6 }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
