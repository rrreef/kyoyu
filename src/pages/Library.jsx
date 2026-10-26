import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, ChevronDown, ChevronUp, Music2, Trash2, Lock, ArrowRight, Radio } from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useDisplay, useLibraryLayoutLive } from '../contexts/DisplayContext';
import { releases, playlists as mockPlaylists, savedPlaylists, djSets, artistRadios } from '../data/mockData';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import AlbumSheet, { openNativeAlbumFast, registerAlbumPlayback } from '../components/ui/AlbumSheet';
import EventSheet from '../components/ui/EventSheet';
import { berghainEvents } from '../data/berghainEvents';
import { BerghainEventCard } from '../components/ui/Cards';
import AccountItemList, { pinImageInMemory } from '../components/AccountItems';
import { useConnectedLibrary } from '../lib/useConnectedLibrary';
import { isStreamingAvailable, useProviderPriority } from '../lib/streaming';
import './Library.css';

const _librarySectionLimits = new Map();

/* A labelled block of items from a connected SoundCloud / Bandcamp account.
   Renders in pages; more items load automatically when the user scrolls near the bottom.
   Once loaded, the expanded limit stays in memory so scrolling up/down never re-loads or collapses items. */
function AcctSection({ title, items, first, view = 'list', cols = 3, onOpenPlaylist }) {
  const PAGE = 40;
  const cacheKey = title || `default-${view}-${cols}`;
  const [limit, setLimit] = useState(() => _librarySectionLimits.get(cacheKey) || PAGE);
  const sentinelRef = useRef(null);
  const total = items ? items.length : 0;

  useEffect(() => {
    const saved = _librarySectionLimits.get(cacheKey);
    if (saved && saved > limit) setLimit(saved);
  }, [cacheKey, limit]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || limit >= total) return undefined;
    const bumpLimit = () => {
      setLimit(l => {
        const next = Math.min(l + PAGE, total);
        _librarySectionLimits.set(cacheKey, Math.max(_librarySectionLimits.get(cacheKey) || PAGE, next));
        return next;
      });
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) bumpLimit();
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, cacheKey]);

  if (!items || total === 0) return null;
  return (
    <>
      {title && <div className="shelf-row-label" style={{ marginTop: first ? 0 : 18 }}>{title}</div>}
      <AccountItemList items={items.slice(0, limit)} view={view} cols={cols} onOpenPlaylist={onOpenPlaylist} />
      {limit < total && <div ref={sentinelRef} style={{ height: 1 }} />}
    </>
  );
}

