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

// ─── Listener shell ───────────────────────────────────────

// ─── Route reporter: tells native Swift bridge the current path ───────────────
// Also exposes window.__kyoyuGo so the Swift WKUserScript can drive React Router directly
function RouteReporter() {
  const location = useLocation();
  const navigate  = useNavigate();

  // Expose React Router's navigate globally — Swift's injected script calls this
  useEffect(() => {
    window.__kyoyuGo = (path) => navigate(path);
    return () => { delete window.__kyoyuGo; };
  }, [navigate]);

  // Tell Swift which route we're on (shows/hides the native back button)
  useEffect(() => {
    try { window.webkit?.messageHandlers?.route?.postMessage(location.pathname); } catch (_) {}
  }, [location.pathname]);

  // Also listen for kyoyu-navigate in case the WKUserScript fires before
  // window.__kyoyuGo is ready (race condition on first mount)
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
      <div
        className="main-content"
        style={{ paddingTop:'var(--page-top)', paddingBottom: hasTrack ? 'calc(var(--kyoyu-tab-h, 83px) + 62px)' : 'calc(var(--kyoyu-tab-h, 83px) + 8px)' }}
      >
        <RouteReporter />
        <TopBar />
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

// ─── Creator shell ────────────────────────────────────────
function CreatorApp() {
  const { pathname } = useLocation();
  const hideSidebar = PROFILE_ROUTES.has(pathname);
  return (
    <div className="app-layout">
      {!hideSidebar && <CreatorSidebar />}
      <div className="main-content" style={{ paddingBottom: '32px' }}>
        <TopBar showSearch={false} />
        <Routes>
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/upload"          element={<Upload />} />
          <Route path="/releases"        element={<Releases />} />
          <Route path="/artists"         element={<CreatorArtists />} />
          <Route path="/visual-identity" element={<VisualIdentity />} />
          <Route path="/preview"         element={<ListenerPreview />} />
          <Route path="/profile"         element={<Profile />} />
          <Route path="/settings"        element={<Settings />} />
          <Route path="*"                element={<Dashboard />} />
        </Routes>
      </div>
    </div>
  );
}

// ─── Role gate ────────────────────────────────────────────
function RoleGate() {
  const { role, loading } = useAuth();
  useTheme();
  // Only show blank screen if we have no session data at all (first-ever launch or logged out)
  if (loading && !role)   return <div className="auth-loading" />;
  if (!role)              return <EntryScreen />;
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

// ─── Hash Redirector ──────────────────────────────────────
// Supabase sends error/recovery tokens as URL hash on the Site URL (root).
// This component detects them and bounces to /auth/reset so the page handles it.
function HashRedirector() {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    // Supabase error: #error=access_denied&error_code=otp_expired...
    // Supabase recovery: #access_token=...&type=recovery
    const isAuthHash = hash.includes('error=') || 
                       (hash.includes('access_token=') && hash.includes('type=recovery'));
    if (isAuthHash && window.location.pathname !== '/auth/reset') {
      navigate('/auth/reset' + hash, { replace: true });
    }
  }, [navigate]);
  return null;
}

// ─── Root ─────────────────────────────────────────────────
export default function App() {
  // Always show on fresh app load (state is in-memory only)
  const [splash, setSplash] = useState(false);
  function handleSplashDone() { setSplash(false); }

  return (
    <BrowserRouter>
      <HashRedirector />
      <AuthProvider>
        <PlayerProvider>
          <LibraryProvider>
            <DisplayProvider>
              {/* Password reset — accessible without being logged in */}
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
