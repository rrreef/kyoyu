import { createContext, useContext, useState } from 'react';

const DEFAULT_LAYOUT = { mode: 'list', cols: 2 };

function readLayout(key) {
  try { return JSON.parse(localStorage.getItem(key)) || DEFAULT_LAYOUT; } catch { return DEFAULT_LAYOUT; }
}

const DisplayContext = createContext(null);

export function DisplayProvider({ children }) {
  const [homeLayout,    setHomeRaw]    = useState(() => readLayout('kyoyu-display-home'));
  const [libraryLayout, setLibraryRaw] = useState(() => readLayout('kyoyu-display-library'));

  function setHomeLayout(l) {
    setHomeRaw(l);
    try { localStorage.setItem('kyoyu-display-home', JSON.stringify(l)); } catch {}
  }
  function setLibraryLayout(l) {
    setLibraryRaw(l);
    try { localStorage.setItem('kyoyu-display-library', JSON.stringify(l)); } catch {}
  }

  return (
    <DisplayContext.Provider value={{ homeLayout, setHomeLayout, libraryLayout, setLibraryLayout }}>
      {children}
    </DisplayContext.Provider>
  );
}

export function useDisplay() { return useContext(DisplayContext); }
