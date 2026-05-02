import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Post auth state to native iOS shell (if running inside KyoyuApp)
function notifyNative(type) {
  try { window.webkit?.messageHandlers?.auth?.postMessage({ type }); } catch(_) {}
}

// ── Cache helpers ──────────────────────────────────────────────────────────
const ROLE_KEY = 'kyoyu-cached-role';
const USER_KEY = 'kyoyu-cached-user';

function readCache() {
  try {
    const role = localStorage.getItem(ROLE_KEY) || null;
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return { role, user };
  } catch { return { role: null, user: null }; }
}
function writeCache(role, user) {
  try {
    localStorage.setItem(ROLE_KEY, role || '');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}
function clearCache() {
  try { localStorage.removeItem(ROLE_KEY); localStorage.removeItem(USER_KEY); } catch {}
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialise synchronously from cache — app renders immediately on reopen
  const cached = readCache();
  const [role,      setRole]        = useState(cached.role);
  const [user,      setUser]        = useState(cached.user);
  // Only show loading spinner if there is no cached session to display
  const [loading,   setLoading]     = useState(!cached.role);
  const [avatarSrc, setAvatarSrcRaw] = useState(() => {
    try { return cached.user ? localStorage.getItem('kyoyu-avatar-' + cached.user.id) || null : null; } catch { return null; }
  });
  const userRef = useRef(cached.user);

  function setAvatarSrc(dataUrl, userId) {
    setAvatarSrcRaw(dataUrl);
    try { window.webkit?.messageHandlers?.avatar?.postMessage(dataUrl ?? ''); } catch (_) {}
    const uid = userId || userRef.current?.id;
    if (uid) {
      if (dataUrl) localStorage.setItem('kyoyu-avatar-' + uid, dataUrl);
      else         localStorage.removeItem('kyoyu-avatar-' + uid);
    }
  }

  /* ── Restore / validate session on mount ── */
  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) {
          await hydrateUser(session.user);
        } else {
          // No valid session — clear stale cache and show login
          clearCache();
          setRole(null);
          setUser(null);
          userRef.current = null;
        }
      })
      .catch(() => { /* network error — keep showing cached state */ })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          await hydrateUser(session.user);
        } else {
          clearCache();
          setRole(null);
          setUser(null);
          userRef.current = null;
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  /* ── Pull role + profile from DB ── */
  async function hydrateUser(authUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, artist_name, display_name, avatar_url')
      .eq('id', authUser.id)
      .single();

    const userRole = profile?.role || authUser.user_metadata?.role || 'listener';
    notifyNative('loggedIn');

    const hydrated = {
      id:         authUser.id,
      email:      authUser.email,
      name:       profile?.display_name || authUser.user_metadata?.display_name || authUser.email?.split('@')[0],
      artistName: profile?.artist_name  || authUser.user_metadata?.artist_name  || '',
      role:       userRole,
    };
    userRef.current = hydrated;
    setRole(userRole);
    setUser(hydrated);
    writeCache(userRole, hydrated); // persist so next open is instant

    const supabaseAvatar = profile?.avatar_url || null;
    const localAvatar    = localStorage.getItem('kyoyu-avatar-' + authUser.id);
    const avatarToUse    = supabaseAvatar || localAvatar || null;
    if (avatarToUse) {
      setAvatarSrcRaw(avatarToUse);
      try { window.webkit?.messageHandlers?.avatar?.postMessage(avatarToUse); } catch (_) {}
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, meta = {}) {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: meta },
    });
    if (error) throw error;
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
    notifyNative('loggedOut');
    clearCache();
    setRole(null);
    setUser(null);
    userRef.current = null;
    setAvatarSrcRaw(null);
    try { window.webkit?.messageHandlers?.avatar?.postMessage(''); } catch (_) {}
  }

  function demoLogin(roleType, userData) {
    setRole(roleType);
    setUser({ ...userData, demo: true });
  }

  async function updateProfile(updates) {
    const updated = { ...user, ...updates };
    setUser(updated);
    writeCache(role, updated);
    if (user && !user.demo) {
      await supabase.from('profiles').upsert({
        id:           user.id,
        artist_name:  updates.artistName  ?? user.artistName,
        display_name: updates.name        ?? user.name,
      });
    }
  }

  return (
    <AuthContext.Provider value={{ role, user, loading, avatarSrc, setAvatarSrc, signIn, signUp, logout, demoLogin, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
