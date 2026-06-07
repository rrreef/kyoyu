import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PlayerProvider, usePlayer } from './contexts/PlayerContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DisplayProvider } from './contexts/DisplayContext';
import { useTheme } from './hooks/useTheme';

// Nav
import Sidebar from './components/nav/Sidebar';
import CreatorSidebar from './components/nav/CreatorSidebar';
import MobileNav from './components/nav/MobileNav';
import TopBar from './components/nav/TopBar';
import Player from './components/player/Player';
import SuccessToast from './components/ui/SuccessToast';

// Auth screens
import EntryScreen    from './pages/auth/EntryScreen';
import SplashScreen   from './pages/auth/SplashScreen';
import ResetPassword  from './pages/auth/ResetPassword';

// Listener pages
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import Shop from './pages/Shop';
import Marketplace from './pages/Marketplace';
import Profile from './pages/Profile';
import ReleasePage from './pages/ReleasePage';
import ArtistPage from './pages/ArtistPage';
import Subscription from './pages/Subscription';
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

// ─── Listener shell ────────────────────────────────────────
function ListenerApp() {
  const { state } = usePlayer();
  const hasTrack = !!state.currentTrack;
  const { pathname } = useLocation();
  const hideSidebar = PROFILE_ROUTES.has(pathname)
    || pathname.startsWith('/release/')
    || pathname.startsWith('/artist/')
    || pathname.startsWith('/label/');

  return (
    <div className="app-layout">
      {!hideSidebar && <Sidebar />}
      <TopBar />
      <div
        className="main-content"
        style={{ paddingTop:'var(--page-top)', paddingBottom: hasTrack ? 'calc(var(--kyoyu-tab-h, 83px) + 62px)' : 'calc(var(--kyoyu-tab-h, 83px) + 8px)' }}
      >
        {/* RouteReporter inside ListenerApp so navigate() uses this Routes context */}
        <RouteReporter />
        <Routes>
          <Route path="/"               element={<Home />} />
          <Route path="/search"         element={<Search />} />
          <Route path="/library"        element={<Library />} />
          <Route path="/shop"           element={<Shop />} />
          <Route path="/marketplace"    element={<Marketplace />} />
          <Route path="/marketplace/:id" element={<Marketplace />} />
          <Route path="/profile"        element={<Profile />} />
          <Route path="/release/:id"    element={<ReleasePage />} />
          <Route path="/artist/:id"     element={<ArtistPage />} />
          <Route path="/label/:id"      element={<ArtistPage />} />
          <Route path="/subscription"   element={<Subscription />} />
          <Route path="/settings"        element={<ListenerSettings />} />
          <Route path="/orders"          element={<Orders />} />
          <Route path="/downloads"       element={<Downloads />} />
          <Route path="/account"         element={<Account />} />
          <Route path="/uploads"         element={<UserUploads />} />
          <Route path="/my-releases"      element={<MyReleases />} />
          <Route path="/app-settings"    element={<AppSettings />} />
          <Route path="/messages"        element={<Messages />} />
          <Route path="/events"          element={<Events />} />
          <Route path="*"               element={<Home />} />
        </Routes>
      </div>
      <MobileNav />
      <Player />
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

          {/* ── Listener tab-bar routes — so iOS tab bar works for creator accounts ── */}
          <Route path="/"                 element={<Home />} />
          <Route path="/search"           element={<Search />} />
          <Route path="/library"          element={<Library />} />
          <Route path="/shop"             element={<Shop />} />
          <Route path="/marketplace"      element={<Marketplace />} />
          <Route path="/marketplace/:id"  element={<Marketplace />} />
          <Route path="/messages"         element={<Messages />} />
          <Route path="/events"           element={<Events />} />
          <Route path="/release/:id"      element={<ReleasePage />} />
          <Route path="/artist/:id"       element={<ArtistPage />} />

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
