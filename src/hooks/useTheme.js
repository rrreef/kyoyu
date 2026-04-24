import { useState, useEffect } from 'react';

export const THEMES = [
  { id: 'dark',  label: 'Dark'  },
  { id: 'grey',  label: 'Grey'  },
  { id: 'white', label: 'White' },
];

const LS_KEY = 'kyoyu-theme';

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    // Migrate: white → dark (dark is now the default)
    if (!saved || saved === 'white') {
      localStorage.setItem(LS_KEY, 'dark');
      return 'dark';
    }
    return saved;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /* Apply on first mount (in case localStorage had a saved value) */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const setTheme = (t) => {
    localStorage.setItem(LS_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
    setThemeState(t);
  };

  return [theme, setTheme];
}