function groupByAlbum(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    const hasAlbum = t.album && t.album.trim() && t.album.trim() !== t.title.trim();
    const key = hasAlbum ? `album::${t.album.trim()}::${t.artist.trim()}` : `single::${t.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title:  hasAlbum ? t.album.trim() : t.title,
        artist: t.artist,
        cover:  t.cover,
        label:  t.label,
        genre:  t.genre,
        year:   t.year,
        tracks: [],
      });
    }
    const entry = map.get(key);
    entry.tracks.push(t);
    if (!entry.cover && t.cover) entry.cover = t.cover;
  });
  // Sort tracks within each album by track number from storage_key
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


/* ── Shelf card — identical to Home ───────────────────────── */
function ShelfCard({ cover, title, sub, badge, badgeIcon: BadgeIcon, fallback }) {
  const cleanCover = cover ? pinImageInMemory(cover) : '';
  return (
    <div className="shelf-card">
      <div className="shelf-card-art">
        {cleanCover
          ? <img src={cleanCover} alt={title} loading="eager" decoding="sync"/>
          : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--grey-800)'}}>{fallback||<Music2 size={22} color="var(--text-dim)"/>}</div>
        }
        {badge&&<div className="shelf-card-badge">{BadgeIcon&&<BadgeIcon size={9}/>}<span>{badge}</span></div>}
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {sub&&<div className="shelf-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

function LibRow({ cover, title, sub, onClick, round = false, showPlay = true }) {
  const cleanSrc = cover ? pinImageInMemory(cover) : '';
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: round ? 32 : 8, overflow: 'hidden', flexShrink: 0,
        background: 'var(--grey-800)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {cleanSrc ? <img src={cleanSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="eager" decoding="sync" />
             : <Music2 size={22} color="var(--text-dim)" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub || ''}</div>
      </div>
      {showPlay && (
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>
          <Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />
        </div>
      )}
    </div>
  );
}

// Main filter keys
const FILTERS = [
  { key: 'titles',    label: 'Titles'    },
  { key: 'albums',    label: 'Albums'    },
  { key: 'purchases', label: 'Purchases' },
  { key: 'wishlist',  label: 'Wishlist'  },
  { key: 'likes',     label: 'Likes'     },
  { key: 'playlists', label: 'Playlists' },
  { key: 'follows',   label: 'Follows'   },
  { key: 'shared',    label: 'Shared'    },
  { key: 'uploads',   label: 'Uploads'   },
  { key: 'events',    label: 'Events'    },
];

// Sub-filters that appear when Likes is active
const LIKES_SUB = [
  { key: 'releases',  label: 'Releases'  },
  { key: 'playlists', label: 'Playlists' },
];

const PROVIDER_LABELS = { soundcloud: 'SoundCloud', youtube: 'YouTube', discogs: 'Discogs', spotify: 'Spotify', applemusic: 'Apple Music', tidal: 'TIDAL' };

export default function Library() {
  // The native filter bar owns provider / category / view; the page only mirrors it
  const [activeFilter, setFilter]    = useState(window.__kyoyuLibraryCategory || 'likes');
  const [libProvider,  setLibProvider] = useState(window.__kyoyuLibraryProvider || 'all');
  const [nativeView,   setNativeView]  = useState(window.__kyoyuLibraryView || null);   // 'list' | 'grid' | null (website)
  useEffect(() => {
    const onState = (e) => {
      const d = e.detail || {};
      if (d.provider) setLibProvider(d.provider);
      if (d.category) setFilter(d.category);
      if (d.view) setNativeView(d.view);
    };
    document.addEventListener('kyoyu-library-state', onState);
    return () => document.removeEventListener('kyoyu-library-state', onState);
  }, []);
  const [likesSub,     setLikesSub]  = useState('releases');
  const [sortDesc,     setSort]      = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [myUploads,    setMyUploads]  = useState([]);
  const [uploadsSort,  setUploadsSort]= useState('newest');
  const [eventsFilter, setEventsFilter]= useState('All');
  const [selectedEventIndex, setSelectedEventIndex] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const hydrated = parsed.map(t => ({
          ...t,
          artworkUrl: localStorage.getItem(`kyoyu-art-${user.id}-${t.id}`) || t.artworkUrl || null,
        }));
        setMyUploads(hydrated);
      } else {
        setMyUploads([]);
      }
    } catch {}
  }, [user?.id, activeFilter]);

  function sortUpl(arr) {
    const c = [...arr];
    if(uploadsSort==='oldest') return c.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));
    if(uploadsSort==='artist') return c.sort((a,b)=>(a.artist||'').localeCompare(b.artist||''));
    if(uploadsSort==='label')  return c.sort((a,b)=>(a.label||'').localeCompare(b.label||''));
    return c.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  }
  function deleteUpload(id) {
    const next = myUploads.filter(t=>t.id!==id);
    setMyUploads(next);
    if(user?.id) localStorage.setItem(`kyoyu-uploads-${user.id}`, JSON.stringify(next));
  }

  const { savedReleases, playlists, downloads, followedArtists, createPlaylist, getLikedUploads, likedTracks } = useLibrary();
  const { playRelease } = usePlayer();
  const libraryLayout = useLibraryLayoutLive();
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  // SoundCloud / Bandcamp / Spotify / Apple Music / TIDAL / YouTube Music accounts connected in Settings → their library shows up here automatically
  const acct = useConnectedLibrary();
  const [providerPriority] = useProviderPriority();
  const mergeProviderPlaylists = (remoteList, provKey) => {
    const base = Array.isArray(remoteList) ? remoteList : [];
    const localMatching = (playlists || [])
      .filter(p => Array.isArray(p.providers) && p.providers.includes(provKey))
      .filter(p => !base.some(r => String(r.title || '').trim().toLowerCase() === String(p.title || '').trim().toLowerCase()))
      .map(p => ({
        ...p,
        kind: 'playlist',
        provider: provKey,
        artworkUrl: p.cover || p.tracks?.[0]?.cover || '',
        artistName: `${p.tracks?.length || 0} tracks`,
      }));
    return [...localMatching, ...base];
  };
  const bcPurchaseTracks = acct.bandcamp.collection.filter(i => i.kind === 'track');
  const bcPurchaseAlbums = acct.bandcamp.collection.filter(i => i.kind === 'album');
  const bcWishTracks     = acct.bandcamp.wishlist.filter(i => i.kind === 'track');
  const bcWishAlbums     = acct.bandcamp.wishlist.filter(i => i.kind === 'album');
  const bcPlaylists      = mergeProviderPlaylists(acct.bandcamp?.playlists, 'bandcamp');
  const bcFollows        = acct.bandcamp?.following || [];
  const scLikes          = acct.soundcloud.likes;
  const scPlaylists      = mergeProviderPlaylists(acct.soundcloud.playlists, 'soundcloud');
  const scFollows        = acct.soundcloud?.following || [];
  const spLikes          = acct.spotify?.likes || [];
  const spPlaylists      = mergeProviderPlaylists(acct.spotify?.playlists, 'spotify');
  const spAlbums         = acct.spotify?.albums || [];
  const spFollows        = acct.spotify?.following || [];
  const amLikes          = acct.applemusic?.likes || [];
  const amPlaylists      = mergeProviderPlaylists(acct.applemusic?.playlists, 'applemusic');
  const amAlbums         = acct.applemusic?.albums || [];
  const amFollows        = acct.applemusic?.following || [];
  const tdLikes          = acct.tidal?.likes || [];
  const tdPlaylists      = mergeProviderPlaylists(acct.tidal?.playlists, 'tidal');
  const tdAlbums         = acct.tidal?.albums || [];
  const tdFollows        = acct.tidal?.following || [];
  const ytLikes          = acct.youtube?.likes || [];
  const ytPlaylists      = mergeProviderPlaylists(acct.youtube?.playlists, 'youtube');
  const ytAlbums         = acct.youtube?.albums || [];
  const ytFollows        = acct.youtube?.following || [];
  const dgCollection     = acct.discogs?.collection || [];
  const dgWishlist       = acct.discogs?.wishlist || [];
  const dgPurchases      = acct.discogs?.purchases || [];
  const hasAcctTitles    = bcPurchaseTracks.length + bcWishTracks.length + scLikes.length + spLikes.length + amLikes.length + tdLikes.length + ytLikes.length > 0;
  const hasAcctAlbums    = bcPurchaseAlbums.length + bcWishAlbums.length + spAlbums.length + amAlbums.length + tdAlbums.length + ytAlbums.length + dgCollection.length + dgWishlist.length + dgPurchases.length > 0;

  const savedReleaseObjects = releases.filter(r => savedReleases.includes(r.id));
  // Group saved releases into albums for the grid view
  const savedAlbums = useMemo(() => {
    // Convert mockData releases to the flat-track format groupByAlbum expects
    const flat = savedReleaseObjects.map(r => ({
      id:     r.id,
      title:  r.title,
      artist: r.artist,
      album:  r.title, // mock releases have no separate album field → treat as album
      cover:  r.cover,
      label:  r.label  || '',
      genre:  r.genre  || '',
      year:   r.year   || '',
      audioUrl: null,
      tracks: r.tracks || [],
    }));
    // Wrap each as its own album (mock data is already album-level)
    return savedReleaseObjects.map(r => ({
      id:     r.id,
      title:  r.title,
      artist: r.artist,
      cover:  r.cover,
      label:  r.label  || '',
      genre:  r.genre  || '',
      year:   r.year   || '',
      tracks: (r.tracks || []).map(t => ({
        ...t,
        artist:   r.artist,
        cover:    r.cover,
        audioUrl: t.src || t.fileUrl || null,
      })),
    }));
  }, [savedReleaseObjects]);

  // Sort helper — operates on arrays with a date-like field
  const sortByDate = arr => sortDesc ? [...arr].reverse() : [...arr];

  function handleCreate() {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setShowCreateModal(false);
  }

  function handleFilterClick(key) {
    setFilter(key);
    if (key !== 'likes') setLikesSub('releases'); // reset sub when leaving Likes
  }

  // Opens a playlist (Kyoyu or connected account) in the native sheet
  async function openPlaylistSheet(incomingPl) {
    if (!incomingPl) return;
    const pl = playlists.find(p => String(p.id) === String(incomingPl.id)) || incomingPl;
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    const initialTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const creator = pl.artistName || pl.creator || user?.displayName || 'You';
    let cover = pl.artworkUrl || pl.cover || null;
    if (cover && cover.includes('bcbits.com')) {
      cover = cover.replace(/_[0-9]+\.jpg/, '_10.jpg');
    }

    const pushToSheet = (currentTracks) => {
      const albumObj = {
        ...pl,
        artist: creator,
        cover,
        tracks: currentTracks,
        _ts: ts,
      };
      setSelectedAlbum(albumObj);
      // Tapping a playlist track in the native sheet plays it like History / Likes
      registerAlbumPlayback(albumObj);
      const mappedTracks = currentTracks.map(t => ({
        id: t.id || String(Date.now() + Math.random()),
        title: t.title || t.name || 'Unknown Track',
        artist: t.artist || t.artistName || '',
        url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || t.src || '',
        cover: t.cover || t.artworkUrl || t.releaseCover || null,
        provider: t.provider || pl.provider || null,
      }));
      try {
        if (pl.kind === 'album') {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            nativeAlbum: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title,
              artist: creator,
              cover,
              genre: pl.genre || null,
              year: pl.year ? String(pl.year) : null,
              label: pl.label || null,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        } else {
          window.webkit?.messageHandlers?.player?.postMessage({
            playlistOpen: true,
            nativePlaylist: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title || pl.name || 'Playlist',
              cover,
              creator,
              isPublic: !!pl.isPublic,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        }
      } catch(e) {}
    };

    // Open sheet immediately (0ms latency!)
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
        const now = Date.now();
        let fetched = (data.tracks || []).map((t, i) => ({
          id: `bc-${t.trackId || i}`,
          kind: 'track',
          provider: 'bandcamp',
          title: t.title,
          artist: t.artistName || creator,
          artistName: t.artistName || creator,
          artworkUrl: t.artworkUrl || cover,
          cover: t.artworkUrl || cover,
          duration: t.duration || 0,
          streamUrl: t.streamUrl || '',
          audioUrl: t.streamUrl || '',
          url: t.streamUrl || t.trackUrl || '',
          trackUrl: t.trackUrl || albumUrl,
          providerItemId: t.trackUrl || albumUrl,
          streamFetchedAt: t.streamUrl ? now : undefined,
        }));
        if (!fetched.length) {
          const r2 = await fetch('/api/bandcamp-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'album-tracks', url: albumUrl }),
          }).catch(() => null);
          const data2 = r2 && r2.ok ? await r2.json() : { tracks: [] };
          fetched = (data2.tracks || []).map((t, i) => ({
            id: `bc-${t.trackId || t.trackNum || i}`,
            kind: 'track',
            provider: 'bandcamp',
            title: t.title,
            artist: t.artist || t.artistName || creator,
            artistName: t.artist || t.artistName || creator,
            artworkUrl: t.artworkUrl || cover,
            cover: t.artworkUrl || cover,
            duration: t.duration || 0,
            streamUrl: t.streamUrl || '',
            audioUrl: t.streamUrl || '',
            url: t.streamUrl || t.url || albumUrl,
            trackUrl: t.url || albumUrl,
            providerItemId: t.url || albumUrl,
            streamFetchedAt: t.streamUrl ? now : undefined,
          }));
        }
        if (!fetched.length) {
          fetched = await fetchAccountLibrary('bandcamp', 'playlistTracks', { playlistUrl: albumUrl }).catch(() => []);
        }
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            pushToSheet(fetched);
          }
        }
      } catch (err) {
        // Sheet already opened with initialTracks
      }
      return;
    }

    // If external playlist and tracks are not loaded yet, fetch them on demand:
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
        console.warn('Failed to load playlist tracks:', err);
      }
    }
  }

  // List / icon view chosen in the native filter bar (website: the display setting)
  const layoutMode = nativeView || libraryLayout.mode;     // 'list' | 'grid'
  const gridCols = libraryLayout.cols;

  const isNative = typeof window !== 'undefined' && !!(window.webkit?.messageHandlers?.player || window.webkit?.messageHandlers?.streaming);
  // Spacing so first content sits under the 2nd filter row with exact same gap as between top buttons and 1st row
  const barSpacer = isNative ? <div style={{ height: 82 }} /> : null;

  const hiddenFilterButtons = (
    <div style={{ display: 'none' }}>
      {FILTERS.map(({ key }) => (
        <button key={key} data-library-filter={key} onClick={() => handleFilterClick(key)} />
      ))}
    </div>
  );

  // ── Provider-specific library (provider filter row) ──
  if (libProvider !== 'all') {
    const empty = (msg) => <div className="lib-empty"><p>{msg}</p></div>;
    let body = null;

    if (libProvider === 'bandcamp') {
      const cat = ['purchases', 'wishlist', 'follows', 'playlists'].includes(activeFilter) ? activeFilter : 'purchases';
      if (!acct.bandcamp.connected) {
        body = empty('Connect Bandcamp in Settings › Streaming Services to see your purchases and wishlist.');
      } else if (cat === 'playlists') {
        const bcPl = bcPlaylists;
        const err = acct.errors['bandcamp:playlists'];
        body = bcPl.length > 0
          ? <AcctSection items={bcPl} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No playlists in your Bandcamp account yet.'));
      } else {
        const list = cat === 'wishlist' ? acct.bandcamp.wishlist : cat === 'follows' ? acct.bandcamp.following : acct.bandcamp.collection;
        body = list.length > 0
          ? <AcctSection items={list} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : cat === 'wishlist' ? 'Your wishlist is empty.' : cat === 'follows' ? 'You don’t follow anyone on Bandcamp yet.' : 'Nothing in your collection yet.');
      }
    } else if (libProvider === 'soundcloud') {
      if (!acct.soundcloud.connected) {
        body = empty('Connect SoundCloud in Settings › Streaming Services to see your likes and playlists.');
      } else if (activeFilter === 'playlists') {
        body = scPlaylists.length > 0 ? <AcctSection items={scPlaylists} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} /> : empty(acct.loading ? 'Loading…' : 'No playlists yet.');
      } else if (activeFilter === 'follows') {
        body = scFollows.length > 0 ? <AcctSection items={scFollows} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} /> : empty(acct.loading ? 'Loading…' : 'You don’t follow anyone on SoundCloud yet.');
      } else {
        body = scLikes.length > 0 ? <AcctSection items={scLikes} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} /> : empty(acct.loading ? 'Loading…' : 'No likes yet.');
      }
    } else if (libProvider === 'youtube') {
      if (!acct.youtube?.connected) {
        body = empty('Connect YouTube Music in Settings › Streaming Services to see your likes, albums, playlists and follows.');
      } else if (activeFilter === 'playlists') {
        const err = acct.errors['youtube:playlists'];
        body = ytPlaylists.length > 0
          ? <AcctSection items={ytPlaylists} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No playlists in your YouTube Music account yet.'));
      } else if (activeFilter === 'albums') {
        const err = acct.errors['youtube:albums'];
        body = ytAlbums.length > 0
          ? <AcctSection items={ytAlbums} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No saved albums in your YouTube Music account yet.'));
      } else if (activeFilter === 'follows') {
        const err = acct.errors['youtube:following'];
        body = ytFollows.length > 0
          ? <AcctSection items={ytFollows} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'You don’t follow any artists on YouTube Music yet.'));
      } else {
        const err = acct.errors['youtube:likes'];
        body = ytLikes.length > 0
          ? <AcctSection items={ytLikes} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No liked songs in your YouTube Music account yet.'));
      }
    } else if (libProvider === 'spotify') {
      if (!acct.spotify?.connected) {
        body = empty('Connect Spotify in Settings › Streaming Services to see your library.');
      } else if (activeFilter === 'playlists') {
        const err = acct.errors['spotify:playlists'];
        body = spPlaylists.length > 0
          ? <AcctSection items={spPlaylists} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No playlists in your Spotify account yet.'));
      } else if (activeFilter === 'albums') {
        const err = acct.errors['spotify:albums'];
        body = spAlbums.length > 0
          ? <AcctSection items={spAlbums} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No saved albums in your Spotify account yet.'));
      } else if (activeFilter === 'follows') {
        const err = acct.errors['spotify:following'];
        body = spFollows.length > 0
          ? <AcctSection items={spFollows} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'You don’t follow any artists on Spotify yet.'));
      } else {
        const err = acct.errors['spotify:likes'];
        body = spLikes.length > 0
          ? <AcctSection items={spLikes} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No liked songs in your Spotify account yet.'));
      }
    } else if (libProvider === 'applemusic') {
      if (!acct.applemusic?.connected) {
        body = empty('Connect Apple Music in Settings › Streaming Services to see your library.');
      } else if (activeFilter === 'playlists') {
        const err = acct.errors['applemusic:playlists'];
        body = amPlaylists.length > 0
          ? <AcctSection items={amPlaylists} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No playlists in your Apple Music account yet.'));
      } else if (activeFilter === 'albums') {
        const err = acct.errors['applemusic:albums'];
        body = amAlbums.length > 0
          ? <AcctSection items={amAlbums} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No saved albums in your Apple Music account yet.'));
      } else if (activeFilter === 'follows') {
        const err = acct.errors['applemusic:following'];
        body = amFollows.length > 0
          ? <AcctSection items={amFollows} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'You don’t have any artists in your Apple Music library yet.'));
      } else {
        const err = acct.errors['applemusic:likes'];
        body = amLikes.length > 0
          ? <AcctSection items={amLikes} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No songs in your Apple Music library yet.'));
      }
    } else if (libProvider === 'tidal') {
      if (!acct.tidal?.connected) {
        body = empty('Connect TIDAL in Settings › Streaming Services to see your library.');
      } else if (activeFilter === 'playlists') {
        const err = acct.errors['tidal:playlists'];
        body = tdPlaylists.length > 0
          ? <AcctSection items={tdPlaylists} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No playlists in your TIDAL account yet.'));
      } else if (activeFilter === 'albums') {
        const err = acct.errors['tidal:albums'];
        body = tdAlbums.length > 0
          ? <AcctSection items={tdAlbums} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No saved albums in your TIDAL account yet.'));
      } else if (activeFilter === 'follows') {
        const err = acct.errors['tidal:following'];
        body = tdFollows.length > 0
          ? <AcctSection items={tdFollows} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'You don’t follow any artists on TIDAL yet.'));
      } else {
        const err = acct.errors['tidal:likes'];
        body = tdLikes.length > 0
          ? <AcctSection items={tdLikes} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No liked tracks in your TIDAL account yet.'));
      }
    } else if (libProvider === 'discogs') {
      if (!acct.discogs?.connected) {
        body = empty('Connect Discogs in Settings › Streaming Services to see your collection, purchases, and wishlist.');
      } else if (activeFilter === 'wishlist') {
        const dgWish = acct.discogs.wishlist || [];
        const err = acct.errors['discogs:wishlist'];
        body = dgWish.length > 0
          ? <AcctSection items={dgWish} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'Your Discogs wishlist is empty.'));
      } else if (activeFilter === 'purchases') {
        const dgPurch = (acct.discogs.purchases && acct.discogs.purchases.length > 0) ? acct.discogs.purchases : (acct.discogs.collection || []);
        const err = acct.errors['discogs:purchases'] || acct.errors['discogs:collection'];
        body = dgPurch.length > 0
          ? <AcctSection items={dgPurch} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'No Discogs purchases found.'));
      } else {
        const dgColl = acct.discogs.collection || [];
        const err = acct.errors['discogs:collection'];
        body = dgColl.length > 0
          ? <AcctSection items={dgColl} view={layoutMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
          : empty(acct.loading ? 'Loading…' : (err || 'Your Discogs collection is empty.'));
      }
    } else {
      body = empty(`Your ${PROVIDER_LABELS[libProvider] || libProvider} library will appear here soon.`);
    }

    return (
      <div className="page library-page animate-in">
        {barSpacer}
        {hiddenFilterButtons}
        {activeFilter === 'playlists' && playlists.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div className="shelf-row-label">My Playlists</div>
            {layoutMode === 'list' ? (
              <div>
                {playlists.map(pl => (
                  <LibRow
                    key={pl.id}
                    cover={pl.cover}
                    title={pl.title}
                    sub={`${pl.tracks?.length || 0} tracks`}
                    onClick={() => openPlaylistSheet(pl)}
                  />
                ))}
              </div>
            ) : (
              <div className="scroll-row">
                {playlists.map(pl => (
                  <div key={pl.id} onClick={() => openPlaylistSheet(pl)} style={{ cursor: 'pointer' }}>
                    <ShelfCard cover={pl.cover} title={pl.title} sub={`${pl.tracks?.length || 0} tracks`} badge={pl.isAI ? 'AI' : null} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {body}
        {selectedAlbum && <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />}
      </div>
    );
  }

  return (
    <div className="page library-page animate-in">
      {barSpacer}

      {/* Header — only shown when viewing Playlists */}
      {activeFilter === 'playlists' && (
        <div className="library-header" style={{ marginTop: 8, marginBottom: 12 }}>
          <button className="lib-add-btn glass-sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>New Playlist</span>
          </button>
        </div>
      )}

      {/* Hidden filter buttons — targeted by native LibraryFilterBar */}
      {hiddenFilterButtons}

      {/* ── Content ── */}

      {/* Likes → Releases (also the "Titles" view of the native filter bar) */}
      {(activeFilter === 'likes' || activeFilter === 'titles') && likesSub === 'releases' && (() => {
        const likedUploadsArr = getLikedUploads(user?.id);
        const catalogLiked = Array.from(new Set(likedTracks)).map(id =>
          {
          let t = releases.flatMap(r => r.tracks).find(x => String(x.id) === String(id));
          if (t) {
            const r = releases.find(rel => rel.tracks.some(tr => tr.id === t.id));
            return { ...t, artworkUrl: r ? r.cover : null, artist: t.artist || r?.artist, album: r?.title, fileUrl: t.src || t.audioUrl || '' };
          }
          return null;
        }).filter(Boolean);
        
        const combinedLikedTracks = [...catalogLiked, ...likedUploadsArr];

        const hasReleases = savedReleaseObjects.length > 0;
        const hasTracks   = combinedLikedTracks.length > 0;
        if (!hasReleases && !hasTracks && hasAcctTitles) return null;   // connected accounts fill the page below
        if (!hasReleases && !hasTracks)
          return <div className="lib-empty"><p>No liked titles yet.</p><Link to="/search" className="lib-empty-link">Browse the catalog →</Link></div>;
        return (
          <>
            {hasTracks && (
              <>
                <div className="shelf-row-label" style={{ marginTop: 0 }}>Liked Tracks</div>
                {layoutMode === 'list'
                  ? <UploadExpandedList uploads={combinedLikedTracks}/>
                  : <UploadGridView uploads={combinedLikedTracks} cols={libraryLayout.cols}/>
                }
              </>
            )}
            {hasReleases && (
              <>
                <div className="shelf-row-label" style={{marginTop: hasTracks ? 16 : 0}}>Liked Releases</div>
                {layoutMode === 'list' ? (
                  <div>
                    {sortByDate(savedAlbums).map(album => (
                      <LibRow
                        key={album.id}
                        cover={album.cover}
                        title={album.title}
                        sub={album.artist}
                        onClick={() => setSelectedAlbum(openNativeAlbumFast(album))}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={`upl-grid upl-grid-${Math.min(5, Math.max(1, gridCols))}`}>
                    {sortByDate(savedAlbums).map(album => {
                      const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
                      return (
                        <button
                          key={album.id}
                          className="upl-grid-cell"
                          style={{ background:'none', border:'none', textAlign:'left', cursor:'pointer' }}
                          onClick={() => setSelectedAlbum(openNativeAlbumFast(album))}
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
                )}
              </>
            )}
          </>
        );
      })()}

      {/* Titles → connected accounts ordered by providerPriority */}
      {(activeFilter === 'likes' || activeFilter === 'titles') && likesSub === 'releases' && hasAcctTitles && (() => {
        const titleSectionsByProvider = {
          bandcamp: [
            { key: 'bc-purch', title: 'Bandcamp · Purchases', items: bcPurchaseTracks },
            { key: 'bc-wish',  title: 'Bandcamp · Wishlist',  items: bcWishTracks },
          ],
          soundcloud: [{ key: 'sc-likes', title: 'SoundCloud · Likes',     items: scLikes }],
          youtube:    [{ key: 'yt-likes', title: 'YouTube · Likes',        items: ytLikes }],
          spotify:    [{ key: 'sp-likes', title: 'Spotify · Liked Songs',  items: spLikes }],
          applemusic: [{ key: 'am-likes', title: 'Apple Music · Songs',    items: amLikes }],
          tidal:      [{ key: 'td-likes', title: 'TIDAL · Liked Tracks',   items: tdLikes }],
        };
        const orderedTitleSections = providerPriority
          .flatMap(p => titleSectionsByProvider[p] || [])
          .filter(s => s.items && s.items.length > 0);
        return (
          <div style={{ marginTop: 18 }}>
            {orderedTitleSections.map((s, idx) => (
              <AcctSection key={s.key} view={layoutMode} cols={gridCols} first={idx === 0} title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
            ))}
          </div>
        );
      })()}

      {/* Albums: saved releases + connected-account albums */}
      {activeFilter === 'albums' && (
        <>
          {savedAlbums.length > 0 && (
            <>
              <div className="shelf-row-label" style={{ marginTop: 0 }}>Saved Albums</div>
              {layoutMode === 'list' ? (
                <div>
                  {sortByDate(savedAlbums).map(album => (
                    <LibRow
                      key={album.id}
                      cover={album.cover}
                      title={album.title}
                      sub={album.artist}
                      onClick={() => setSelectedAlbum(openNativeAlbumFast(album))}
                    />
                  ))}
                </div>
              ) : (
                <div className={`upl-grid upl-grid-${Math.min(5, Math.max(1, gridCols))}`}>
                  {sortByDate(savedAlbums).map(album => {
                    const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
                    return (
                      <button
                        key={album.id}
                        className="upl-grid-cell"
                        style={{ background:'none', border:'none', textAlign:'left', cursor:'pointer' }}
                        onClick={() => setSelectedAlbum(openNativeAlbumFast(album))}
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
              )}
            </>
          )}
          {hasAcctAlbums && (() => {
            const albumSectionsByProvider = {
              bandcamp: [
                { key: 'bc-alb-purch', title: 'Bandcamp · Purchases', items: bcPurchaseAlbums },
                { key: 'bc-alb-wish',  title: 'Bandcamp · Wishlist',  items: bcWishAlbums },
              ],
              discogs: [
                { key: 'dg-coll', title: 'Discogs · Collection', items: dgCollection },
                { key: 'dg-wish', title: 'Discogs · Wishlist',   items: dgWishlist },
              ],
              youtube:    [{ key: 'yt-alb', title: 'YouTube · Saved Albums',     items: ytAlbums }],
              spotify:    [{ key: 'sp-alb', title: 'Spotify · Saved Albums',     items: spAlbums }],
              applemusic: [{ key: 'am-alb', title: 'Apple Music · Saved Albums', items: amAlbums }],
              tidal:      [{ key: 'td-alb', title: 'TIDAL · Saved Albums',       items: tdAlbums }],
            };
            const orderedAlbumSections = providerPriority
              .flatMap(p => albumSectionsByProvider[p] || [])
              .filter(s => s.items && s.items.length > 0);
            return (
              <div style={{ marginTop: savedAlbums.length ? 18 : 0 }}>
                {orderedAlbumSections.map((s, idx) => (
                  <AcctSection key={s.key} view={layoutMode} cols={gridCols} first={idx === 0} title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
                ))}
              </div>
            );
          })()}
          {savedAlbums.length === 0 && !hasAcctAlbums && (
            <div className="lib-empty"><p>No albums yet.</p><Link to="/search" className="lib-empty-link">Browse the catalog →</Link></div>
          )}
        </>
      )}

      {/* Purchases */}
      {activeFilter === 'purchases' && (
        <>
          {(bcPurchaseAlbums.length > 0 || bcPurchaseTracks.length > 0 || dgCollection.length > 0 || dgPurchases.length > 0) ? (() => {
            const purchaseSectionsByProvider = {
              discogs: [
                { key: 'dg-orders', title: 'Discogs · Orders & Purchases', items: dgPurchases },
                { key: 'dg-coll-p', title: 'Discogs · Collection',         items: dgCollection },
              ],
              bandcamp: [
                { key: 'bc-coll-p', title: 'Bandcamp · Purchases',         items: acct.bandcamp.collection },
              ],
            };
            const orderedPurchaseSections = providerPriority
              .flatMap(p => purchaseSectionsByProvider[p] || [])
              .filter(s => s.items && s.items.length > 0);
            return (
              <div>
                {orderedPurchaseSections.map((s, idx) => (
                  <AcctSection key={s.key} view={layoutMode} cols={gridCols} first={idx === 0} title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
                ))}
              </div>
            );
          })() : (
            <div className="lib-empty"><p>No purchases yet.</p><p style={{fontSize:'0.8rem',color:'var(--text-dim)'}}>Connect Bandcamp or Discogs in Settings to see your collection.</p></div>
          )}
        </>
      )}

      {/* Wishlist */}
      {activeFilter === 'wishlist' && (
        <>
          {(bcWishAlbums.length > 0 || bcWishTracks.length > 0 || dgWishlist.length > 0) ? (() => {
            const wishSectionsByProvider = {
              discogs:  [{ key: 'dg-wish-w', title: 'Discogs · Wishlist',  items: dgWishlist }],
              bandcamp: [{ key: 'bc-wish-w', title: 'Bandcamp · Wishlist', items: acct.bandcamp.wishlist }],
            };
            const orderedWishSections = providerPriority
              .flatMap(p => wishSectionsByProvider[p] || [])
              .filter(s => s.items && s.items.length > 0);
            return (
              <div>
                {orderedWishSections.map((s, idx) => (
                  <AcctSection key={s.key} view={layoutMode} cols={gridCols} first={idx === 0} title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
                ))}
              </div>
            );
          })() : (
            <div className="lib-empty"><p>Your wishlist is empty.</p><p style={{fontSize:'0.8rem',color:'var(--text-dim)'}}>Connect Bandcamp or Discogs in Settings to see your wishlist.</p></div>
          )}
        </>
      )}

      {/* Likes → Playlists */}
      {activeFilter === 'likes' && likesSub === 'playlists' && (
        savedPlaylists.length === 0
          ? <div className="lib-empty"><p>No liked playlists yet.</p></div>
          : <>
              <div className="shelf-row-label">Liked Playlists</div>
              {layoutMode === 'list' ? (
                <div>
                  {savedPlaylists.map(pl => (
                    <LibRow
                      key={pl.id}
                      cover={pl.cover}
                      title={pl.title}
                      sub={pl.curator}
                      onClick={() => openPlaylistSheet(pl)}
                    />
                  ))}
                </div>
              ) : (
                <div className="scroll-row">
                  {savedPlaylists.map(pl => (
                    <div key={pl.id} onClick={() => openPlaylistSheet(pl)} style={{ cursor: 'pointer' }}>
                      <ShelfCard cover={pl.cover} title={pl.title} sub={pl.curator} badge={pl.isAI?'AI':null}/>
                    </div>
                  ))}
                </div>
              )}
            </>
      )}

      {/* My Playlists */}
      {activeFilter === 'playlists' && (
        <>
          <div className="shelf-row-label">My Playlists</div>
          {playlists.length === 0
            ? <div className="lib-empty"><p>No playlists yet.</p></div>
            : layoutMode === 'list' ? (
              <div>
                {playlists.map(pl => (
                  <LibRow
                    key={pl.id}
                    cover={pl.cover}
                    title={pl.title}
                    sub={`${pl.tracks?.length||0} tracks`}
                    onClick={() => openPlaylistSheet(pl)}
                  />
                ))}
              </div>
            ) : (
              <div className="scroll-row">
                {playlists.map(pl => (
                  <div key={pl.id} onClick={() => openPlaylistSheet(pl)} style={{ cursor: 'pointer' }}>
                    <ShelfCard cover={pl.cover} title={pl.title} sub={`${pl.tracks?.length||0} tracks`} badge={pl.isAI?'AI':null}/>
                  </div>
                ))}
              </div>
            )
          }
        </>
      )}

      {/* Playlists → connected accounts ordered by providerPriority */}
      {activeFilter === 'playlists' && (() => {
        const plByProvider = {
          bandcamp:   { key: 'bc-pl', title: 'Bandcamp · Playlists',    items: bcPlaylists },
          soundcloud: { key: 'sc-pl', title: 'SoundCloud · Playlists',  items: scPlaylists },
          youtube:    { key: 'yt-pl', title: 'YouTube · Playlists',     items: ytPlaylists },
          spotify:    { key: 'sp-pl', title: 'Spotify · Playlists',     items: spPlaylists },
          applemusic: { key: 'am-pl', title: 'Apple Music · Playlists', items: amPlaylists },
          tidal:      { key: 'td-pl', title: 'TIDAL · Playlists',       items: tdPlaylists },
        };
        const orderedPl = providerPriority
          .map(p => plByProvider[p])
          .filter(s => s && s.items && s.items.length > 0);
        return orderedPl.map(s => (
          <div key={s.key} style={{ marginTop: 18 }}>
            <AcctSection view={layoutMode} cols={gridCols} first title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
          </div>
        ));
      })()}

      {/* Follows */}
      {activeFilter === 'follows' && (
        (followedArtists?.length > 0 || bcFollows.length > 0 || scFollows.length > 0 || ytFollows.length > 0 || spFollows.length > 0 || amFollows.length > 0 || tdFollows.length > 0)
          ? <>
              {followedArtists?.length > 0 && (
                <>
                  <div className="shelf-row-label">Artists</div>
                  {layoutMode === 'list' ? (
                    <div>
                      {followedArtists.map(a => (
                        <LibRow key={a.id} cover={a.avatar||a.cover||''} title={a.name} sub={a.genre||''} round showPlay={false} />
                      ))}
                    </div>
                  ) : (
                    <div className="scroll-row">
                      {followedArtists.map(a => (
                        <ShelfCard key={a.id} cover={a.avatar||a.cover||''} title={a.name} sub={a.genre||''}/>
                      ))}
                    </div>
                  )}
                </>
              )}
              {(() => {
                const followsByProvider = {
                  bandcamp:   { key: 'bc-fol', title: 'Bandcamp · Following',        items: bcFollows },
                  soundcloud: { key: 'sc-fol', title: 'SoundCloud · Following',      items: scFollows },
                  youtube:    { key: 'yt-fol', title: 'YouTube · Followed Artists',  items: ytFollows },
                  spotify:    { key: 'sp-fol', title: 'Spotify · Followed Artists',  items: spFollows },
                  applemusic: { key: 'am-fol', title: 'Apple Music · Artists',       items: amFollows },
                  tidal:      { key: 'td-fol', title: 'TIDAL · Followed Artists',    items: tdFollows },
                };
                const orderedFollows = providerPriority
                  .map(p => followsByProvider[p])
                  .filter(s => s && s.items && s.items.length > 0);
                return orderedFollows.map(s => (
                  <div key={s.key} style={{ marginTop: 18 }}>
                    <AcctSection view={layoutMode} cols={gridCols} first title={s.title} items={s.items} onOpenPlaylist={openPlaylistSheet} />
                  </div>
                ));
              })()}
            </>
          : <div className="lib-empty"><p>Artists you follow will appear here.</p><Link to="/search" className="lib-empty-link">Find artists →</Link></div>
      )}

      {/* Shared */}
      {activeFilter === 'shared' && (
        <div className="lib-empty"><p>No shared items yet.</p><p style={{fontSize:'0.8rem',color:'var(--text-dim)'}}>Music shared with you will appear here.</p></div>
      )}

      {/* My Uploads */}
      {activeFilter === 'uploads' && (
        myUploads.length === 0
          ? <div className="lib-empty"><p>No uploads yet.</p><Link to="/uploads" className="lib-empty-link">Upload your first track →</Link></div>
          : <>
              <div className="shelf-row-label" style={{display:'flex',alignItems:'center',gap:5}}><Lock size={11}/> My Uploads</div>
              {layoutMode === 'list'
                ? <UploadExpandedList uploads={myUploads}/>
                : <UploadGridView uploads={myUploads} cols={libraryLayout.cols}/>
              }
            </>
      )}

      {/* Events */}
      {activeFilter === 'events' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="shelf-row-label" style={{display: 'flex', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)'}}>
            {['All', 'This Week', 'This Month'].map(f => (
              <button 
                key={f}
                onClick={() => setEventsFilter(f)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  background: eventsFilter === f ? 'var(--text-primary)' : 'var(--glass-bg)',
                  color: eventsFilter === f ? 'var(--bg-primary)' : 'var(--text-primary)',
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {berghainEvents.filter(e => {
              if (eventsFilter === 'All') return true;
              const [d, m, y] = e.date.split('.');
              const eventDate = new Date(`${y}-${m}-${d}`);
              const now = new Date();
              now.setHours(0,0,0,0);
              if (eventsFilter === 'This Week') {
                const diffTime = eventDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= 7;
              }
              if (eventsFilter === 'This Month') {
                return eventDate.getMonth() === now.getMonth() && eventDate.getFullYear() === now.getFullYear();
              }
              return true;
            }).map((e) => (
              <BerghainEventCard key={e.id} event={e} onClick={() => setSelectedEventIndex(berghainEvents.indexOf(e))} />
            ))}
          </div>
        </div>
      )}

      {/* Album sheet */}
      {selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box glass" onClick={e => e.stopPropagation()}>
            <h3>New Playlist</h3>
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
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
