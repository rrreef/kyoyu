import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PlayerProvider, usePlayer } from './contexts/PlayerContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useTheme } from './hooks/useTheme';

// Nav
import Sidebar from './components/nav/Sidebar';
import CreatorSidebar from './components/nav/CreatorSidebar';
import MobileNav from './components/nav/MobileNav';
import TopBar from './components/nav/TopBar';
import Player from './components/player/Player';

// Auth screens
import EntryScreen from './pages/auth/EntryScreen';
import SplashScreen from './pages/auth/SplashScreen';

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
import Orders        from './pages/Orders';
import Downloads     from './pages/Downloads';
import Messages      from './pages/Messages';
import Events        from './pages/Events';

// Creator pages
import Dashboard     from './pages/Dashboard';
import Upload        from './pages/Upload';
import Releases      from './pages/Releases';
import Settings      from './pages/Settings';
import CreatorArtists from './pages/CreatorArtists';
import VisualIdentity from './pages/VisualIdentity';
import ListenerPreview from './pages/ListenerPreview';

import './index.css';

// ─── Listener shell ───────────────────────────────────────
function ListenerApp() {
  const { state } = usePlayer();
  const hasTrack = !!state.currentTrack;

  return (
    <div className="app-layout">
      <Sidebar />
      <div
        className="main-content"
        style={{ paddingBottom: hasTrack ? 'calc(var(--player-height) + 16px)' : '32px' }}
      >
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
  return (
    <div className="app-layout">
      <CreatorSidebar />
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
  useTheme(); // applies saved data-theme on mount
  if (loading)           return <div className="auth-loading" />;
  if (!role)             return <EntryScreen />;
  if (role === 'listener') return <ListenerApp />;
  if (role === 'creator')  return <CreatorApp />;
  return <EntryScreen />;
}

// ─── Root ─────────────────────────────────────────────────
export default function App() {
  // Always show on fresh app load (state is in-memory only)
  const [splash, setSplash] = useState(false);
  function handleSplashDone() { setSplash(false); }

  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <LibraryProvider>
            {splash
              ? <SplashScreen onDone={handleSplashDone} />
              : <RoleGate />
            }
          </LibraryProvider>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
