import { createContext, useContext, useState, useEffect } from 'react';

const DEFAULT_LAYOUT = { mode: 'grid', cols: 3 };

function readLayout(key) {
  try { return JSON.parse(localStorage.getItem(key)) || DEFAULT_LAYOUT; } catch { return DEFAULT_LAYOUT; }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // Notify any mounted consumer immediately
    window.dispatchEvent(new CustomEvent('kyoyu-layout-changed', { detail: { key, value } }));
  } catch {}
}

const DisplayContext = createContext(null);

export function DisplayProvider({ children }) {
  const [homeLayout,    setHomeRaw]    = useState(() => readLayout('kyoyu-display-home'));
  const [libraryLayout, setLibraryRaw] = useState(() => readLayout('kyoyu-display-library'));

  function setHomeLayout(l)    { setHomeRaw(l);    save('kyoyu-display-home',    l); }
  function setLibraryLayout(l) { setLibraryRaw(l); save('kyoyu-display-library', l); }

  return (
    <DisplayContext.Provider value={{ homeLayout, setHomeLayout, libraryLayout, setLibraryLayout }}>
      {children}
    </DisplayContext.Provider>
  );
}

export function useDisplay() { return useContext(DisplayContext); }

// Standalone hook: live-updates when layout changes (any route)
export function useHomeLayoutLive() {
  const [layout, setLayout] = useState(() => readLayout('kyoyu-display-home'));
  useEffect(() => {
    // Re-read on mount (catches post-navigation remount)
    setLayout(readLayout('kyoyu-display-home'));
    // Live updates while mounted (catches in-session changes from Settings)
    const handler = (e) => {
      if (e.detail?.key === 'kyoyu-display-home') setLayout(e.detail.value);
    };
    window.addEventListener('kyoyu-layout-changed', handler);
    return () => window.removeEventListener('kyoyu-layout-changed', handler);
  }, []);
  return layout;
}

export function useLibraryLayoutLive() {
  const [layout, setLayout] = useState(() => readLayout('kyoyu-display-library'));
  useEffect(() => {
    setLayout(readLayout('kyoyu-display-library'));
    const handler = (e) => {
      if (e.detail?.key === 'kyoyu-display-library') setLayout(e.detail.value);
    };
    window.addEventListener('kyoyu-layout-changed', handler);
    return () => window.removeEventListener('kyoyu-layout-changed', handler);
  }, []);
  return layout;
}
