import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PlayerProvider, usePlayer, trackIdentity } from './contexts/PlayerContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DisplayProvider } from './contexts/DisplayContext';
import { useTheme } from './hooks/useTheme';

// Nav
import Sidebar from './components/nav/Sidebar';
import CreatorSidebar from './components/nav/CreatorSidebar';
import BottomDock from './components/nav/BottomDock';
import TopBar from './components/nav/TopBar';
import Player from './components/player/Player';
import SuccessToast from './components/ui/SuccessToast';


// Auth screens
import EntryScreen    from './pages/auth/EntryScreen';
import SplashScreen   from './pages/auth/SplashScreen';
import ResetPassword  from './pages/auth/ResetPassword';

// Listener pages
import Home, { preloadHomeContent } from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import AllReleases from './pages/AllReleases';
import Shop from './pages/Shop';
import Marketplace from './pages/Marketplace';
import Profile from './pages/Profile';
import ReleasePage from './pages/ReleasePage';
import ArtistPage from './pages/ArtistPage';
import CanonicalArtistPage from './pages/CanonicalArtistPage';
import CanonicalReleasePage from './pages/CanonicalReleasePage';
import CanonicalLabelPage from './pages/CanonicalLabelPage';
import Subscription from './pages/Subscription';
import AccountLibrary from './pages/AccountLibrary';
import ListenerSettings from './pages/ListenerSettings';
import Account      from './pages/Account';
import UserUploads  from './pages/UserUploads';
import AppSettings  from './pages/AppSettings';
import Orders        from './pages/Orders';
import Downloads     from './pages/Downloads';
import Messages      from './pages/Messages';
import Events        from './pages/Events';
import MyReleases    from './pages/MyReleases';

import Dashboard     from './pages/Dashboard';
import Upload        from './pages/Upload';
import Releases      from './pages/Releases';
import Settings      from './pages/Settings';
import CreatorArtists from './pages/CreatorArtists';
import VisualIdentity from './pages/VisualIdentity';
import ListenerPreview from './pages/ListenerPreview';

// Admin
import AdminApp from './pages/admin/AdminApp';

import './index.css';

if (typeof window !== 'undefined') {
  preloadHomeContent();
}

// ─── Route reporter ────────────────────────────────────────
// Registers window.__kyoyuGo so the native iOS tab bar can
// drive React Router navigation from Swift. Must live INSIDE
// each app shell so it uses the correct <Routes> navigate context.
function RouteReporter() {
  const location = useLocation();
  const navigate  = useNavigate();

  useEffect(() => {
    window.__kyoyuGo = (path) => navigate(path);
    return () => { delete window.__kyoyuGo; };
  }, [navigate]);

  useEffect(() => {
    try { window.webkit?.messageHandlers?.route?.postMessage(location.pathname); } catch (_) {}
  }, [location.pathname]);

  // Fallback: listen for kyoyu-navigate CustomEvent (race-condition safety)
  useEffect(() => {
    const handler = (e) => {
      const path = e.detail;
      if (path && typeof path === 'string') navigate(path);
    };
    window.addEventListener('kyoyu-navigate', handler);
    return () => window.removeEventListener('kyoyu-navigate', handler);
  }, [navigate]);

  return null;
}

const PROFILE_ROUTES = new Set(['/profile','/account','/uploads','/app-settings','/downloads','/orders','/subscription','/settings']);

// ─── Route Wrappers ───────────────────────────────────────
function ArtistRoute() {
  const { id } = useParams();
  const isCanonical = id?.startsWith('discogs-');
  const hasShareParams = typeof window !== 'undefined' && (window.location.search.includes('share=') || window.location.search.includes('name='));
  if (hasShareParams) return <Home />;
  return isCanonical ? <CanonicalArtistPage /> : <ArtistPage />;
}

function ReleaseRoute() {
  const { id } = useParams();
  const isCanonical = id?.startsWith('discogs-');
  const hasShareParams = typeof window !== 'undefined' && (window.location.search.includes('share=') || window.location.search.includes('album='));
  if (hasShareParams) return <Home />;
  return isCanonical ? <CanonicalReleasePage /> : <ReleasePage />;
}

