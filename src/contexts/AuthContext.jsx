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
  // Don't show loading spinner when there's no cached session (e.g. after logout redirect)
  // — EntryScreen appears instantly instead of a blank flash
  const [loading,   setLoading]     = useState(false);
  const [avatarSrc, setAvatarSrcRaw] = useState(() => {
    try { return cached.user ? localStorage.getItem('kyoyu-avatar-' + cached.user.id) || null : null; } catch { return null; }
  });
  const userRef = useRef(cached.user);

  // ── Immediately notify native shell from cache (no network wait) ──
  useEffect(() => {
    if (cached.role && cached.user) {
      notifyNative('loggedIn');
      // Restore avatar to native bridge from cache
      const av = localStorage.getItem('kyoyu-avatar-' + cached.user.id);
      if (av) {
        try { window.webkit?.messageHandlers?.avatar?.postMessage(av); } catch (_) {}
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const broadcastRef = useRef(null); // holds the live broadcast channel

  function setAvatarSrc(dataUrl, userId) {
    setAvatarSrcRaw(dataUrl);
    try { window.webkit?.messageHandlers?.avatar?.postMessage(dataUrl ?? ''); } catch (_) {}
    const uid = userId || userRef.current?.id;
    if (uid) {
      if (dataUrl) localStorage.setItem('kyoyu-avatar-' + uid, dataUrl);
      else         localStorage.removeItem('kyoyu-avatar-' + uid);
    }
    // Broadcast to all other open sessions immediately (no DB event needed)
    if (broadcastRef.current) {
      broadcastRef.current.send({
        type: 'broadcast',
        event: 'avatar',
        payload: { url: dataUrl ?? '' },
      }).catch(() => {});
    }
  }

  /* ── Restore / validate session on mount ── */
  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) {
          await hydrateUser(session.user);
        } else {
          // No valid session — clear stale cache, hide native UI, show login
          notifyNative('loggedOut');
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
          notifyNative('loggedOut');
          clearCache();
          setRole(null);
          setUser(null);
          userRef.current = null;
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  /* ── Supabase Broadcast: real-time avatar push to all open sessions ──────
     Broadcast works via WebSocket — no dashboard config required.
     When any client calls setAvatarSrc(), all other browsers/apps get the
     new URL pushed within ~100ms, no refresh or polling needed. */
  useEffect(() => {
    const uid = userRef.current?.id;
    if (!uid) return;

    function applyUrl(newUrl) {
      const url = newUrl || null;
      setAvatarSrcRaw(prev => {
        if (prev === url) return prev;
        if (url) {
          try { localStorage.setItem('kyoyu-avatar-' + uid, url); } catch (_) {}
          try { window.webkit?.messageHandlers?.avatar?.postMessage(url); } catch (_) {}
        } else {
          try { localStorage.removeItem('kyoyu-avatar-' + uid); } catch (_) {}
          try { window.webkit?.messageHandlers?.avatar?.postMessage(''); } catch (_) {}
        }
        return url;
      });
    }

    const channel = supabase
      .channel('kyoyu-avatar-' + uid, {
        config: { broadcast: { self: false } }, // don't echo back to sender
      })
      .on('broadcast', { event: 'avatar' }, ({ payload }) => {
        applyUrl(payload?.url);
      })
      .subscribe();

    broadcastRef.current = channel;
    return () => {
      broadcastRef.current = null;
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── Fallback: re-fetch from DB on focus / visibility change ──────────────
     Covers newly-opened tabs and apps that weren't connected when the
     change was made (broadcast only reaches currently open sessions). */
  useEffect(() => {
    const uid = userRef.current?.id;
    if (!uid) return;

    async function syncFromDB() {
      try {
        const { data } = await supabase
          .from('profiles').select('avatar_url').eq('id', uid).single();
        const newUrl = data?.avatar_url ?? null;
        setAvatarSrcRaw(prev => {
          if (prev === newUrl) return prev;
          if (newUrl) {
            try { localStorage.setItem('kyoyu-avatar-' + uid, newUrl); } catch (_) {}
            try { window.webkit?.messageHandlers?.avatar?.postMessage(newUrl); } catch (_) {}
          } else {
            try { localStorage.removeItem('kyoyu-avatar-' + uid); } catch (_) {}
            try { window.webkit?.messageHandlers?.avatar?.postMessage(''); } catch (_) {}
          }
          return newUrl;
        });
      } catch (_) {}
    }

    const onVisible = () => { if (document.visibilityState === 'visible') syncFromDB(); };
    window.addEventListener('focus', syncFromDB);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(syncFromDB, 30_000); // 30s safety net

    return () => {
      window.removeEventListener('focus', syncFromDB);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  function logout() {
    // No network call — wipe storage NOW, redirect instantly
    try { localStorage.clear(); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    notifyNative('loggedOut');
    try { window.webkit?.messageHandlers?.avatar?.postMessage(''); } catch (_) {}
    // Kick off server-side session invalidation in the background (non-blocking)
    supabase.auth.signOut().catch(() => {});
    // Hard redirect — replace so back-button doesn't return to the protected page
    window.location.replace('/');
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/reset',
    });
    if (error) throw error;
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
    <AuthContext.Provider value={{ role, user, loading, avatarSrc, setAvatarSrc, signIn, signUp, logout, demoLogin, updateProfile, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
