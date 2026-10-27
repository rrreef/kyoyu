import { createContext, useContext, useState, useEffect } from 'react';

const DEFAULT_LAYOUT = { mode: 'grid', cols: 3 };

function colsKeyFor(key) {
  if (key === 'kyoyu-display-home') return 'kyoyu-grid-cols-home';
  if (key === 'kyoyu-display-library') return 'kyoyu-grid-cols-library';
  return null;
}

function layoutFromCols(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = parseInt(n, 10);
  if (!Number.isFinite(num) || num < 0) return null;
  if (num === 0) return { mode: 'list', cols: 1 };
  return { mode: 'grid', cols: Math.min(5, Math.max(1, num)) };
}

function readLayout(key) {
  try {
    const colsKey = colsKeyFor(key);
    if (colsKey) {
      const rawCols = localStorage.getItem(colsKey);
      const fromCols = layoutFromCols(rawCols);
      if (fromCols) return fromCols;
    }
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed && (parsed.mode === 'list' || parsed.mode === 'grid')) {
      return {
        mode: parsed.mode,
        cols: parsed.mode === 'list' ? 1 : (Number(parsed.cols) || 3),
      };
    }
    return DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function save(key, value) {
  try {
    const isList = value?.mode === 'list' || Number(value?.cols) === 0;
    const normalized = {
      mode: isList ? 'list' : 'grid',
      cols: isList ? 1 : Math.min(5, Math.max(1, Number(value?.cols) || 3)),
    };
    localStorage.setItem(key, JSON.stringify(normalized));
    const colsKey = colsKeyFor(key);
    if (colsKey) {
      localStorage.setItem(colsKey, String(normalized.mode === 'list' ? 0 : normalized.cols));
    }
    // Notify any mounted consumer immediately
    window.dispatchEvent(new CustomEvent('kyoyu-layout-changed', { detail: { key, value: normalized } }));
    window.dispatchEvent(new CustomEvent('kyoyu-grid-cols-change', {
      detail: {
        page: key === 'kyoyu-display-home' ? 'home' : 'library',
        cols: normalized.mode === 'list' ? 0 : normalized.cols,
      },
    }));
  } catch {}
}

const DisplayContext = createContext(null);

export function DisplayProvider({ children }) {
  const [homeLayout,    setHomeRaw]    = useState(() => readLayout('kyoyu-display-home'));
  const [libraryLayout, setLibraryRaw] = useState(() => readLayout('kyoyu-display-library'));

  useEffect(() => {
    const syncAll = () => {
      setHomeRaw(readLayout('kyoyu-display-home'));
      setLibraryRaw(readLayout('kyoyu-display-library'));
    };
    const onLayoutChanged = (e) => {
      if (e.detail?.key === 'kyoyu-display-home' && e.detail.value) {
        setHomeRaw(e.detail.value);
      } else if (e.detail?.key === 'kyoyu-display-library' && e.detail.value) {
        setLibraryRaw(e.detail.value);
      } else {
        syncAll();
      }
    };
    const onGridColsChange = (e) => {
      const page = e?.detail?.page;
      const fromCols = layoutFromCols(e?.detail?.cols);
      if (page === 'home' && fromCols) {
        try { localStorage.setItem('kyoyu-display-home', JSON.stringify(fromCols)); } catch {}
        setHomeRaw(fromCols);
      } else if (page === 'library' && fromCols) {
        try { localStorage.setItem('kyoyu-display-library', JSON.stringify(fromCols)); } catch {}
        setLibraryRaw(fromCols);
      } else {
        syncAll();
      }
    };
    window.addEventListener('kyoyu-layout-changed', onLayoutChanged);
    window.addEventListener('kyoyu-grid-cols-change', onGridColsChange);
    window.addEventListener('storage', syncAll);
    return () => {
      window.removeEventListener('kyoyu-layout-changed', onLayoutChanged);
      window.removeEventListener('kyoyu-grid-cols-change', onGridColsChange);
      window.removeEventListener('storage', syncAll);
    };
  }, []);

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
    setLayout(readLayout('kyoyu-display-home'));
    const onLayout = (e) => {
      if (e.detail?.key === 'kyoyu-display-home' && e.detail.value) setLayout(e.detail.value);
      else setLayout(readLayout('kyoyu-display-home'));
    };
    const onGridCols = (e) => {
      if (e?.detail?.page === 'home') {
        const fromCols = layoutFromCols(e?.detail?.cols);
        if (fromCols) {
          try { localStorage.setItem('kyoyu-display-home', JSON.stringify(fromCols)); } catch {}
          setLayout(fromCols);
          return;
        }
      }
      setLayout(readLayout('kyoyu-display-home'));
    };
    const onStorage = () => setLayout(readLayout('kyoyu-display-home'));
    window.addEventListener('kyoyu-layout-changed', onLayout);
    window.addEventListener('kyoyu-grid-cols-change', onGridCols);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('kyoyu-layout-changed', onLayout);
      window.removeEventListener('kyoyu-grid-cols-change', onGridCols);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return layout;
}

export function useLibraryLayoutLive() {
  const [layout, setLayout] = useState(() => readLayout('kyoyu-display-library'));
  useEffect(() => {
    setLayout(readLayout('kyoyu-display-library'));
    const onLayout = (e) => {
      if (e.detail?.key === 'kyoyu-display-library' && e.detail.value) setLayout(e.detail.value);
      else setLayout(readLayout('kyoyu-display-library'));
    };
    const onGridCols = (e) => {
      if (e?.detail?.page === 'library') {
        const fromCols = layoutFromCols(e?.detail?.cols);
        if (fromCols) {
          try { localStorage.setItem('kyoyu-display-library', JSON.stringify(fromCols)); } catch {}
          setLayout(fromCols);
          return;
        }
      }
      setLayout(readLayout('kyoyu-display-library'));
    };
    const onStorage = () => setLayout(readLayout('kyoyu-display-library'));
    window.addEventListener('kyoyu-layout-changed', onLayout);
    window.addEventListener('kyoyu-grid-cols-change', onGridCols);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('kyoyu-layout-changed', onLayout);
      window.removeEventListener('kyoyu-grid-cols-change', onGridCols);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return layout;
}