function LabelRoute() {
  const { id } = useParams();
  const isCanonical = id?.startsWith('discogs-');
  const hasShareParams = typeof window !== 'undefined' && (window.location.search.includes('share=') || window.location.search.includes('name='));
  if (hasShareParams) return <Home />;
  return isCanonical ? <CanonicalLabelPage /> : <ArtistPage />;
}

// ─── Listener shell ────────────────────────────────────────
function ListenerApp() {
  const { state } = usePlayer();
  const hasTrack = !!state.currentTrack;
  const location = useLocation();
  const { pathname } = location;
  const isProfileSheetRoute = PROFILE_ROUTES.has(pathname);
  const lastMainLocationRef = React.useRef(
    isProfileSheetRoute ? { pathname: window.__kyoyuLastMainRoute || '/', search: '', hash: '', state: null, key: 'main-bg' } : location
  );
  if (!isProfileSheetRoute) {
    lastMainLocationRef.current = location;
    window.__kyoyuLastMainRoute = pathname;
  }

  const hideSidebar = pathname.startsWith('/release/')
    || pathname.startsWith('/artist/')
    || pathname.startsWith('/label/');

  const renderProfileSheetPage = () => {
    switch (pathname) {
      case '/profile':      return <Profile />;
      case '/account':      return <Account />;
      case '/uploads':      return <UserUploads />;
      case '/app-settings': return <AppSettings />;
      case '/downloads':    return <Downloads />;
      case '/orders':       return <Orders />;
      case '/subscription': return <Subscription />;
      case '/settings':     return <ListenerSettings />;
      default:              return <Profile />;
    }
  };

  return (
    <div className="app-layout">
      {!hideSidebar && <Sidebar />}
      <TopBar />
      <div
        className="main-content"
        style={{ paddingTop:'var(--page-top)', paddingBottom: 'calc(var(--kyoyu-tab-h, 83px) + 8px)' }}
      >
        {/* RouteReporter inside ListenerApp so navigate() uses this Routes context */}
        <RouteReporter />
        <Routes location={isProfileSheetRoute ? lastMainLocationRef.current : location}>
          <Route path="/"               element={<Home />} />
          <Route path="/search"         element={<Search />} />
          <Route path="/all-releases"   element={<AllReleases />} />
          <Route path="/library"        element={<Library />} />
          <Route path="/shop"           element={<Shop />} />
          <Route path="/marketplace"    element={<Marketplace />} />
          <Route path="/marketplace/:id" element={<Marketplace />} />
          <Route path="/track/:id"      element={<Home />} />
          <Route path="/album/:id"      element={<Home />} />
          <Route path="/release/:id"    element={<ReleaseRoute />} />
          <Route path="/artist/:id"     element={<ArtistRoute />} />
          <Route path="/label/:id"      element={<LabelRoute />} />
          <Route path="/accounts/:service" element={<AccountLibrary />} />
          <Route path="/my-releases"      element={<MyReleases />} />
          <Route path="/messages"        element={<Messages />} />
          <Route path="/events"          element={<Events />} />
          <Route path="*"               element={<Home />} />
        </Routes>
      </div>
      {isProfileSheetRoute && (
        <div className="liquid-glass-settings-sheet-overlay">
          {renderProfileSheetPage()}
        </div>
      )}
      {/* BottomDock owns the mini player + nav pill (swipeable, one at a time) */}
      <BottomDock onExpandPlayer={() => window.__kyoyuPlayerCmd?.('expand')} />
      {/* Full-screen Player — mini bar suppressed; BottomDock shows it instead */}
      <Player hideMini />
    </div>
  );
}

