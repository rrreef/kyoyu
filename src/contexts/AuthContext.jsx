import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Post auth state to native iOS shell (if running inside KyoyuApp)
function notifyNative(type) {
  try { window.webkit?.messageHandlers?.auth?.postMessage({ type }); } catch(_) {}
}



const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole]           = useState(null);
  const [user, setUser]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [avatarSrc, setAvatarSrc] = useState(null);

  /* ── Restore session on mount ── */
  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) await hydrateUser(session.user);
      })
      .catch(() => { /* network error — proceed as logged out */ })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          await hydrateUser(session.user);
        } else {
          setRole(null);
          setUser(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  /* ── Pull role + profile from DB ── */
  async function hydrateUser(authUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, artist_name, display_name')
      .eq('id', authUser.id)
      .single();

    const userRole = profile?.role || authUser.user_metadata?.role || 'listener';
    notifyNative('loggedIn');
    setRole(userRole);
    setUser({
      id:          authUser.id,
      email:       authUser.email,
      name:        profile?.display_name || authUser.user_metadata?.display_name || authUser.email?.split('@')[0],
      artistName:  profile?.artist_name  || authUser.user_metadata?.artist_name  || '',
      role:        userRole,
    });
  }

  /* ── Sign in ── */
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  /* ── Sign up ── */
  async function signUp(email, password, meta = {}) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: meta },
    });
    if (error) throw error;
    return data;
  }

  /* ── Sign out ── */
  async function logout() {
    await supabase.auth.signOut();
    notifyNative('loggedOut');
    setRole(null);
    setUser(null);
    setAvatarSrc(null);
  }

  /* ── Demo bypass (local only — no real account) ── */
  function demoLogin(roleType, userData) {
    setRole(roleType);
    setUser({ ...userData, demo: true });
  }

  /* ── Update profile (artist name, bio, location) ── */
  async function updateProfile(updates) {
    // Immediately reflect in UI
    setUser(prev => ({ ...prev, ...updates }));

    // Persist to DB for real (non-demo) users
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

export function useAuth() {
  return useContext(AuthContext);
}
