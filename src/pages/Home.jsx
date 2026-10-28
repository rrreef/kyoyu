import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowRight, Lock, Music2 } from 'lucide-react';
import { berghainEvents } from '../data/berghainEvents';
import { BerghainEventCard } from '../components/ui/Cards';
import { usePlayer, historyReplayInfo } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useHomeLayoutLive } from '../contexts/DisplayContext';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import AccountItemList, { sanitizeArtworkUrl, pinImageInMemory, preloadImagesInMemory, toPlayable, openContentActionCard, usePinnedAndHiddenContent } from '../components/AccountItems';
import { useConnectedLibrary, preloadConnectedLibrary } from '../lib/useConnectedLibrary';
import { fetchAccountLibrary, useProviderPriority, useHomeSectionRows, DEFAULT_HOME_SECTION_ROWS, HOME_TITLES_PER_ROW, cleanTrackOrReleaseTitle, splitCleanMetadata } from '../lib/streaming';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet, { openNativeAlbumFast, registerAlbumPlayback } from '../components/ui/AlbumSheet';
import EventSheet from '../components/ui/EventSheet';
import './Home.css';

const PUBLIC_RELEASES_CACHE_KEY = 'kyoyu-public-releases-cache-v1';
let _cachedPublicReleases = [];
let _publicReleasesPromise = null;
const _publicReleaseListeners = new Set();
const _expandedVisibleCounts = new Map();
const _horizontalSwipePageCounts = new Map();

function CatalogSwipeRow({ sectionKey, pages, renderPage }) {
  const [renderedPages, setRenderedPages] = useState(() =>
    Math.min(pages.length, Math.max(2, _horizontalSwipePageCounts.get(sectionKey) || 2))
  );

  useEffect(() => {
    const saved = _horizontalSwipePageCounts.get(sectionKey) || 2;
    const target = Math.min(pages.length, Math.max(2, saved));
    if (target > renderedPages) setRenderedPages(target);
  }, [sectionKey, pages.length, renderedPages]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (!el) return;
    const pageW = Math.max(1, el.clientWidth);
    const curPage = Math.floor((el.scrollLeft + pageW * 0.25) / pageW);
    const needed = Math.min(pages.length, curPage + 3);
    if (needed > renderedPages) {
      _horizontalSwipePageCounts.set(sectionKey, Math.max(_horizontalSwipePageCounts.get(sectionKey) || 2, needed));
      setRenderedPages(needed);
    }
  }, [sectionKey, pages.length, renderedPages]);

  return (
    <div className="catalog-swipe-row" onScroll={handleScroll}>
      {pages.slice(0, renderedPages).map((pageItems, pIdx) => (
        <div key={`${sectionKey}-p${pIdx}`} className="catalog-swipe-page">
          {renderPage(pageItems, pIdx)}
        </div>
      ))}
    </div>
  );
}

function HeroMarqueeRow({ className, children }) {
  const wrapRef = useRef(null);
  const copyRef = useRef(null);
  const [overflowState, setOverflowState] = useState({ overflowing: false, duration: 9 });
  const textStr = typeof children === 'string' ? children : String(children ?? '');

  useEffect(() => {
    const wrap = wrapRef.current;
    const copy = copyRef.current;
    if (!wrap || !copy) return;
    const measure = () => {
      const containerW = wrap.clientWidth;
      const contentW = copy.scrollWidth;
      const isOver = containerW > 0 && contentW > containerW + 1;
      const dur = Math.max(6, Math.min(18, (contentW + 36) / 28));
      setOverflowState(prev => (
        prev.overflowing === isOver && Math.abs(prev.duration - dur) < 0.2
          ? prev
          : { overflowing: isOver, duration: dur }
      ));
    };
    measure();
    const t = setTimeout(measure, 120);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(wrap);
    }
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
    };
  }, [textStr]);

  if (!textStr) return null;

  return (
    <div ref={wrapRef} className={className}>
      <div
        className={`featured-hero-marquee-track${overflowState.overflowing ? ' is-overflowing' : ''}`}
        style={overflowState.overflowing ? { '--hero-marquee-dur': `${overflowState.duration.toFixed(1)}s` } : undefined}
      >
        <span
          ref={copyRef}
          className={overflowState.overflowing ? 'featured-hero-marquee-copy' : undefined}
        >
          {textStr}
        </span>
        {overflowState.overflowing && (
          <span className="featured-hero-marquee-copy" aria-hidden="true">
            {textStr}
          </span>
        )}
      </div>
    </div>
  );
}

try {
  if (typeof window !== 'undefined') {
    const rawPub = localStorage.getItem(PUBLIC_RELEASES_CACHE_KEY);
    if (rawPub) {
      const parsed = JSON.parse(rawPub);
      if (Array.isArray(parsed) && parsed.length) {
        _cachedPublicReleases = parsed;
        preloadImagesInMemory(parsed, 18);
      }
    }
    const rawHist = localStorage.getItem('kyoyu-play-history');
    if (rawHist) {
      const parsedHist = JSON.parse(rawHist);
      if (Array.isArray(parsedHist) && parsedHist.length) {
        preloadImagesInMemory(parsedHist, 18);
      }
    }
  }
} catch (_) {}

export function preloadHomeContent() {
  if (typeof window === 'undefined') return;
  preloadConnectedLibrary();
  if (!_publicReleasesPromise) {
    _publicReleasesPromise = fetchPublicTracks()
      .then((tracks) => {
        if (Array.isArray(tracks)) {
          _cachedPublicReleases = tracks;
          preloadImagesInMemory(tracks, 60);
          try {
            localStorage.setItem(PUBLIC_RELEASES_CACHE_KEY, JSON.stringify(tracks.slice(0, 60)));
          } catch (_) {}
          _publicReleaseListeners.forEach((fn) => fn(tracks));
        }
        return tracks;
      })
      .catch(() => _cachedPublicReleases);
  }
}

if (typeof window !== 'undefined') {
  preloadHomeContent();
}

const HERO_META_CACHE_KEY = 'kyoyu-hero-card-meta-v6';

function cleanHeroLabel(rawLabel, rawArtist = '') {
  const clean = String(rawLabel || '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(sub-label.*?\)/i, '')
    .split('—')[0]
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  if (!clean || clean === '—' || clean === '-') return '';
  if (/^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?)$/i.test(clean)) return '';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, '');
  const lNorm = norm(clean);
  const aNorm = norm(rawArtist);
  if (!lNorm || (aNorm && lNorm === aNorm)) return '';
  const collabs = String(rawArtist || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(norm).filter(Boolean);
  if (collabs.includes(lNorm)) return '';
  return clean;
}

function normalizeHeroFormats(rawFormats, defaultDigital = true) {
  const list = Array.isArray(rawFormats)
    ? rawFormats
    : (typeof rawFormats === 'string' && rawFormats.trim() ? [rawFormats] : []);
  const seen = new Set();
  const ordered = [];
  const addFmt = (f) => {
    const clean = String(f || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(clean);
  };
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (/\b(t-?shirt|shirt|hoodie|sweater|sweatshirt|tote|bag|poster|print|sticker|hat|cap|beanie|patch|pin|mug|slipmat|ticket)\b/i.test(s)) continue;
    if (/^artist$/i.test(s)) { addFmt('Artist'); continue; }
    if (/^label$/i.test(s)) { addFmt('Label'); continue; }
    let matchedVinylSize = false;
    if (/\b12\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 12"');
      matchedVinylSize = true;
    }
    if (/\b10\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 10"');
      matchedVinylSize = true;
    }
    if (/\b7\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 7"');
      matchedVinylSize = true;
    }
    if (/\b(?:2\s*x\s*lp|2\s*x\s*vinyl|double\s+(?:vinyl|lp)|2lp)\b/i.test(s)) {
      if (!matchedVinylSize) addFmt('Vinyl 2xLP');
      matchedVinylSize = true;
    } else if (!matchedVinylSize && /\b(?:vinyl\s+lp|lp\s+vinyl|\blp\b|180\s*g(?:ram)?\s+lp)\b/i.test(s)) {
      addFmt('Vinyl LP');
      matchedVinylSize = true;
    }
    if (/lathe/i.test(s)) {
      addFmt('Lathe Cut');
    } else if (!matchedVinylSize && /vinyl|test pressing|\bwax\b/i.test(s)) {
      addFmt('Vinyl');
    }
    if (/flexi/i.test(s)) addFmt('Flexi-disc');
    if (/shellac/i.test(s)) addFmt('Shellac');
    if (/reel-to-reel|reel to reel/i.test(s)) addFmt('Reel-To-Reel');
    if (/8-track/i.test(s)) addFmt('8-Track');
    if (/minidisc/i.test(s)) addFmt('MiniDisc');
    if (/cassette|\btape\b/i.test(s)) addFmt('Cassette');
    if (/compact disc|\bcd\b|cd-r|cd-rom|digipak/i.test(s)) addFmt('CD');
    if (/\busb\b|memory stick/i.test(s)) addFmt('USB');
    if (/\bvhs\b/i.test(s)) addFmt('VHS');
    if (/\bdvd\b|blu-?ray/i.test(s)) addFmt('DVD');
    if (/box\s*set/i.test(s)) addFmt('Box Set');
    if (/file|digital|mp3|flac|wav|aiff|alac|aac|ogg/i.test(s)) addFmt('Digital');
  }
  const hasSpecificVinyl = seen.has('vinyl 12"') || seen.has('vinyl 10"') || seen.has('vinyl 7"') || seen.has('vinyl 2xlp') || seen.has('vinyl lp');
  const filtered = hasSpecificVinyl
    ? ordered.filter(f => f.toLowerCase() !== 'vinyl')
    : ordered;
  if (defaultDigital && !seen.has('digital') && !seen.has('artist') && !seen.has('label')) {
    filtered.push('Digital');
  }
  return filtered;
}