// ─── Creator shell ─────────────────────────────────────────
function CreatorApp() {
  return (
    <div className="app-layout">
      <CreatorSidebar />
      <TopBar showSearch={true} />
      <div className="main-content" style={{ paddingBottom: '32px' }}>
        {/* RouteReporter inside CreatorApp so iOS tab bar works for creators too */}
        <RouteReporter />
        <Routes>
          {/* ── Creator routes ── */}
          <Route path="/dashboard"        element={<Dashboard />} />
          <Route path="/upload"           element={<Upload />} />
          <Route path="/releases"         element={<Releases filter="all"     />} />
          <Route path="/releases/public"  element={<Releases filter="public"  />} />
          <Route path="/releases/private" element={<Releases filter="private" />} />
          <Route path="/artists"          element={<CreatorArtists />} />
          <Route path="/visual-identity"  element={<VisualIdentity />} />
          <Route path="/preview"          element={<ListenerPreview />} />
          <Route path="/profile"          element={<Profile />} />
          <Route path="/settings"         element={<Settings />} />
          <Route path="/app-settings"     element={<AppSettings />} />
          <Route path="/subscription"     element={<Subscription />} />
          <Route path="/accounts/:service" element={<AccountLibrary />} />

          {/* ── Listener tab-bar routes — so iOS tab bar works for creator accounts ── */}
          <Route path="/"                 element={<Home />} />
          <Route path="/search"           element={<Search />} />
          <Route path="/library"          element={<Library />} />
          <Route path="/shop"             element={<Shop />} />
          <Route path="/marketplace"      element={<Marketplace />} />
          <Route path="/marketplace/:id"  element={<Marketplace />} />
          <Route path="/messages"         element={<Messages />} />
          <Route path="/events"           element={<Events />} />
          <Route path="/track/:id"        element={<Home />} />
          <Route path="/album/:id"        element={<Home />} />
          <Route path="/release/:id"      element={<ReleaseRoute />} />
          <Route path="/artist/:id"       element={<ArtistRoute />} />
          <Route path="/label/:id"        element={<LabelRoute />} />

          {/* ── Fallback ── */}
          <Route path="*"                 element={<Dashboard />} />
        </Routes>
      </div>
    </div>
  );
}

// ─── Role gate ─────────────────────────────────────────────
function RoleGate() {
  const { role, loading } = useAuth();
  useTheme();

  useEffect(() => {
    preloadHomeContent();
  }, []);

  // Report role to native iOS bridge so Swift can configure the correct tab bar
  useEffect(() => {
    if (role) {
      try { window.webkit?.messageHandlers?.userRole?.postMessage(role); } catch (_) {}
    }
  }, [role]);

  if (loading && !role) return <div className="auth-loading" />;
  if (!role)            return <EntryScreen />;
  return (
    <>
      <SuccessToast />
      {role === 'admin'    && <AdminApp />}
      {role === 'listener' && <ListenerApp />}
      {role === 'creator'  && <CreatorApp />}
      {!['admin','listener','creator'].includes(role) && <EntryScreen />}
    </>
  );
}

// ─── Hash Redirector ───────────────────────────────────────
function HashRedirector() {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const isAuthHash = hash.includes('error=') ||
                       (hash.includes('access_token=') && hash.includes('type=recovery'));
    if (isAuthHash && window.location.pathname !== '/auth/reset') {
      navigate('/auth/reset' + hash, { replace: true });
    }
  }, [navigate]);
  return null;
}

// ─── Playlist Bridge ────────────────────────────────────────
// Registers global playlist JS handlers using both PlayerContext and LibraryContext.
// Lives inside both providers so it always has access to both contexts.
import { useLibrary } from './contexts/LibraryContext';
import { syncProviderLike } from './lib/streaming';
import { isItemInConnectedLikes } from './lib/useConnectedLibrary';
import { openNativePlaylistFast } from './components/ui/AlbumSheet';

