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
    try {
      const uid = cached.user?.id;
      const fromUser = uid ? localStorage.getItem('kyoyu-avatar-' + uid) : null;
      const fromGlobal = localStorage.getItem('kyoyu-avatar-global');
      const fromNative = typeof window !== 'undefined' ? window.__kyoyuNativeAvatarDataUrl : null;
      return fromUser || fromGlobal || fromNative || null;
    } catch { return null; }
  });
  const userRef = useRef(cached.user);

  // ── Immediately notify native shell from cache (no network wait) ──
  useEffect(() => {
    const uid = cached.user?.id;
    const av = (uid && localStorage.getItem('kyoyu-avatar-' + uid))
      || localStorage.getItem('kyoyu-avatar-global')
      || (typeof window !== 'undefined' ? window.__kyoyuNativeAvatarDataUrl : null);
    if (av) {
      setAvatarSrcRaw(av);
      try { window.webkit?.messageHandlers?.avatar?.postMessage(av); } catch (_) {}
    }
    if (cached.role && cached.user) {
      notifyNative('loggedIn');
    }
    const onNativeAvatar = (e) => {
      const dataUrl = e?.detail;
      if (dataUrl && typeof dataUrl === 'string') {
        setAvatarSrcRaw(prev => prev || dataUrl);
        try { localStorage.setItem('kyoyu-avatar-global', dataUrl); } catch (_) {}
      }
    };
    window.addEventListener('kyoyu-native-avatar', onNativeAvatar);
    return () => window.removeEventListener('kyoyu-native-avatar', onNativeAvatar);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const broadcastRef = useRef(null); // holds the live broadcast channel

  function setAvatarSrc(dataUrl, userId, explicitRemove = false) {
    const uid = userId || userRef.current?.id;
    if (!dataUrl && !explicitRemove) {
      // Never accidentally clear a saved avatar unless explicitly requested by user
      return;
    }
    setAvatarSrcRaw(dataUrl || null);
    if (dataUrl) {
      try { localStorage.setItem('kyoyu-avatar-global', dataUrl); } catch (_) {}
      if (uid) {
        try { localStorage.setItem('kyoyu-avatar-' + uid, dataUrl); } catch (_) {}
      }
      try { window.webkit?.messageHandlers?.avatar?.postMessage(dataUrl); } catch (_) {}
    } else if (explicitRemove) {
      try { localStorage.removeItem('kyoyu-avatar-global'); } catch (_) {}
      if (uid) {
        try { localStorage.removeItem('kyoyu-avatar-' + uid); } catch (_) {}
      }
      try { window.webkit?.messageHandlers?.avatar?.postMessage('__REMOVE_AVATAR__'); } catch (_) {}
    }
    // Broadcast to all other open sessions immediately (no DB event needed)
    if (broadcastRef.current) {
      broadcastRef.current.send({
        type: 'broadcast',
        event: 'avatar',
        payload: { url: dataUrl ?? '', explicitRemove: !!explicitRemove },
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

    function applyUrl(newUrl, explicitRemove = false) {
      const url = newUrl || null;
      if (!url && !explicitRemove) return;
      setAvatarSrcRaw(prev => {
        if (prev === url) return prev;
        if (url) {
          try { localStorage.setItem('kyoyu-avatar-global', url); } catch (_) {}
          try { localStorage.setItem('kyoyu-avatar-' + uid, url); } catch (_) {}
          try { window.webkit?.messageHandlers?.avatar?.postMessage(url); } catch (_) {}
        } else if (explicitRemove) {
          try { localStorage.removeItem('kyoyu-avatar-global'); } catch (_) {}
          try { localStorage.removeItem('kyoyu-avatar-' + uid); } catch (_) {}
          try { window.webkit?.messageHandlers?.avatar?.postMessage('__REMOVE_AVATAR__'); } catch (_) {}
        }
        return url;
      });
    }

    const channel = supabase
      .channel('kyoyu-avatar-' + uid, {
        config: { broadcast: { self: false } }, // don't echo back to sender
      })
      .on('broadcast', { event: 'avatar' }, ({ payload }) => {
        applyUrl(payload?.url, payload?.explicitRemove);
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
     change was made. NEVER overwrites an existing local avatar with null. */
  useEffect(() => {
    const uid = userRef.current?.id;
    if (!uid) return;

    async function syncFromDB() {
      try {
        const { data } = await supabase
          .from('profiles').select('avatar_url').eq('id', uid).single();
        const dbUrl = data?.avatar_url || null;
        if (!dbUrl) {
          // DB has no avatar_url yet — if we have a local one, push it up to DB!
          const localAv = localStorage.getItem('kyoyu-avatar-' + uid) || localStorage.getItem('kyoyu-avatar-global');
          if (localAv) {
            supabase.from('profiles').upsert({ id: uid, avatar_url: localAv }).then(() => {}).catch(() => {});
          }
          return;
        }
        setAvatarSrcRaw(prev => {
          // If we already have a reliable data:image URL locally, keep it so offline/CDN issues never break it
          if (prev && prev.startsWith('data:image/')) return prev;
          if (prev === dbUrl) return prev;
          try { localStorage.setItem('kyoyu-avatar-global', dbUrl); } catch (_) {}
          try { localStorage.setItem('kyoyu-avatar-' + uid, dbUrl); } catch (_) {}
          try { window.webkit?.messageHandlers?.avatar?.postMessage(dbUrl); } catch (_) {}
          return dbUrl;
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

    const localAvatar    = localStorage.getItem('kyoyu-avatar-' + authUser.id)
                        || localStorage.getItem('kyoyu-avatar-global')
                        || (typeof window !== 'undefined' ? window.__kyoyuNativeAvatarDataUrl : null);
    const supabaseAvatar = profile?.avatar_url || authUser.user_metadata?.avatar_url || null;
    // Prefer local data URL if present so offline/R2 CORS never drops the user's selected photo
    const avatarToUse    = (localAvatar && localAvatar.startsWith('data:image/'))
      ? localAvatar
      : (supabaseAvatar || localAvatar || null);
    if (avatarToUse) {
      setAvatarSrcRaw(avatarToUse);
      try { localStorage.setItem('kyoyu-avatar-global', avatarToUse); } catch (_) {}
      try { localStorage.setItem('kyoyu-avatar-' + authUser.id, avatarToUse); } catch (_) {}
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
    // Clear ONLY auth-related keys — preserve avatar, theme, dashboard prefs, etc.
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k.startsWith('sb-') ||
          k.startsWith('kyoyu-cached')
        ) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    notifyNative('loggedOut');
    supabase.auth.signOut().catch(() => {});
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
    userRef.current = updated;
    writeCache(role, updated);
    if (user && !user.demo) {
      try {
        const sessionKey = Object.keys(localStorage).find(
          k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        const session = sessionKey ? JSON.parse(localStorage.getItem(sessionKey)) : null;
        const token   = session?.access_token;
        const supaUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (token) {
          await fetch(`${supaUrl}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey':        anonKey,
              'Prefer':        'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
              id:           user.id,
              artist_name:  updates.artistName  ?? user.artistName,
              display_name: updates.name        ?? user.name,
            }),
          });
        }
      } catch (e) { console.warn('[updateProfile]', e.message); }
    }
  }

  return (
    <AuthContext.Provider value={{ role, user, loading, avatarSrc, setAvatarSrc, signIn, signUp, logout, demoLogin, updateProfile, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
