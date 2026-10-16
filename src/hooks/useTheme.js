import { useState, useEffect } from 'react';

export const THEMES = [
  { id: 'white', label: 'White' },
  { id: 'grey',  label: 'Grey'  },
  { id: 'dark',  label: 'Dark'  },
];

const LS_KEY = 'kyoyu-theme';

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    // Migrate: dark → white (white/light is now the default main theme)
    if (!saved || saved === 'dark') {
      localStorage.setItem(LS_KEY, 'white');
      return 'white';
    }
    return saved;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /* Apply on first mount */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) || 'white';
    const resolved = saved === 'dark' ? 'white' : saved;
    localStorage.setItem(LS_KEY, resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  const setTheme = (t) => {
    localStorage.setItem(LS_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
    setThemeState(t);
  };

  return [theme, setTheme];
}