function PlaylistBridge() {
  const { state, playSaved } = usePlayer();
  const {
    getPlaylists, addToPlaylist, createPlaylist, updatePlaylistCover,
    deletePlaylist, removeFromPlaylist, reorderPlaylist, togglePlaylistPublic,
    toggleLikeUpload,
  } = useLibrary();
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const playSavedRef = React.useRef(playSaved);
  playSavedRef.current = playSaved;
  const addRef = React.useRef(addToPlaylist);
  addRef.current = addToPlaylist;
  const getRef = React.useRef(getPlaylists);
  getRef.current = getPlaylists;
  const createRef = React.useRef(createPlaylist);
  createRef.current = createPlaylist;
  const updateCoverRef = React.useRef(updatePlaylistCover);
  updateCoverRef.current = updatePlaylistCover;
  const deleteRef = React.useRef(deletePlaylist);
  deleteRef.current = deletePlaylist;
  const removeRef = React.useRef(removeFromPlaylist);
  removeRef.current = removeFromPlaylist;
  const reorderRef = React.useRef(reorderPlaylist);
  reorderRef.current = reorderPlaylist;
  const togglePublicRef = React.useRef(togglePlaylistPublic);
  togglePublicRef.current = togglePlaylistPublic;
  const toggleLikeRef = React.useRef(toggleLikeUpload);
  toggleLikeRef.current = toggleLikeUpload;

  useEffect(() => {
    try {
      if (window.__kyoyuSharedLinkHandled) return;
      const pathname = window.location.pathname || '';
      const params = new URLSearchParams(window.location.search || '');
      const shareType = (params.get('share') || '').toLowerCase();
      const idParam = params.get('id') || '';
      const nameParam = params.get('name') || '';
      const trackParam = params.get('track') || '';
      const titleParam = params.get('title') || '';
      const artistParam = params.get('artist') || '';
      const albumParam = params.get('album') || '';
      const labelParam = params.get('label') || '';
      const providerParam = params.get('provider') || '';
      const srcParam = params.get('src') || '';

      const slugMatch = pathname.match(/^\/(track|album|artist|label)\/([^/?#]+)/i);
      const pathEntity = slugMatch ? slugMatch[1].toLowerCase() : '';
      const pathSlug = slugMatch ? decodeURIComponent(slugMatch[2]).replace(/-/g, ' ').trim() : '';

      if (shareType === 'artist' || (pathEntity === 'artist' && (nameParam || artistParam))) {
        window.__kyoyuSharedLinkHandled = true;
        const targetArtist = nameParam || artistParam || pathSlug;
        if (targetArtist) {
          setTimeout(() => {
            window.__kyoyuOpenArtist?.({ id: idParam || undefined, name: targetArtist });
          }, 400);
        }
        return;
      }

      if (shareType === 'label' || (pathEntity === 'label' && (nameParam || labelParam))) {
        window.__kyoyuSharedLinkHandled = true;
        const targetLabel = nameParam || labelParam || pathSlug;
        if (targetLabel) {
          setTimeout(() => {
            window.__kyoyuOpenLabel?.({ id: idParam || undefined, name: targetLabel });
          }, 400);
        }
        return;
      }

      if (shareType === 'album' || pathEntity === 'album' || (albumParam && !titleParam && !trackParam)) {
        window.__kyoyuSharedLinkHandled = true;
        const targetAlbum = albumParam || titleParam || pathSlug;
        const targetArtist = artistParam || '';
        if (targetAlbum || targetArtist) {
          setTimeout(() => {
            window.__kyoyuGoToAlbum?.(targetArtist, targetAlbum, {
              url: /^https?:\/\//i.test(srcParam || idParam) ? (srcParam || idParam) : undefined,
            });
          }, 400);
        }
        return;
      }

      if (shareType === 'track' || pathEntity === 'track' || trackParam || (titleParam && artistParam)) {
        window.__kyoyuSharedLinkHandled = true;
        setTimeout(() => {
          playSavedRef.current?.({
            id: trackParam || idParam || `shared-${Date.now()}`,
            title: titleParam || pathSlug || 'Track',
            artist: artistParam || '',
            artistName: artistParam || '',
            album: albumParam || '',
            provider: providerParam || '',
            trackUrl: srcParam || '',
            url: srcParam || '',
          });
        }, 350);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const cleanId = (id) => String(id || '').split('?ts=')[0].trim();

    const decodeTracksPayload = (payload) => {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (typeof payload !== 'string') return [];
      const trimmed = payload.trim();
      if (!trimmed) return [];
      try {
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (e) {}
      try {
        const bytes = Uint8Array.from(atob(trimmed), c => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [];
      }
    };

    const resolveTrackForPlaylist = (rawTrackOrId) => {
      const rawObj = (rawTrackOrId && typeof rawTrackOrId === 'object') ? rawTrackOrId : null;
      const targetId = cleanId(rawObj ? rawObj.id : rawTrackOrId);
      const cur = stateRef.current?.currentTrack;
      const curAlbum = window.__kyoyuCurrentNativeAlbum;
      const queue = stateRef.current?.queue || [];

      const fromAlbum = targetId
        ? (curAlbum?.tracks || []).find(tr => cleanId(tr.id) === targetId)
        : null;
      const fromQueue = targetId
        ? queue.find(tr => cleanId(tr.id) === targetId)
        : null;
      const fromCur = (cur && (!targetId || cleanId(cur.id) === targetId)) ? cur : null;

      const merged = {
        ...(fromAlbum || {}),
        ...(fromQueue || {}),
        ...(fromCur || {}),
        ...(rawObj || {}),
      };

      const finalId = targetId || cleanId(merged.id) || cleanId(cur?.id);
      if (!finalId) return null;

      const src = merged.src || merged.audioUrl || merged.streamUrl || merged.url || merged.trackUrl || '';
      const cover = (merged.cover && merged.cover !== '/album1.png' ? merged.cover : '')
        || merged.artworkUrl
        || merged.releaseCover
        || (curAlbum?.cover && curAlbum.cover !== '/album1.png' ? curAlbum.cover : '')
        || curAlbum?.artworkUrl
        || merged.cover
        || '';

      const baseTrack = {
        ...merged,
        id: finalId,
        title: merged.title || merged.name || cur?.title || 'Unknown Track',
        artist: merged.artist || merged.artistName || curAlbum?.artist || cur?.artist || '',
        album: merged.album || merged.releaseTitle || merged.albumTitle || curAlbum?.title || cur?.album || '',
        cover,
        artworkUrl: merged.artworkUrl || cover,
        releaseCover: merged.releaseCover || cover,
        url: merged.url || merged.trackUrl || src,
        audioUrl: merged.audioUrl || src,
        trackUrl: merged.trackUrl || merged.url || '',
        provider: (merged.provider || curAlbum?.provider) === 'discogs'
          ? ''
          : (merged.provider || curAlbum?.provider || cur?.provider || ''),
      };

      const identitySource = (fromCur && (fromCur.src || fromCur.provider === 'youtube'))
        ? fromCur
        : { ...baseTrack, src: src || baseTrack.url };

      return {
        ...baseTrack,
        ...trackIdentity(identitySource),
      };
    };

    const syncOpenNativePlaylistIfMatching = (playlistId) => {
      try {
        const curAlbum = window.__kyoyuCurrentNativeAlbum;
        if (curAlbum && String(curAlbum.id) === String(playlistId)) {
          const updatedPl = getRef.current().find(p => String(p.id) === String(playlistId));
          if (updatedPl) {
            openNativePlaylistFast(updatedPl, { isUpdate: true });
          }
        }
      } catch (e) {}
    };

    const handleFallbackNativeLike = (e) => {
      if (e.detail.handled) return;
      const trackId = cleanId(e.detail.trackId);
      const curAlbum = window.__kyoyuCurrentNativeAlbum;
      const t = (curAlbum?.tracks || []).find(tr => cleanId(tr.id) === trackId);
      if (!t) return;
      e.detail.handled = true;
      const trackObj = {
        ...t,
        artist: t.artist || curAlbum?.artist || '',
        cover: curAlbum?.cover || curAlbum?.artworkUrl || t.cover || '',
        album: curAlbum?.title || '',
        albumId: curAlbum?.id || '',
        albumProvider: curAlbum?.provider || '',
        trackUrl: t.trackUrl || curAlbum?.trackUrl || curAlbum?.url || '',
        ...trackIdentity({ ...t, src: t.src || t.url || t.streamUrl || t.audioUrl || '' }),
      };
      try {
        toggleLikeRef.current(trackObj, {
          skipProviderSync: !!e.detail.skipProviderSync,
          forceLiked: e.detail.forceLiked,
        });
      } catch (err) {}
    };
    window.addEventListener('kyoyu-native-like', handleFallbackNativeLike);

    // Always-available playlist handlers
    window.__kyoyuIsTrackInAnyPlaylist = (trackId) => {
      const ids = String(trackId || '').split(',').map(cleanId).filter(Boolean);
      if (!ids.length) return false;
      const pls = getRef.current();
      return pls.some(pl =>
        ids.every(id => (pl.tracks || []).some(t => cleanId(t.id) === id))
      );
    };

    window.__kyoyuGetPlaylists = (trackId) => {
      const ids = String(trackId || '').split(',').map(cleanId).filter(Boolean);
      const pls = getRef.current().map(pl => {
        const tracks = pl.tracks || [];
        const containsTrack = ids.length > 0 && ids.every(id => tracks.some(t => cleanId(t.id) === id));
        return {
          id: pl.id,
          name: pl.name || pl.title || 'Untitled',
          trackCount: tracks.length,
          containsTrack,
        };
      });
      return JSON.stringify(pls);
    };

    window.__kyoyuAddToPlaylist = (playlistId, trackId) => {
      const ids = String(trackId || '').split(',').map(cleanId).filter(Boolean);
      if (ids.length > 0) {
        for (const id of ids) {
          const trackObj = resolveTrackForPlaylist(id);
          if (trackObj) addRef.current(playlistId, trackObj);
        }
      } else {
        const trackObj = resolveTrackForPlaylist(null);
        if (trackObj) addRef.current(playlistId, trackObj);
      }
      syncOpenNativePlaylistIfMatching(playlistId);
      return window.__kyoyuGetPlaylists(trackId);
    };

    window.__kyoyuAddTracksToPlaylist = (playlistId, tracksJsonOrB64, fallbackTrackId) => {
      try {
        const tracks = decodeTracksPayload(tracksJsonOrB64);
        if (tracks.length > 0) {
          for (const t of tracks) {
            const resolved = resolveTrackForPlaylist(t);
            if (resolved) addRef.current(playlistId, resolved);
          }
          syncOpenNativePlaylistIfMatching(playlistId);
          const checkIds = fallbackTrackId || tracks.map(t => cleanId(t?.id)).filter(Boolean).join(',');
          return window.__kyoyuGetPlaylists(checkIds);
        }
      } catch (e) {
        console.error('[PlaylistBridge] __kyoyuAddTracksToPlaylist error:', e);
      }
      return window.__kyoyuAddToPlaylist(playlistId, fallbackTrackId);
    };

    window.__kyoyuCreatePlaylist = (name, providers = []) => {
      const pl = createRef.current(name, providers);
      return JSON.stringify({ id: pl.id, name: pl.title || pl.name, trackCount: 0, containsTrack: false, providers: pl.providers || [] });
    };

    window.__kyoyuUpdatePlaylistCover = (playlistId, coverDataUrl) => {
      updateCoverRef.current(playlistId, coverDataUrl || null);
      syncOpenNativePlaylistIfMatching(playlistId);
    };

    window.__kyoyuDeletePlaylist = (playlistId) => {
      deleteRef.current(playlistId);
    };

    window.__kyoyuRemoveFromPlaylist = (playlistId, trackId) => {
      removeRef.current(playlistId, trackId);
      syncOpenNativePlaylistIfMatching(playlistId);
    };

    window.__kyoyuReorderPlaylist = (playlistId, fromIndex, toIndex) => {
      reorderRef.current(playlistId, fromIndex, toIndex);
      syncOpenNativePlaylistIfMatching(playlistId);
    };

    window.__kyoyuTogglePlaylistPublic = (playlistId) => {
      togglePublicRef.current(playlistId);
      syncOpenNativePlaylistIfMatching(playlistId);
    };

    window.__kyoyuGetPlaylistPublic = (playlistId) => {
      const pl = getRef.current().find(p => String(p.id) === String(playlistId));
      return Boolean(pl?.isPublic);
    };

    window.__kyoyuToggleSaveTracks = (tracksJson, albumId, albumTitle, albumArtist, albumProvider) => {
      try {
        const tracks = decodeTracksPayload(tracksJson);
        if (!tracks.length) return;
        let saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
        const curAlbum = window.__kyoyuCurrentNativeAlbum;
        const aid = albumId || curAlbum?.id || '';
        
        // Is the album (or all its tracks) already saved?
        const isSaved = window.__kyoyuIsSavedAlbum(tracksJson, aid);
        const nextLiked = !isSaved;
        
        for (const t of tracks) {
            try {
              window.dispatchEvent(new CustomEvent('kyoyu-native-like', {
                detail: { trackId: t.id, handled: false, skipProviderSync: true, forceLiked: nextLiked }
              }));
            } catch(e){}
            
            if (!nextLiked) {
                saved = saved.filter(x => String(x.id) !== String(t.id));
            } else {
                if (!saved.some(x => String(x.id) === String(t.id))) {
                    saved.push(t);
                }
            }
        }
        localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(saved));

        // Perform a single album-level provider sync
        try {
          syncProviderLike({
            id: aid || tracks[0]?.id || '',
            albumId: aid,
            kind: 'album',
            provider: albumProvider || curAlbum?.provider || tracks[0]?.provider || '',
            title: albumTitle || curAlbum?.title || '',
            artist: albumArtist || curAlbum?.artist || tracks[0]?.artist || '',
            album: albumTitle || curAlbum?.title || '',
            cover: curAlbum?.cover || curAlbum?.artworkUrl || tracks[0]?.cover || '',
            trackUrl: curAlbum?.trackUrl || curAlbum?.url || tracks[0]?.trackUrl || tracks[0]?.url || '',
            url: curAlbum?.url || curAlbum?.trackUrl || tracks[0]?.url || '',
          }, nextLiked);
        } catch (e) {}
      } catch(e) { console.error(e); }
    };
    
    window.__kyoyuIsSavedAlbum = (tracksJson, albumId) => {
      try {
        const curAlbum = window.__kyoyuCurrentNativeAlbum;
        const aid = albumId || curAlbum?.id || '';
        if (aid && isItemInConnectedLikes({ id: aid, trackUrl: curAlbum?.trackUrl || curAlbum?.url || '' })) {
          return true;
        }
        const tracks = tracksJson ? decodeTracksPayload(tracksJson) : (curAlbum?.tracks || []);
        if (!tracks.length) return false;
        let saved = JSON.parse(localStorage.getItem('kyoyu-liked-uploads') || '[]');
        return tracks.every(t => saved.some(x => String(x.id) === String(t.id)));
      } catch(e) { return false; }
    };

    return () => {
      window.removeEventListener('kyoyu-native-like', handleFallbackNativeLike);
    };
  }, []);

  return null;
}

// ─── Root ──────────────────────────────────────────────────
export default function App() {
  const [splash, setSplash] = useState(false);
  function handleSplashDone() { setSplash(false); }

  return (
    <BrowserRouter>
      <HashRedirector />
      <AuthProvider>
        <PlayerProvider>
          <LibraryProvider>
              <PlaylistBridge />
            <DisplayProvider>
              <Routes>
                <Route path="/auth/reset" element={<ResetPassword />} />
                <Route path="*" element={
                  splash ? <SplashScreen onDone={handleSplashDone} /> : <RoleGate />
                } />
              </Routes>
            </DisplayProvider>
          </LibraryProvider>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