function formatHeroReleaseDate(rawDate, fallbackTs = 0) {
  const s = String(rawDate || '').trim();
  if (s) {
    if (/^\d{4}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1950) {
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return s;
  }
  if (fallbackTs && Number(fallbackTs) > 100000000) {
    const dt = new Date(Number(fallbackTs) * 1000);
    if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1950) {
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return '';
}

/**
 * Groups an array of flat tracks into album objects.
 */
function groupByAlbum(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    const cleanT = splitCleanMetadata(t.title, t.artist, t.label, t.album);
    const hasAlbum = cleanT.album && cleanT.album.trim() && cleanT.album.trim() !== cleanT.title.trim();
    const key = hasAlbum ? `album::${cleanT.album.trim()}::${cleanT.artist.trim()}` : `single::${t.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id:          key,
        title:       hasAlbum ? cleanT.album.trim() : cleanT.title,
        artist:      cleanT.artist || t.artist,
        cover:       t.cover,
        label:       cleanT.label || t.label,
        genre:       t.genre,
        year:        t.year,
        releaseDate: t.releaseDate || t.publishedAt || t.createdAt || (t.year ? String(t.year) : ''),
        location:    t.location || t.country || '',
        formats:     t.formats || ['Digital'],
        tracks:      [],
      });
    }
    const entry = map.get(key);
    entry.tracks.push({ ...t, title: cleanT.title || t.title, artist: cleanT.artist || t.artist });
    if (!entry.cover && t.cover) entry.cover = t.cover;
    if (!entry.label && (cleanT.label || t.label)) entry.label = cleanT.label || t.label;
    if (!entry.location && (t.location || t.country)) entry.location = t.location || t.country;
  });
  const extractNum = (t) => {
    const sk = t.storageKey || t.downloadUrl || '';
    const m = sk.match(/[-_](\d{1,3})[-_]/);
    return m ? parseInt(m[1], 10) : 9999;
  };
  for (const entry of map.values()) {
    if (entry.tracks.length > 1) {
      entry.tracks.sort((a, b) => extractNum(a) - extractNum(b));
    }
  }
  return Array.from(map.values());
}

export default function Home() {
  const { playRelease, playTrack, playFromHistory, setSearchQueue, playSearchItem } = usePlayer();
  const { user } = useAuth();
  const { getLikedUploads, playlists, playlistActivity, touchPlaylistActivity } = useLibrary();
  const acct = useConnectedLibrary();
  const [providerPriority] = useProviderPriority();
  const [homeSectionRows] = useHomeSectionRows();
  const homeLayout = useHomeLayoutLive();
  const [myUploads,      setMyUploads]      = useState([]);
  const [publicReleases, setPublicReleases] = useState(() => _cachedPublicReleases);
  const [selectedAlbum,  setSelectedAlbum]  = useState(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(null);

  async function openPlaylistSheet(pl) {
    if (pl && pl.kind !== 'album') {
      touchPlaylistActivity?.(pl);
    }
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    const initialTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const rawCreator = pl.artistName || pl.artist || pl.creator || user?.displayName || 'You';
    const meta = splitCleanMetadata(pl.title, rawCreator, pl.label || pl.labelName || '');
    let creator = meta.artist || rawCreator;
    let cleanAlbumTitle = meta.title || pl.title;
    let resolvedLabel = meta.label || pl.label || pl.labelName || null;
    let resolvedYear = pl.year ? String(pl.year) : null;
    let cover = pl.artworkUrl || pl.cover || null;
    if (cover && cover.includes('bcbits.com')) {
      cover = cover.replace(/_[0-9]+\.jpg/, '_10.jpg');
    }

    const pushToSheet = (currentTracks) => {
      const cleanedTracks = (currentTracks || []).map(t => {
        const tm = splitCleanMetadata(t.title || t.name || 'Unknown Track', t.artist || t.artistName || creator, resolvedLabel || '');
        return {
          ...t,
          title: tm.title || t.title || t.name || 'Unknown Track',
          artist: tm.artist || t.artist || t.artistName || creator,
          artistName: tm.artist || t.artistName || t.artist || creator,
          label: t.label || resolvedLabel || undefined,
          year: t.year || resolvedYear || undefined,
          album: cleanAlbumTitle,
          releaseTitle: cleanAlbumTitle,
        };
      });
      const albumObj = {
        ...pl,
        title: cleanAlbumTitle,
        artist: creator,
        label: resolvedLabel,
        year: resolvedYear,
        cover,
        tracks: cleanedTracks,
        _ts: ts,
      };
      setSelectedAlbum(albumObj);
      registerAlbumPlayback(albumObj);
      const mappedTracks = cleanedTracks.map(t => {
        const isPlayable = t.playable !== false && !t.unplayable && t.isPlayable !== false;
        return {
          id: t.id || String(Date.now() + Math.random()),
          title: t.title || t.name || 'Unknown Track',
          artist: t.artist || t.artistName || '',
          url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
          streamUrl: t.streamUrl || t.audioUrl || '',
          cover: t.artworkUrl || t.cover || null,
          provider: t.provider || pl.provider || null,
          playable: isPlayable,
          unplayable: !isPlayable,
        };
      });
      try {
        if (pl.kind === 'album') {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            nativeAlbum: {
              _ts: String(ts),
              id: pl.id,
              title: cleanAlbumTitle,
              artist: creator,
              cover,
              genre: pl.genre || null,
              year: resolvedYear,
              label: resolvedLabel,
              provider: pl.provider || null,
              isPreorder: Boolean(pl.isPreorder),
              tracks: mappedTracks,
            }
          });
        } else {
          window.webkit?.messageHandlers?.player?.postMessage({
            playlistOpen: true,
            nativePlaylist: {
              _ts: String(ts),
              id: pl.id,
              title: cleanAlbumTitle,
              cover,
              creator,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        }
      } catch(e) {}
    };

    pushToSheet(initialTracks);

    if (!initialTracks.length && pl.provider === 'bandcamp' && pl.kind === 'album' && (pl.trackUrl || pl.url)) {
      const albumUrl = pl.trackUrl || pl.url;
      try {
        const r = await fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-album', albumUrl }),
        });
        const data = r.ok ? await r.json() : { tracks: [] };
        if (data.album) {
          if (data.album.label && !resolvedLabel) resolvedLabel = data.album.label;
          if (data.album.year && !resolvedYear) resolvedYear = String(data.album.year);
          if (data.album.artistName) {
            const m2 = splitCleanMetadata(data.album.title || cleanAlbumTitle, data.album.artistName, resolvedLabel || '');
            creator = m2.artist || creator;
            cleanAlbumTitle = m2.title || cleanAlbumTitle;
            if (m2.label && !resolvedLabel) resolvedLabel = m2.label;
          }
        }
        const now = Date.now();
        let resolvedPreorder = Boolean(data.isPreorder || data.album?.isPreorder);
        let fetched = (data.tracks || []).map((t, i) => {
          const isPlayable = t.playable !== false && !t.unplayable;
          return {
            id: `bc-${t.trackId || i}`,
            kind: 'track',
            provider: 'bandcamp',
            title: cleanTrackOrReleaseTitle(t.title, t.artistName || creator),
            artist: t.artistName || creator,
            artistName: t.artistName || creator,
            label: resolvedLabel || undefined,
            year: resolvedYear || undefined,
            album: cleanAlbumTitle,
            releaseTitle: cleanAlbumTitle,
            artworkUrl: t.artworkUrl || cover,
            cover: t.artworkUrl || cover,
            duration: t.duration || 0,
            streamUrl: t.streamUrl || '',
            audioUrl: t.streamUrl || '',
            url: t.streamUrl || t.trackUrl || '',
            trackUrl: t.trackUrl || albumUrl,
            albumUrl,
            providerItemId: t.trackUrl || albumUrl,
            streamFetchedAt: t.streamUrl ? now : undefined,
            playable: isPlayable,
            unplayable: !isPlayable,
          };
        });
        if (!fetched.length) {
          const r2 = await fetch('/api/bandcamp-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'album-tracks', url: albumUrl }),
          }).catch(() => null);
          const data2 = r2 && r2.ok ? await r2.json() : { tracks: [] };
          if (data2.label && !resolvedLabel) resolvedLabel = data2.label;
          if (data2.year && !resolvedYear) resolvedYear = String(data2.year);
          if (data2.isPreorder) resolvedPreorder = true;
          if (data2.artist) {
            const m3 = splitCleanMetadata(data2.albumTitle || cleanAlbumTitle, data2.artist, resolvedLabel || '');
            creator = m3.artist || creator;
            cleanAlbumTitle = m3.title || cleanAlbumTitle;
            if (m3.label && !resolvedLabel) resolvedLabel = m3.label;
          }
          fetched = (data2.tracks || []).map((t, i) => {
            const isPlayable = t.playable !== false && !t.unplayable;
            return {
              id: `bc-${t.trackId || t.trackNum || i}`,
              kind: 'track',
              provider: 'bandcamp',
              title: cleanTrackOrReleaseTitle(t.title, t.artist || t.artistName || creator),
              artist: t.artist || t.artistName || creator,
              artistName: t.artist || t.artistName || creator,
              label: resolvedLabel || undefined,
              year: resolvedYear || undefined,
              album: cleanAlbumTitle,
              releaseTitle: cleanAlbumTitle,
              artworkUrl: t.artworkUrl || cover,
              cover: t.artworkUrl || cover,
              duration: t.duration || 0,
              streamUrl: t.streamUrl || '',
              audioUrl: t.streamUrl || '',
              url: t.streamUrl || t.url || albumUrl,
              trackUrl: t.url || albumUrl,
              albumUrl,
              providerItemId: t.url || albumUrl,
              streamFetchedAt: t.streamUrl ? now : undefined,
              playable: isPlayable,
              unplayable: !isPlayable,
            };
          });
        }
        if (!fetched.length) {
          fetched = await fetchAccountLibrary('bandcamp', 'playlistTracks', { playlistUrl: albumUrl }).catch(() => []);
        }
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          pl.label = resolvedLabel || pl.label;
          pl.year = resolvedYear || pl.year;
          pl.isPreorder = Boolean(resolvedPreorder || fetched.some(t => t.playable === false || t.unplayable));
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            pushToSheet(fetched);
          }
        }
      } catch (err) {
        // Sheet already opened with initialTracks
      }
      return;
    }

    if (!initialTracks.length && (pl.playlistId || pl.url || pl.trackUrl)) {
      try {
        const fetched = await fetchAccountLibrary(
          pl.provider || 'bandcamp',
          'playlistTracks',
          { playlistId: pl.playlistId, playlistUrl: pl.url || pl.trackUrl }
        );
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            pushToSheet(fetched);
          }
        }
      } catch (err) {
        // Sheet already opened with initialTracks
      }
    }
  }

  const { pinnedItems, isItemHidden } = usePinnedAndHiddenContent();
  const visiblePinnedItems = useMemo(() => (pinnedItems || []).filter(it => !isItemHidden(it)), [pinnedItems, isItemHidden]);

  const lpTimerRef = useRef(null);
  const lpStartRef = useRef({ x: 0, y: 0 });
  const lpFiredRef = useRef(false);
  const clearLp = useCallback(() => {
    if (lpTimerRef.current) {
      clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearLp, [clearLp]);

  const bindLongPress = useCallback((itemPayload, onClickFn) => ({
    onTouchStart: (e) => {
      lpFiredRef.current = false;
      const t = e.touches?.[0];
      if (!t) return;
      lpStartRef.current = { x: t.clientX, y: t.clientY };
      clearLp();
      lpTimerRef.current = setTimeout(() => {
        lpFiredRef.current = true;
        openContentActionCard(itemPayload);
      }, 460);
    },
    onTouchMove: (e) => {
      if (!lpTimerRef.current) return;
      const t = e.touches?.[0];
      if (!t) return;
      if (Math.abs(t.clientX - lpStartRef.current.x) > 10 || Math.abs(t.clientY - lpStartRef.current.y) > 10) {
        clearLp();
      }
    },
    onTouchEnd: (e) => {
      clearLp();
      if (lpFiredRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onTouchCancel: clearLp,
    onContextMenu: (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearLp();
      lpFiredRef.current = true;
      openContentActionCard(itemPayload);
    },
    onClick: (e) => {
      if (lpFiredRef.current) {
        lpFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClickFn?.(e);
    },
  }), [clearLp]);

  // Group flat tracks into albums
  const publicAlbums = useMemo(() => groupByAlbum(publicReleases).filter(a => !isItemHidden(a)), [publicReleases, isItemHidden]);

  // Featured = albums with cover art (will be admin-curated via is_featured flag later)
  const featuredAlbums = useMemo(() => publicAlbums.filter(a => a.cover && !isItemHidden(a)), [publicAlbums, isItemHidden]);

  // Featured, Community & Bandcamp carousel state
  const featuredRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const communityHeroRef = useRef(null);
  const [activeCommunitySlide, setActiveCommunitySlide] = useState(0);
  const bandcampHeroRef = useRef(null);
  const [activeBcSlide, setActiveBcSlide] = useState(0);
  const [brokenCovers, setBrokenCovers] = useState({});
  const markCoverBroken = useCallback((url) => {
    if (!url) return;
    setBrokenCovers(prev => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  const [communityPosts, setCommunityPosts] = useState(() => {
    try {
      const raw = localStorage.getItem('kyoyu-community-posts-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const syncCommunity = () => {
      try {
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setCommunityPosts(parsed);
      } catch {}
    };
    window.__kyoyuPublishCommunityPost = (post) => {
      if (!post) return;
      try {
        const displayName =
          localStorage.getItem('kyoyu-profile-display-name') ||
          user?.displayName ||
          user?.user_metadata?.display_name ||
          user?.user_metadata?.username ||
          (user?.email ? user.email.split('@')[0] : '') ||
          post.sharedByName ||
          'You';
        const enrichedPost = {
          ...post,
          sharedByName: (!post.sharedByName || post.sharedByName === 'You') ? displayName : post.sharedByName,
          createdAt: post.createdAt || Date.now(),
        };
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        list = list.filter(x => !(
          String(x.entityType || '') === String(enrichedPost.entityType || '') &&
          String(x.title || '').toLowerCase() === String(enrichedPost.title || '').toLowerCase() &&
          String(x.artist || '').toLowerCase() === String(enrichedPost.artist || '').toLowerCase()
        ));
        list.unshift(enrichedPost);
        if (list.length > 60) list = list.slice(0, 60);
        localStorage.setItem('kyoyu-community-posts-v1', JSON.stringify(list));
        setCommunityPosts(list);
      } catch {}
    };
    window.addEventListener('kyoyu-community-posts-change', syncCommunity);
    window.addEventListener('storage', syncCommunity);
    return () => {
      window.removeEventListener('kyoyu-community-posts-change', syncCommunity);
      window.removeEventListener('storage', syncCommunity);
    };
  }, [user]);

  const [heroMetaMap, setHeroMetaMap] = useState(() => {
    try {
      const raw = localStorage.getItem(HERO_META_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const pendingHeroLookupsRef = useRef(new Set());

  // Enrich Featured, Community, and New on Bandcamp cards with cover, title, artist, label, releaseDate, location, and 100% complete formats
  useEffect(() => {
    let cancelled = false;
    const bcNewItems = (acct.bandcamp?.newStuff || []).slice(0, 18);
    const featItems = featuredAlbums.slice(0, 15);
    const commItems = (communityPosts || []).slice(0, 18);
    const candidates = [
      ...featItems.map(alb => ({
        key: String(alb.id || `${alb.artist || ''}|${alb.title || ''}`),
        title: alb.title || '',
        artist: alb.artist || '',
        label: alb.label || '',
        releaseDate: alb.releaseDate || '',
        location: alb.location || '',
        formats: alb.formats || [],
        cover: sanitizeArtworkUrl(alb.cover || '', alb.id, false),
        url: alb.url || alb.trackUrl || alb.tracks?.[0]?.trackUrl || '',
        entityType: 'album',
      })),
      ...commItems.map((post, idx) => {
        const displayRawTitle = post.album || post.title || '';
        const meta = splitCleanMetadata(displayRawTitle, post.artist || '', post.label || '');
        const url = post.albumUrl || post.url || '';
        return {
          key: String(post.postId || post.id || url || `comm-${idx}`),
          altUrlKey: url || '',
          title: meta.title || displayRawTitle,
          artist: meta.artist || post.artist || '',
          label: meta.label || post.label || '',
          releaseDate: post.releaseDate || '',
          location: post.location || '',
          formats: post.formats || [],
          cover: sanitizeArtworkUrl(post.cover || '', post.id, false),
          url,
          entityType: post.entityType || 'album',
        };
      }),
      ...bcNewItems.map((it, idx) => {
        const displayRawTitle = it.album || it.releaseTitle || it.title || '';
        const meta = splitCleanMetadata(displayRawTitle, it.artistName || it.artist || '', it.label || it.labelName || '');
        const url = it.albumUrl || it.trackUrl || it.url || '';
        return {
          key: String(it.id || url || `bc-new-${idx}`),
          altUrlKey: url || '',
          title: meta.title || displayRawTitle,
          artist: meta.artist || it.artistName || it.artist || '',
          label: meta.label || it.label || '',
          releaseDate: it.releaseDate || '',
          location: it.location || it.country || '',
          formats: it.formats || [],
          cover: sanitizeArtworkUrl(it.artworkUrl || it.cover || '', it.id, false),
          url,
          entityType: 'album',
        };
      }),
    ];

    const toFetch = candidates.filter(c => {
      if (!c.key || pendingHeroLookupsRef.current.has(c.key)) return false;
      const existing = heroMetaMap[c.key];
      if (existing && existing._complete) return false;
      return Boolean(c.title || c.url);
    });

    if (toFetch.length === 0) return;

    (async () => {
      const BATCH_SIZE = 10;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const updates = {};
        await Promise.all(batch.map(async (item) => {
          pendingHeroLookupsRef.current.add(item.key);
          let label = cleanHeroLabel(item.label, item.artist);
          let releaseDate = item.releaseDate || '';
          let location = item.location || '';
          let cover = item.cover || '';
          let cleanTitle = item.title || '';
          let cleanArtist = item.artist || '';
          const isArtistOrLabel = item.entityType === 'artist' || item.entityType === 'label';
          let formatsList = Array.isArray(item.formats) ? [...item.formats] : [];

          try {
            if (!isArtistOrLabel && item.url && item.url.includes('bandcamp.com')) {
              const bcRes = await fetch('/api/bandcamp-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'fetch-album', albumUrl: item.url }),
              }).then(r => r.ok ? r.json() : null).catch(() => null);
              if (bcRes?.album) {
                if (bcRes.album.artworkUrl) {
                  cover = sanitizeArtworkUrl(bcRes.album.artworkUrl, item.key, false) || cover;
                }
                if (bcRes.album.title || bcRes.album.artistName) {
                  const bcMeta = splitCleanMetadata(
                    bcRes.album.title || cleanTitle,
                    bcRes.album.artistName || cleanArtist,
                    bcRes.album.label || label
                  );
                  if (bcMeta.title) cleanTitle = bcMeta.title;
                  if (bcMeta.artist) cleanArtist = bcMeta.artist;
                }
                if (!label && bcRes.album.label) label = cleanHeroLabel(bcRes.album.label, cleanArtist);
                if (bcRes.album.releaseDate) releaseDate = bcRes.album.releaseDate;
                if (!location && bcRes.album.location) location = bcRes.album.location;
                if (Array.isArray(bcRes.album.formats) && bcRes.album.formats.length) {
                  formatsList.push(...bcRes.album.formats);
                }
              }
            }

            const hasSpecificVinylSize = formatsList.some(f => /\b(?:12|10|7)\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)|\b2xLP\b|\bVinyl LP\b/i.test(String(f || '')));
            if (!isArtistOrLabel && (!label || !location || !releaseDate || !cover || !hasSpecificVinylSize) && (cleanTitle || cleanArtist)) {
              const dcRes = await fetch('/api/discogs-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'track-info',
                  title: cleanTitle,
                  artist: cleanArtist,
                  album: cleanTitle,
                }),
              }).then(r => r.ok ? r.json() : null).catch(() => null);
              if (dcRes) {
                if (!cover && (dcRes.coverImage || dcRes.thumb)) {
                  cover = sanitizeArtworkUrl(dcRes.coverImage || dcRes.thumb, item.key, false);
                }
                if (!label) label = cleanHeroLabel(dcRes.labelName || dcRes.label || '', cleanArtist);
                if (!releaseDate && (dcRes.releaseDate || dcRes.year)) releaseDate = String(dcRes.releaseDate || dcRes.year);
                if (!location && (dcRes.country || dcRes.artistOrigin || dcRes.labelCountry)) {
                  location = String(dcRes.country || dcRes.artistOrigin || dcRes.labelCountry).trim();
                }
                if (Array.isArray(dcRes.formats) && dcRes.formats.length) {
                  formatsList.push(...dcRes.formats);
                }
              }
            }
          } catch (_) {}

          const entry = {
            title: cleanTitle,
            artist: cleanArtist,
            cover,
            label,
            releaseDate,
            location,
            formats: normalizeHeroFormats(formatsList, !isArtistOrLabel),
            _complete: true,
          };
          updates[item.key] = entry;
          if (item.altUrlKey) updates[item.altUrlKey] = entry;
        }));

        if (!cancelled && Object.keys(updates).length > 0) {
          setHeroMetaMap(prev => {
            const next = { ...prev, ...updates };
            try {
              localStorage.setItem(HERO_META_CACHE_KEY, JSON.stringify(next));
            } catch (_) {}
            return next;
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [featuredAlbums, communityPosts, acct.bandcamp?.newStuff]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track active slide on scroll
  const handleFeaturedScroll = useCallback(() => {
    const el = featuredRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveSlide(idx);
  }, []);

  const handleCommunityHeroScroll = useCallback(() => {
    const el = communityHeroRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveCommunitySlide(idx);
  }, []);

  const handleBcHeroScroll = useCallback(() => {
    const el = bandcampHeroRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveBcSlide(idx);
  }, []);

  // Load real public releases from prewarmed cache / backend
  useEffect(() => {
    if (_cachedPublicReleases.length > 0) {
      setPublicReleases(_cachedPublicReleases);
    }
    const onPub = (tracks) => setPublicReleases(tracks);
    _publicReleaseListeners.add(onPub);
    preloadHomeContent();
    return () => _publicReleaseListeners.delete(onPub);
  }, []);

  useEffect(() => {
    function loadUploads() {
      if (!user?.id) return;
      try {
        const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const hydrated = parsed.map(t => ({
            ...t,
            artworkUrl: localStorage.getItem(`kyoyu-art-${user.id}-${t.id}`) || t.artworkUrl || null,
          }));
          preloadImagesInMemory(hydrated, 60);
          setMyUploads(hydrated);
        } else {
          setMyUploads([]);
        }
      } catch {}
    }
    loadUploads();
    window.addEventListener('kyoyu-uploads-changed', loadUploads);
    return () => window.removeEventListener('kyoyu-uploads-changed', loadUploads);
  }, [user?.id]);

  const [playHistory, setPlayHistory] = useState(() => {
    try {
      const h = JSON.parse(localStorage.getItem('kyoyu-play-history') || '[]');
      preloadImagesInMemory(h, 40);
      return h;
    } catch (err) {
      return [];
    }
  });

  // Shelf filter state
  const [shelfFilter, setShelfFilter]   = useState('all');
  const [followingOnly, setFollowing]   = useState(false);
  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcasts';

  // In-place expanded category state (infinite vertical scroll on Home page — once loaded, count stays in memory)
  const [expandedSectionKey, setExpandedSectionKey] = useState(null);
  const [expandedVisibleCount, setExpandedVisibleCount] = useState(45);
  const loadMoreSentinelRef = useRef(null);

  const toggleExpandSection = useCallback((sectionKey) => {
    setExpandedSectionKey((prev) => {
      if (prev === sectionKey) return null;
      const savedCount = _expandedVisibleCounts.get(sectionKey) || 45;
      setExpandedVisibleCount(savedCount);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
      return sectionKey;
    });
  }, []);

  useEffect(() => {
    if (!expandedSectionKey) return;
    const bump = () => {
      setExpandedVisibleCount((c) => {
        const next = c + 36;
        _expandedVisibleCounts.set(expandedSectionKey, Math.max(_expandedVisibleCounts.get(expandedSectionKey) || 45, next));
        return next;
      });
    };
    const node = loadMoreSentinelRef.current;
    let observer = null;
    if (node && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            bump();
          }
        },
        { rootMargin: '800px 0px' }
      );
      observer.observe(node);
    }
    const onScroll = () => {
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement?.scrollHeight || document.body?.scrollHeight || 0;
      if (docHeight > 0 && docHeight - scrollBottom < 800) {
        bump();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [expandedSectionKey, expandedVisibleCount]);

  // Decide which sections to render per filter
  const f = shelfFilter;
  const showFeatured    = f === 'all' || f === 'music';
  const showReleases    = f === 'all' || f === 'music';
  const showEvents      = f === 'all' || f === 'events';

  return (
    <div className="page home-page animate-in">

      {/* ── Filter bar ── */}
      <section className="home-section mymusic-section">
        <div className="shelf-filter-bar">
          <div className="shelf-filters">
            {[
              { key: 'all',     label: 'All'      },
              { key: 'music',   label: 'Music'    },
              { key: 'podcasts', label: 'Podcasts' },
              { key: 'merch',   label: 'Merch'    },
              { key: 'events',  label: 'Events'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                data-home-filter={key}
                className={`shelf-filter-btn${shelfFilter === key ? ' active' : ''}`}
                onClick={() => { setShelfFilter(key); setFollowing(false); setExpandedSectionKey(null); }}
              >
                {label}
              </button>
            ))}
          </div>
          {showFollowingToggle && (
            <button
              className={`shelf-following-btn${followingOnly ? ' active' : ''}`}
              onClick={() => { setFollowing(f => !f); setExpandedSectionKey(null); }}
            >
              Following
            </button>
          )}
        </div>
      </section>

      {/* ═══ 1 — FEATURED CONTENT CAROUSEL ═══ */}
      {showFeatured && featuredAlbums.length > 0 && (!expandedSectionKey || expandedSectionKey === 'featured') && (
        <section className="home-section featured-hero-section">
          <div className="section-title">
            <span onClick={() => toggleExpandSection('featured')} style={{ cursor: 'pointer' }}>
              {expandedSectionKey === 'featured' ? '← Featured' : 'Featured'}
            </span>
            {expandedSectionKey === 'featured' && (
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{featuredAlbums.length}</span>
            )}
          </div>

          {expandedSectionKey === 'featured' ? (
            <>
              <div className="upl-grid upl-grid-3">
                {featuredAlbums.slice(0, expandedVisibleCount).map((album) => {
                  const metaKey = `${(album.artist || '').toLowerCase()}::${(album.title || '').toLowerCase()}`;
                  const rich = heroMetaMap[album.id] || heroMetaMap[metaKey] || {};
                  const rawCov = album.cover || rich.cover || '';
                  const cleanCover = rawCov ? pinImageInMemory(rawCov, album.id) : '';
                  const showCover = cleanCover && !brokenCovers[cleanCover]
                    ? cleanCover
                    : (rich.cover && !brokenCovers[rich.cover] ? rich.cover : '');
                  return (
                    <button
                      key={album.id}
                      className="upl-grid-cell"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      {...bindLongPress({
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        artworkUrl: showCover || album.cover,
                        provider: 'kyoyu',
                        kind: 'album',
                        url: album.url || album.trackUrl || '',
                      }, () => {
                        if (album.id.startsWith('single::') && album.tracks?.length === 1) {
                          playTrack(album.tracks[0]);
                        } else {
                          setSelectedAlbum(openNativeAlbumFast(album));
                        }
                      })}
                    >
                      <div className="upl-grid-art">
                        {showCover
                          ? <img src={showCover} alt={album.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                          : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2} /></div>}
                      </div>
                      <div className="upl-grid-title">{album.title}</div>
                      <div className="upl-grid-artist">{album.artist}</div>
                    </button>
                  );
                })}
              </div>
              {expandedVisibleCount < featuredAlbums.length && (
                <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
              )}
            </>
          ) : (
            <>
              <div
                className="featured-hero-row"
                ref={featuredRef}
                onScroll={handleFeaturedScroll}
              >
                {featuredAlbums.map((album) => {
                  const metaKey = `${(album.artist || '').toLowerCase()}::${(album.title || '').toLowerCase()}`;
                  const rich = heroMetaMap[album.id] || heroMetaMap[metaKey] || {};
                  const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
                  const richCover = rich.cover ? pinImageInMemory(rich.cover, album.id) : '';
                  const showCover = (cleanCover && !brokenCovers[cleanCover])
                    ? cleanCover
                    : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                  const labelStr = cleanHeroLabel(album.label || rich.label || '', album.artist, album.title);
                  const releaseDateStr = formatHeroReleaseDate(album.releaseDate || rich.releaseDate || album.year || '', album.releaseTimestamp);
                  const locationStr = String(album.location || rich.location || album.country || '').trim();
                  const rawHeroFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                    ? rich.formats
                    : (typeof rich.formats === 'string' && rich.formats.trim() ? rich.formats : album.formats);
                  const formatsList = normalizeHeroFormats(rawHeroFormats, true);
                  const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                  return (
                    <button
                      key={album.id}
                      className="featured-hero-card"
                      {...bindLongPress({
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        artworkUrl: showCover || album.cover,
                        provider: 'kyoyu',
                        kind: 'album',
                        url: album.url || album.trackUrl || '',
                      }, () => {
                        if (album.id.startsWith('single::') && album.tracks?.length === 1) {
                          playTrack(album.tracks[0]);
                        } else {
                          setSelectedAlbum(openNativeAlbumFast({
                            ...album,
                            cover: showCover || album.cover,
                            label: labelStr || album.label,
                            releaseDate: releaseDateStr || album.releaseDate,
                            location: locationStr || album.location,
                            formats: formatsList,
                          }));
                        }
                      })}
                    >
                      {/* Cover art */}
                      <div className="featured-hero-art">
                        {showCover
                          ? <img src={showCover} alt={album.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                          : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                      </div>

                      {/* Info on the right of artwork: 1. Album, 2. Artist, 3. Label, 4. Release Date, 5. Location, 6. Formats */}
                      <div className="featured-hero-info">
                        <HeroMarqueeRow className="featured-hero-title">{album.title}</HeroMarqueeRow>
                        <HeroMarqueeRow className="featured-hero-artist">{album.artist}</HeroMarqueeRow>
                        {labelStr && <HeroMarqueeRow className="featured-hero-label">{labelStr}</HeroMarqueeRow>}
                        {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                        {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                        <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ═══ 1.05 — PINNED CONTENT (UNDER FEATURED) ═══ */}
      {showFeatured && visiblePinnedItems.length > 0 && (!expandedSectionKey || expandedSectionKey === 'home-pinned') && (() => {
        const mappedPinned = visiblePinnedItems.map(p => ({
          id: p.id,
          kind: p.type === 'playlist' ? 'playlist' : p.type === 'track' ? 'track' : 'album',
          provider: p.provider || 'bandcamp',
          title: p.title || 'Untitled',
          artistName: p.artist || '',
          artist: p.artist || '',
          artworkUrl: p.artwork || '',
          cover: p.artwork || '',
          url: p.url || '',
          trackUrl: p.url || '',
        }));
        const pinCols = homeLayout.cols || HOME_TITLES_PER_ROW;
        const pinViewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-pinned')} style={{ cursor: 'pointer' }}>
                {expandedSectionKey === 'home-pinned' ? '← Pinned' : 'Pinned'}
              </span>
              {expandedSectionKey === 'home-pinned' && (
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{mappedPinned.length}</span>
              )}
            </div>
            <AccountItemList
              items={expandedSectionKey === 'home-pinned' ? mappedPinned.slice(0, expandedVisibleCount) : mappedPinned}
              view={pinViewMode}
              cols={pinCols}
              onOpenPlaylist={openPlaylistSheet}
            />
          </section>
        );
      })()}

      {/* ═══ 1.1 — PLAYLISTS (3 PER ROW ICON VIEW, ORDERED MOST RECENT VIEWED / EDITED / PLAYED FIRST) ═══ */}
      {showFeatured && (!expandedSectionKey || expandedSectionKey === 'home-playlists') && (() => {
        const localMapped = (playlists || []).map(p => {
          const trackList = Array.isArray(p.tracks) ? p.tracks : [];
          const coverUrl = (p.cover && p.cover !== '/album1.png')
            ? p.cover
            : (trackList[0]?.cover || trackList[0]?.artworkUrl || trackList[0]?.releaseCover || '');
          const prov = p.provider || (Array.isArray(p.providers) && p.providers[0]) || '';
          return {
            ...p,
            id: p.id,
            kind: 'playlist',
            provider: prov,
            title: p.title || p.name || 'Untitled',
            artworkUrl: coverUrl,
            cover: coverUrl,
            artistName: `${trackList.length} ${trackList.length === 1 ? 'track' : 'tracks'}`,
            trackCount: trackList.length,
            tracks: trackList,
          };
        });

        const seenIds = new Set(localMapped.map(p => String(p.id)));
        const seenProvTitle = new Set(
          localMapped.map(p => `${String(p.provider || '').toLowerCase()}::${String(p.title || '').trim().toLowerCase()}`)
        );
        const remoteMapped = [];
        const provOrder = Array.isArray(providerPriority) && providerPriority.length
          ? providerPriority
          : ['bandcamp', 'soundcloud', 'youtube', 'spotify', 'applemusic', 'tidal'];

        for (const provKey of provOrder) {
          const provList = acct?.[provKey]?.playlists;
          if (!Array.isArray(provList)) continue;
          for (const r of provList) {
            if (!r) continue;
            const rid = String(r.id || r.playlistId || '');
            const rTitleKey = `${provKey}::${String(r.title || r.name || '').trim().toLowerCase()}`;
            if ((rid && seenIds.has(rid)) || ((r.title || r.name) && seenProvTitle.has(rTitleKey))) continue;
            if (rid) seenIds.add(rid);
            seenProvTitle.add(rTitleKey);
            const tCount = typeof r.trackCount === 'number'
              ? r.trackCount
              : (Array.isArray(r.tracks) ? r.tracks.length : 0);
            const artUrl = r.artworkUrl || r.cover || (r.tracks?.[0]?.artworkUrl || r.tracks?.[0]?.cover || '');
            remoteMapped.push({
              ...r,
              id: rid || `${provKey}-pl-${remoteMapped.length}`,
              kind: 'playlist',
              provider: r.provider || provKey,
              title: r.title || r.name || 'Untitled',
              artworkUrl: artUrl,
              cover: artUrl,
              artistName: r.artistName || `${tCount} ${tCount === 1 ? 'track' : 'tracks'}`,
              trackCount: tCount,
            });
          }
        }

        const act = playlistActivity || {};
        const getPlaylistRecency = (pl) => {
          const pid = String(pl.id || pl.playlistId || '').trim();
          const ptitle = String(pl.title || pl.name || '').trim().toLowerCase();
          const purl = String(pl.url || pl.trackUrl || '').trim();
          const idMatch = pid.match(/^pl-(\d{10,15})$/);
          const createdFromId = idMatch ? Number(idMatch[1]) : 0;
          return Math.max(
            Number(pid && act[pid]) || 0,
            Number(ptitle && act[`title::${ptitle}`]) || 0,
            Number(purl && act[`url::${purl}`]) || 0,
            Number(pl.updatedAt) || 0,
            Number(pl.lastModified) || 0,
            Number(pl.playedAt) || 0,
            Number(pl.viewedAt) || 0,
            Number(pl.createdAt) || 0,
            createdFromId
          );
        };

        const allPlaylists = [...localMapped, ...remoteMapped].sort((a, b) => {
          const diff = getPlaylistRecency(b) - getPlaylistRecency(a);
          return diff !== 0 ? diff : 0;
        });

        const plCols = homeLayout.cols || HOME_TITLES_PER_ROW;
        const plViewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        const plRows = homeSectionRows?.['home-playlists'] ?? DEFAULT_HOME_SECTION_ROWS;
        const plPageSize = Math.max(0, Number(plRows) || 0) * (plViewMode === 'list' ? HOME_TITLES_PER_ROW : plCols);
        if (allPlaylists.length === 0 || plPageSize <= 0) return null;

        if (expandedSectionKey === 'home-playlists') {
          const visibleItems = allPlaylists.slice(0, expandedVisibleCount);
          return (
            <section className="home-section">
              <div className="section-title">
                <span onClick={() => toggleExpandSection('home-playlists')} style={{ cursor: 'pointer' }}>
                  ← Playlists
                </span>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  {allPlaylists.length}
                </span>
              </div>
              <AccountItemList items={visibleItems} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
              {expandedVisibleCount < allPlaylists.length && (
                <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
              )}
            </section>
          );
        }

        const plPages = [];
        for (let i = 0; i < allPlaylists.length; i += plPageSize) {
          plPages.push(allPlaylists.slice(i, i + plPageSize));
        }

        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-playlists')} style={{ cursor: 'pointer' }}>Playlists</span>
            </div>
            {plPages.length <= 1 ? (
              <AccountItemList items={plPages[0] || []} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
            ) : (
              <CatalogSwipeRow
                sectionKey="home-playlists"
                pages={plPages}
                renderPage={(pageItems) => (
                  <AccountItemList items={pageItems} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
                )}
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 1.15 — COMMUNITY (FAN-TO-FAN SHARES: ALBUMS, TITLES, ARTISTS & LABELS — UNDER PLAYLISTS, ABOVE NEW ON BANDCAMP) ═══ */}
      {showFeatured && (!expandedSectionKey || expandedSectionKey === 'home-community') && (() => {
        const currentUserName =
          localStorage.getItem('kyoyu-profile-display-name') ||
          user?.displayName ||
          user?.user_metadata?.display_name ||
          user?.user_metadata?.username ||
          (user?.email ? user.email.split('@')[0] : '') ||
          'You';

        const seededFromFeed = (featuredAlbums || []).slice(0, 6).map((alb, idx) => {
          const fallbackSharers = ['Aoi', 'Kaito', 'Sora', 'Ren', 'Mika', 'Haru'];
          const uploaderName = alb.tracks?.[0]?.uploaderName || alb.uploaderName || fallbackSharers[idx % fallbackSharers.length];
          return {
            postId: `seed-comm-${alb.id || idx}`,
            id: alb.id,
            entityType: 'album',
            title: alb.title,
            artist: alb.artist,
            album: alb.title,
            label: alb.label || '',
            releaseDate: alb.releaseDate || alb.year || '',
            location: alb.location || alb.country || '',
            formats: alb.formats || [],
            cover: alb.cover,
            url: alb.url || alb.trackUrl || alb.tracks?.[0]?.trackUrl || '',
            tracks: alb.tracks || [],
            sharedByName: uploaderName,
          };
        });

        const userPosts = (communityPosts || []).map(p => ({
          ...p,
          sharedByName: (!p.sharedByName || p.sharedByName === 'You') ? currentUserName : p.sharedByName,
        }));

        const seenCommKeys = new Set();
        const allCommunityItems = [];
        for (const item of [...userPosts, ...seededFromFeed]) {
          const k = `${String(item.entityType || 'album').toLowerCase()}|${String(item.title || '').toLowerCase()}|${String(item.artist || '').toLowerCase()}`;
          if (seenCommKeys.has(k)) continue;
          seenCommKeys.add(k);
          allCommunityItems.push(item);
        }

        if (allCommunityItems.length === 0) return null;

        return (
          <section className="home-section featured-hero-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-community')} style={{ cursor: 'pointer' }}>
                {expandedSectionKey === 'home-community' ? '← Community' : 'Community'}
              </span>
            </div>
            <div
              className="featured-hero-row"
              ref={communityHeroRef}
              onScroll={handleCommunityHeroScroll}
            >
              {allCommunityItems.slice(0, 18).map((post, idx) => {
                const entityType = String(post.entityType || 'album').toLowerCase();
                const releaseUrl = post.albumUrl || post.url || '';
                const lookupKey = String(post.postId || post.id || releaseUrl || `comm-${idx}`);
                const rich = heroMetaMap[lookupKey] || (releaseUrl ? heroMetaMap[releaseUrl] : null) || {};
                const displayRawTitle = post.album || post.title || '';
                const meta = splitCleanMetadata(
                  rich.title || displayRawTitle,
                  rich.artist || post.artist || '',
                  rich.label || post.label || ''
                );
                const displayTitle = entityType === 'artist' || entityType === 'label'
                  ? (post.title || post.artist || post.label || 'Untitled')
                  : (meta.title || rich.title || displayRawTitle || 'Untitled');
                const displayArtist = entityType === 'artist'
                  ? 'Artist'
                  : entityType === 'label'
                    ? 'Label'
                    : (meta.artist || rich.artist || post.artist || '');
                const rawCover = post.cover || rich.cover || '';
                const cleanCover = rawCover ? pinImageInMemory(rawCover, lookupKey) : '';
                const richCover = rich.cover ? pinImageInMemory(rich.cover, `${lookupKey}-rich`) : '';
                const showCover = (cleanCover && !brokenCovers[cleanCover])
                  ? cleanCover
                  : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                const showLabel = entityType === 'artist' || entityType === 'label'
                  ? cleanHeroLabel(post.label || '', '', '')
                  : cleanHeroLabel(meta.label || rich.label || post.label || '', displayArtist, displayTitle);
                const releaseDateStr = formatHeroReleaseDate(post.releaseDate || rich.releaseDate || '', post.createdAt);
                const locationStr = String(post.location || rich.location || '').trim();
                const rawFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                  ? rich.formats
                  : (post.formats || (entityType === 'artist' ? ['Artist'] : entityType === 'label' ? ['Label'] : []));
                const formatsList = normalizeHeroFormats(rawFormats, entityType !== 'artist' && entityType !== 'label');
                const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                const sharerName = post.sharedByName || currentUserName;

                return (
                  <button
                    key={lookupKey}
                    className="featured-hero-card"
                    {...bindLongPress({
                      id: post.id || lookupKey,
                      title: displayTitle,
                      artist: displayArtist,
                      artworkUrl: showCover || post.cover,
                      provider: post.provider || 'bandcamp',
                      kind: entityType,
                      url: releaseUrl,
                    }, () => {
                      if (entityType === 'artist') {
                        const aName = post.artist || post.title || '';
                        if (window.__kyoyuOpenArtist) {
                          window.__kyoyuOpenArtist(aName);
                        } else {
                          try {
                            window.webkit?.messageHandlers?.player?.postMessage({
                              openArtist: true,
                              artistName: aName,
                            });
                          } catch {}
                        }
                      } else if (entityType === 'label') {
                        const lName = post.label || post.title || '';
                        if (window.__kyoyuOpenLabel) {
                          window.__kyoyuOpenLabel(lName);
                        } else {
                          try {
                            window.webkit?.messageHandlers?.player?.postMessage({
                              openLabel: true,
                              labelName: lName,
                            });
                          } catch {}
                        }
                      } else if (Array.isArray(post.tracks) && post.tracks.length > 0 && !releaseUrl.includes('bandcamp.com')) {
                        setSelectedAlbum(openNativeAlbumFast({
                          ...post,
                          id: post.id || lookupKey,
                          title: displayTitle,
                          artist: displayArtist,
                          cover: showCover || post.cover,
                          label: showLabel || post.label,
                          releaseDate: releaseDateStr || post.releaseDate,
                          location: locationStr || post.location,
                          formats: formatsList,
                        }));
                      } else {
                        openPlaylistSheet({
                          ...post,
                          kind: 'album',
                          title: displayTitle,
                          artistName: displayArtist,
                          artworkUrl: showCover || post.cover,
                          cover: showCover || post.cover,
                          label: showLabel || post.label,
                          releaseDate: releaseDateStr || post.releaseDate,
                          location: locationStr || post.location,
                          formats: formatsList,
                          url: releaseUrl,
                          trackUrl: releaseUrl,
                        });
                      }
                    })}
                  >
                    <div className="featured-hero-art">
                      {showCover
                        ? <img src={showCover} alt={displayTitle} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                        : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                    </div>
                    <div className="featured-hero-info">
                      <HeroMarqueeRow className="featured-hero-title">{displayTitle}</HeroMarqueeRow>
                      {displayArtist && <HeroMarqueeRow className="featured-hero-artist">{displayArtist}</HeroMarqueeRow>}
                      {showLabel && entityType !== 'label' && <HeroMarqueeRow className="featured-hero-label">{showLabel}</HeroMarqueeRow>}
                      {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                      {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                      <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                      <HeroMarqueeRow className="featured-hero-sharer">Shared by {sharerName}</HeroMarqueeRow>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ═══ 1.2 — LIBRARY PER PROVIDER: NEW STUFF, COLLECTION / LIKES, WISHLIST & PLAYLISTS (SWIPEABLE PAGES OF N ROWS × 3 TITLES) ═══ */}
      {showFeatured && (() => {
        const activeHomeCols = homeLayout.mode === 'list' ? HOME_TITLES_PER_ROW : (homeLayout.cols || HOME_TITLES_PER_ROW);
        const limitFor = (sectionKey) => {
          const rows = homeSectionRows?.[sectionKey] ?? DEFAULT_HOME_SECTION_ROWS;
          return Math.max(0, Number(rows) || 0) * activeHomeCols;
        };

        const likedUploads = getLikedUploads(user?.id) || [];
        const ytLocalLikes = likedUploads.filter(t => {
          const p = historyReplayInfo(t).provider || t.provider || '';
          return p === 'youtube' || String(t.id || '').startsWith('yt-');
        });
        const ytAcctLikes = acct.youtube?.likes || [];
        const mergeProviderPlaylists = (remoteList, provKey) => {
          const base = Array.isArray(remoteList) ? remoteList : [];
          const localMatching = (playlists || [])
            .filter(p => p.provider === provKey || (Array.isArray(p.providers) && p.providers.includes(provKey)))
            .filter(p => !base.some(r => String(r.title || '').trim().toLowerCase() === String(p.title || '').trim().toLowerCase()))
            .map(p => ({
              ...p,
              kind: 'playlist',
              provider: provKey,
              artworkUrl: (p.cover && p.cover !== '/album1.png') ? p.cover : (p.tracks?.[0]?.cover || ''),
              artistName: `${p.tracks?.length || 0} tracks`,
            }));
          return [...localMatching, ...base];
        };
        const ytPlaylists = mergeProviderPlaylists(acct.youtube?.playlists || [], 'youtube');

        const sectionsByProvider = {
          bandcamp: [
            { key: 'bandcamp-new',  title: 'New on Bandcamp',       provider: 'bandcamp', category: 'newStuff',  items: acct.bandcamp?.newStuff || [],   pageSize: limitFor('bandcamp-new'),  type: 'acct' },
            { key: 'bandcamp-col',  title: 'Bandcamp · Collection', provider: 'bandcamp', category: 'purchases', items: acct.bandcamp?.collection || [], pageSize: limitFor('bandcamp-col'),  type: 'acct' },
            { key: 'bandcamp-wish', title: 'Bandcamp · Wishlist',   provider: 'bandcamp', category: 'wishlist',  items: acct.bandcamp?.wishlist || [],   pageSize: limitFor('bandcamp-wish'), type: 'acct' },
            { key: 'bandcamp-pl',   title: 'Bandcamp · Playlists',  provider: 'bandcamp', category: 'playlists', items: mergeProviderPlaylists(acct.bandcamp?.playlists || [], 'bandcamp'), pageSize: limitFor('bandcamp-pl'), type: 'acct' },
          ],
          discogs: [
            { key: 'discogs-new',   title: 'Discogs · New Stuff',   provider: 'discogs',  category: 'newStuff',  items: acct.discogs?.newStuff || [],    pageSize: limitFor('discogs-new'),   type: 'acct' },
            { key: 'discogs-col',   title: 'Discogs · Collection',  provider: 'discogs',  category: 'purchases', items: acct.discogs?.collection || [],  pageSize: limitFor('discogs-col'),   type: 'acct' },
            { key: 'discogs-wish',  title: 'Discogs · Wishlist',    provider: 'discogs',  category: 'wishlist',  items: acct.discogs?.wishlist || [],    pageSize: limitFor('discogs-wish'),  type: 'acct' },
          ],
          soundcloud: [
            { key: 'soundcloud-new',   title: 'SoundCloud · New Stuff', provider: 'soundcloud', category: 'newStuff',  items: acct.soundcloud?.newStuff || [],  pageSize: limitFor('soundcloud-new'),   type: 'acct' },
            { key: 'soundcloud-likes', title: 'SoundCloud · Likes',     provider: 'soundcloud', category: 'titles',    items: acct.soundcloud?.likes || [],     pageSize: limitFor('soundcloud-likes'), type: 'acct' },
            { key: 'soundcloud-pl',    title: 'SoundCloud · Playlists', provider: 'soundcloud', category: 'playlists', items: mergeProviderPlaylists(acct.soundcloud?.playlists || [], 'soundcloud'), pageSize: limitFor('soundcloud-pl'), type: 'acct' },
          ],
          youtube: [
            { key: 'youtube-new',   title: 'YouTube · New Stuff', provider: 'youtube', category: 'newStuff',  items: acct.youtube?.newStuff || [],                        pageSize: limitFor('youtube-new'),   type: 'acct' },
            { key: 'youtube-likes', title: 'YouTube · Likes',     provider: 'youtube', category: 'titles',    items: ytAcctLikes.length > 0 ? ytAcctLikes : ytLocalLikes, pageSize: limitFor('youtube-likes'), type: ytAcctLikes.length > 0 ? 'acct' : 'uploads' },
            { key: 'youtube-pl',    title: 'YouTube · Playlists', provider: 'youtube', category: 'playlists', items: ytPlaylists,                                         pageSize: limitFor('youtube-pl'),    type: 'acct' },
          ],
          spotify: [
            { key: 'spotify-new',   title: 'Spotify · New Stuff', provider: 'spotify', category: 'newStuff',  items: acct.spotify?.newStuff || [],  pageSize: limitFor('spotify-new'),   type: 'acct' },
            { key: 'spotify-likes', title: 'Spotify · Likes',     provider: 'spotify', category: 'titles',    items: acct.spotify?.likes || [],     pageSize: limitFor('spotify-likes'), type: 'acct' },
            { key: 'spotify-pl',    title: 'Spotify · Playlists', provider: 'spotify', category: 'playlists', items: mergeProviderPlaylists(acct.spotify?.playlists || [], 'spotify'), pageSize: limitFor('spotify-pl'), type: 'acct' },
          ],
          applemusic: [
            { key: 'applemusic-new',   title: 'Apple Music · New Stuff', provider: 'applemusic', category: 'newStuff',  items: acct.applemusic?.newStuff || [],  pageSize: limitFor('applemusic-new'),   type: 'acct' },
            { key: 'applemusic-likes', title: 'Apple Music · Likes',     provider: 'applemusic', category: 'titles',    items: acct.applemusic?.likes || [],     pageSize: limitFor('applemusic-likes'), type: 'acct' },
            { key: 'applemusic-pl',    title: 'Apple Music · Playlists', provider: 'applemusic', category: 'playlists', items: mergeProviderPlaylists(acct.applemusic?.playlists || [], 'applemusic'), pageSize: limitFor('applemusic-pl'), type: 'acct' },
          ],
          tidal: [
            { key: 'tidal-new',   title: 'TIDAL · New Stuff', provider: 'tidal', category: 'newStuff',  items: acct.tidal?.newStuff || [],  pageSize: limitFor('tidal-new'),   type: 'acct' },
            { key: 'tidal-likes', title: 'TIDAL · Likes',     provider: 'tidal', category: 'titles',    items: acct.tidal?.likes || [],     pageSize: limitFor('tidal-likes'), type: 'acct' },
            { key: 'tidal-pl',    title: 'TIDAL · Playlists', provider: 'tidal', category: 'playlists', items: mergeProviderPlaylists(acct.tidal?.playlists || [], 'tidal'), pageSize: limitFor('tidal-pl'), type: 'acct' },
          ],
        };

        const orderedSections = providerPriority
          .flatMap(p => sectionsByProvider[p] || [])
          .filter(s => s && s.pageSize > 0 && s.items.length > 0 && (!followingOnly || s.category === 'newStuff'))
          .filter(s => !expandedSectionKey || expandedSectionKey === s.key);

        if (orderedSections.length === 0) return null;

        const viewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        const gridCols = homeLayout.cols || 3;

        return (
          <>
            {orderedSections.map(sec => {
              const isExpanded = expandedSectionKey === sec.key;
              if (isExpanded) {
                const visibleItems = sec.items.slice(0, expandedVisibleCount);
                return (
                  <section key={sec.key} className="home-section">
                    <div className="section-title">
                      <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>
                        ← {sec.title}
                      </span>
                      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {sec.items.length}
                      </span>
                    </div>
                    {sec.type === 'uploads' ? (
                      viewMode === 'list'
                        ? <UploadExpandedList uploads={visibleItems} />
                        : <UploadGridView uploads={visibleItems} cols={gridCols} />
                    ) : (
                      <AccountItemList items={visibleItems} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                    )}
                    {expandedVisibleCount < sec.items.length && (
                      <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                    )}
                  </section>
                );
              }

              // Render "New on Bandcamp" using the Featured hero carousel layout (featuring new releases/albums from followings)
              if (sec.key === 'bandcamp-new') {
                const sortedBcReleases = [...(sec.items || [])].filter(it => !isItemHidden(it)).sort((a, b) => {
                  const ua = String(a.albumUrl || a.trackUrl || a.url || '');
                  const ub = String(b.albumUrl || b.trackUrl || b.url || '');
                  const isAlbA = a.kind === 'album' || ua.includes('/album/') ? 1 : 0;
                  const isAlbB = b.kind === 'album' || ub.includes('/album/') ? 1 : 0;
                  const tsA = Number(a.releaseTimestamp || 0);
                  const tsB = Number(b.releaseTimestamp || 0);
                  if (tsA && tsB && tsA !== tsB) return tsB - tsA;
                  if (isAlbA !== isAlbB) return isAlbB - isAlbA;
                  const yrA = parseInt(a.year, 10) || 0;
                  const yrB = parseInt(b.year, 10) || 0;
                  if (yrA !== yrB) return yrB - yrA;
                  return 0;
                });
                const bcHeroItems = sortedBcReleases.slice(0, sec.pageSize || 9);
                return (
                  <section key={sec.key} className="home-section">
                    <div className="section-title">
                      <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>{sec.title}</span>
                    </div>
                    <div
                      className="featured-hero-row"
                      ref={bandcampHeroRef}
                      onScroll={handleBcHeroScroll}
                    >
                      {bcHeroItems.map((it, idx) => {
                        const releaseUrl = it.albumUrl || it.trackUrl || it.url || '';
                        const rawTitleCandidate = it.album || it.releaseTitle || it.title || '';
                        const prelimMeta = splitCleanMetadata(rawTitleCandidate, it.artistName || it.artist || '', it.label || it.labelName || '');
                        const prelimKey = `${(prelimMeta.artist || '').toLowerCase()}::${(prelimMeta.title || '').toLowerCase()}`;
                        const rich = (releaseUrl && heroMetaMap[releaseUrl]) || (it.id && heroMetaMap[it.id]) || heroMetaMap[prelimKey] || {};
                        const displayRawTitle = (rich.title && (/^[A-Z]{1,8}\s*[-#.]?\s*\d{1,5}[A-Z]?$/i.test(prelimMeta.title) || !prelimMeta.title))
                          ? rich.title
                          : (rawTitleCandidate || rich.title || '');
                        const displayRawArtist = prelimMeta.artist || rich.artist || it.artistName || it.artist || '';
                        const meta = splitCleanMetadata(displayRawTitle, displayRawArtist, it.label || it.labelName || rich.label || '');
                        const albumTitle = meta.title || rich.title || displayRawTitle || it.title || '';
                        const artistDisplay = meta.artist || rich.artist || it.artistName || it.artist || '';
                        const rawCover = it.artworkUrl || it.cover || rich.cover || '';
                        const cleanCover = rawCover ? pinImageInMemory(rawCover, it.id || `bc-new-${idx}`) : '';
                        const richCover = rich.cover ? pinImageInMemory(rich.cover, `${it.id || `bc-new-${idx}`}-rich`) : '';
                        const showCover = (cleanCover && !brokenCovers[cleanCover])
                          ? cleanCover
                          : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                        const showLabel = cleanHeroLabel(meta.label || rich.label || it.label || it.labelName || '', artistDisplay, albumTitle);
                        const releaseDateStr = formatHeroReleaseDate(it.releaseDate || rich.releaseDate || it.year || '', it.releaseTimestamp);
                        const locationStr = String(it.location || rich.location || it.country || '').trim();
                        const rawBcFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                          ? rich.formats
                          : (typeof rich.formats === 'string' && rich.formats.trim() ? rich.formats : (it.formats || it.format));
                        const formatsList = normalizeHeroFormats(rawBcFormats, true);
                        const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                        return (
                          <button
                            key={it.id || `bc-new-${idx}`}
                            className="featured-hero-card"
                            {...bindLongPress({
                              id: it.id || `bc-new-${idx}`,
                              title: albumTitle,
                              artist: artistDisplay,
                              artworkUrl: showCover || cleanCover || it.artworkUrl,
                              provider: 'bandcamp',
                              kind: 'album',
                              url: releaseUrl,
                            }, () => {
                              openPlaylistSheet({
                                ...it,
                                kind: 'album',
                                title: albumTitle,
                                artistName: artistDisplay,
                                artworkUrl: showCover || cleanCover || it.artworkUrl,
                                cover: showCover || cleanCover || it.cover,
                                label: showLabel || meta.label || it.label,
                                releaseDate: releaseDateStr || it.releaseDate,
                                location: locationStr || it.location,
                                formats: formatsList,
                                url: releaseUrl,
                                trackUrl: releaseUrl,
                              });
                            })}
                          >
                            <div className="featured-hero-art">
                              {showCover
                                ? <img src={showCover} alt={albumTitle} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                                : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                            </div>
                            {/* Info on the right of artwork: 1. Album, 2. Artist, 3. Label, 4. Release Date, 5. Location, 6. Formats */}
                            <div className="featured-hero-info">
                              <HeroMarqueeRow className="featured-hero-title">{albumTitle}</HeroMarqueeRow>
                              <HeroMarqueeRow className="featured-hero-artist">{artistDisplay}</HeroMarqueeRow>
                              {showLabel && <HeroMarqueeRow className="featured-hero-label">{showLabel}</HeroMarqueeRow>}
                              {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                              {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                              <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              }

              const pages = [];
              for (let i = 0; i < sec.items.length; i += sec.pageSize) {
                pages.push(sec.items.slice(i, i + sec.pageSize));
              }
              return (
                <section key={`${sec.key}-${sec.pageSize}`} className="home-section">
                  <div className="section-title">
                    <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>{sec.title}</span>
                  </div>
                  {pages.length <= 1 ? (
                    sec.type === 'uploads' ? (
                      viewMode === 'list'
                        ? <UploadExpandedList uploads={pages[0] || []} />
                        : <UploadGridView uploads={pages[0] || []} cols={gridCols} />
                    ) : (
                      <AccountItemList items={pages[0] || []} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                    )
                  ) : (
                    <CatalogSwipeRow
                      key={`${sec.key}-${sec.pageSize}`}
                      sectionKey={`${sec.key}-${sec.pageSize}`}
                      pages={pages}
                      renderPage={(pageItems) =>
                        sec.type === 'uploads' ? (
                          viewMode === 'list'
                            ? <UploadExpandedList uploads={pageItems} />
                            : <UploadGridView uploads={pageItems} cols={gridCols} />
                        ) : (
                          <AccountItemList items={pageItems} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                        )
                      }
                    />
                  )}
                </section>
              );
            })}
          </>
        );
      })()}

      {/* ═══ 1.5 — HISTORY ═══ */}
      {showFeatured && playHistory.filter(it => !isItemHidden(it)).length > 0 && (!expandedSectionKey || expandedSectionKey === 'history') && (
        <section className="home-section">
          <div className="section-title">
            <span onClick={() => toggleExpandSection('history')} style={{ cursor: 'pointer' }}>
              {expandedSectionKey === 'history' ? '← History' : 'History'}
            </span>
            {expandedSectionKey === 'history' && (
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{playHistory.filter(it => !isItemHidden(it)).length}</span>
            )}
          </div>
          {expandedSectionKey === 'history' ? (
            <>
              <div className={`upl-grid upl-grid-${homeLayout.cols || 3}`}>
                {playHistory.filter(it => !isItemHidden(it)).slice(0, expandedVisibleCount).map(item => {
                  const cleanCover = pinImageInMemory(item.cover || item.artworkUrl, item.id);
                  const showCover = cleanCover && !brokenCovers[cleanCover] ? cleanCover : '';
                  return (
                    <button
                      key={item._hkey || item.id}
                      className="upl-grid-cell"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      {...bindLongPress({
                        id: item.id,
                        title: item.title,
                        artist: item.artist,
                        artworkUrl: showCover || item.cover || item.artworkUrl,
                        provider: item.provider || 'bandcamp',
                        kind: 'track',
                        url: item.url || item.trackUrl || '',
                      }, () => playFromHistory(item))}
                    >
                      <div className="upl-grid-art">
                        {showCover ? (
                          <img src={showCover} alt={item.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                        ) : (
                          <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2} /></div>
                        )}
                      </div>
                      <div className="upl-grid-title">{item.title}</div>
                      <div className="upl-grid-artist">{item.artist}</div>
                    </button>
                  );
                })}
              </div>
              {expandedVisibleCount < playHistory.filter(it => !isItemHidden(it)).length && (
                <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
              )}
            </>
          ) : (
            <div className="scroll-row">
              {playHistory.filter(it => !isItemHidden(it)).slice(0, 30).map(item => {
                const cleanCover = pinImageInMemory(item.cover || item.artworkUrl, item.id);
                const showCover = cleanCover && !brokenCovers[cleanCover] ? cleanCover : '';
                return (
                  <button 
                    key={item._hkey || item.id} 
                    className="shelf-card" 
                    style={{ width: 110, border: 'none', background: 'none', textAlign: 'left', padding: 0 }} 
                    {...bindLongPress({
                      id: item.id,
                      title: item.title,
                      artist: item.artist,
                      artworkUrl: showCover || item.cover || item.artworkUrl,
                      provider: item.provider || 'bandcamp',
                      kind: 'track',
                      url: item.url || item.trackUrl || '',
                    }, () => playFromHistory(item))}
                  >
                    <div className="shelf-card-art">
                      {showCover ? (
                        <img src={showCover} alt={item.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                      ) : (
                        <div className="featured-hero-art-ph"><Music2 size={24} strokeWidth={1.2} /></div>
                      )}
                    </div>
                    <div className="shelf-card-info">
                      <div className="shelf-card-title">{item.title}</div>
                      <div className="shelf-card-sub">{item.artist}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══ 2 — MY UPLOADS (private) ═══ */}
      {showReleases && myUploads.length > 0 && (!expandedSectionKey || expandedSectionKey === 'my-uploads') && (() => {
        const isExpanded = expandedSectionKey === 'my-uploads';
        const uploadPageSize = Math.max(3, (homeLayout.cols || 3) * 2);
        const uploadPages = [];
        for (let i = 0; i < myUploads.length; i += uploadPageSize) {
          uploadPages.push(myUploads.slice(i, i + uploadPageSize));
        }
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('my-uploads')} style={{ cursor: 'pointer' }}>
                {isExpanded ? '← ' : ''}<Lock size={14} style={{marginRight:5,verticalAlign:'middle'}}/> My Uploads
              </span>
              <span style={{fontSize:'.72rem',color:'var(--text-muted)'}}>{myUploads.length} tracks</span>
            </div>
            {isExpanded ? (
              <>
                {homeLayout.mode === 'list'
                  ? <UploadExpandedList uploads={myUploads.slice(0, expandedVisibleCount)}/>
                  : <UploadGridView uploads={myUploads.slice(0, expandedVisibleCount)} cols={homeLayout.cols}/>}
                {expandedVisibleCount < myUploads.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : uploadPages.length <= 1 ? (
              homeLayout.mode === 'list'
                ? <UploadExpandedList uploads={myUploads}/>
                : <UploadGridView uploads={myUploads} cols={homeLayout.cols}/>
            ) : (
              <CatalogSwipeRow
                sectionKey="my-uploads"
                pages={uploadPages}
                renderPage={(pageItems) =>
                  homeLayout.mode === 'list'
                    ? <UploadExpandedList uploads={pageItems}/>
                    : <UploadGridView uploads={pageItems} cols={homeLayout.cols}/>
                }
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 3 — RELEASES ═══ */}
      {showReleases && (!expandedSectionKey || expandedSectionKey === 'releases') && (() => {
        const isExpanded = expandedSectionKey === 'releases';
        const releasePageSize = Math.max(3, (homeLayout.cols || 3) * 2);
        const releasePages = [];
        for (let i = 0; i < publicAlbums.length; i += releasePageSize) {
          releasePages.push(publicAlbums.slice(i, i + releasePageSize));
        }
        const renderReleaseGrid = (albumsSlice) => (
          <div className={`upl-grid upl-grid-${homeLayout.cols || 3}`}>
            {albumsSlice.map(album => {
              const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
              return (
                <button
                  key={album.id}
                  className="upl-grid-cell"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  {...bindLongPress({
                    id: album.id,
                    title: album.title,
                    artist: album.artist,
                    artworkUrl: cleanCover || album.cover,
                    provider: 'kyoyu',
                    kind: 'album',
                    url: album.url || album.trackUrl || '',
                  }, () => {
                    const isSingle = String(album.id || '').startsWith('single::') && album.tracks?.length === 1;
                    if (isSingle) {
                      playTrack(album.tracks[0]);
                    } else {
                      setSelectedAlbum(openNativeAlbumFast(album));
                    }
                  })}
                >
                  <div className="upl-grid-art">
                    {cleanCover
                      ? <img src={cleanCover} alt={album.title} loading="eager" decoding="sync"/>
                      : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                  </div>
                  <div className="upl-grid-title">{album.title}</div>
                  <div className="upl-grid-artist">{album.artist}</div>
                </button>
              );
            })}
          </div>
        );
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('releases')} style={{ cursor: 'pointer' }}>
                {isExpanded ? '← Releases' : 'Releases'}
              </span>
              {isExpanded && (
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{publicAlbums.length}</span>
              )}
            </div>
            {publicAlbums.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '16px 0' }}>No public releases yet.</p>
            ) : isExpanded ? (
              <>
                {renderReleaseGrid(publicAlbums.slice(0, expandedVisibleCount))}
                {expandedVisibleCount < publicAlbums.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : releasePages.length <= 1 ? (
              renderReleaseGrid(releasePages[0] || [])
            ) : (
              <CatalogSwipeRow
                sectionKey="releases"
                pages={releasePages}
                renderPage={(pageAlbums) => renderReleaseGrid(pageAlbums)}
              />
            )}
          </section>
        );
      })()}

      {/* Album detail sheet */}
      {!window.webkit?.messageHandlers?.player && selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}

      {/* ═══ 4 — EVENTS ═══ */}
      {showEvents && (!expandedSectionKey || expandedSectionKey === 'events') && (
        <section className="home-section">
          <div className="section-title">
            <span onClick={() => toggleExpandSection('events')} style={{ cursor: 'pointer' }}>
              {expandedSectionKey === 'events' ? '← Events' : 'Events'}
            </span>
          </div>
          <div className="scroll-row" style={expandedSectionKey === 'events' ? { flexWrap: 'wrap', gap: 14 } : undefined}>
            {berghainEvents.map((e, idx) => (
              <BerghainEventCard key={e.id} event={e} onClick={() => setSelectedEventIndex(idx)} />
            ))}
          </div>
        </section>
      )}

      {selectedEventIndex !== null && (
        <EventSheet
          events={berghainEvents}
          initialIndex={selectedEventIndex}
          onClose={() => setSelectedEventIndex(null)}
        />
      )}

    </div>
  );
}
