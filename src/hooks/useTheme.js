import { useState, useEffect, useCallback } from 'react';

export const THEMES = [
  { id: 'white',  label: 'Light'      },
  { id: 'dark',   label: 'Dark'       },
  { id: 'custom', label: 'Customized' },
];

export const CUSTOM_BASE_THEMES = [
  { id: 'white', label: 'Light' },
  { id: 'grey',  label: 'Gray'  },
  { id: 'dark',  label: 'Dark'  },
];

const LS_THEME_KEY = 'kyoyu-theme';
const LS_MODE_KEY  = 'kyoyu-appearance-mode';
const LS_BASE_KEY  = 'kyoyu-custom-base-theme';
const LS_TINT_KEY  = 'kyoyu-glass-tint';
const LS_POS_KEY   = 'kyoyu-glass-tint-pos';

const THEME_BG_MAP = {
  white: { bg: '#f8f8fc', fg: '#0f0f1a' },
  grey:  { bg: '#7c7c84', fg: '#ffffff' },
  dark:  { bg: '#060608', fg: '#ffffff' },
};

function readStoredAppearance() {
  const savedTheme = localStorage.getItem(LS_THEME_KEY) || 'white';
  const rawMode = localStorage.getItem(LS_MODE_KEY);
  let mode = ['white', 'dark', 'custom'].includes(rawMode)
    ? rawMode
    : (savedTheme === 'grey' ? 'custom' : savedTheme);
  if (mode !== 'custom' && (savedTheme === 'dark' || savedTheme === 'white') && mode !== savedTheme) {
    mode = savedTheme;
  }
  const savedBase = localStorage.getItem(LS_BASE_KEY) || (savedTheme === 'grey' ? 'grey' : 'grey');
  const customBase = ['white', 'grey', 'dark'].includes(savedBase) ? savedBase : 'grey';
  const glassTint = localStorage.getItem(LS_TINT_KEY) || '';
  let tintPos = { x: 0.58, y: 0.45 };
  try {
    const rawPos = localStorage.getItem(LS_POS_KEY);
    if (rawPos) {
      const parsed = JSON.parse(rawPos);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        tintPos = parsed;
      }
    }
  } catch (_) {}
  const effectiveTheme = mode === 'custom' ? customBase : mode;
  return { mode, customBase, glassTint, tintPos, effectiveTheme };
}

export function applyAppearanceToDOMAndNative({ mode, customBase, glassTint }, notifyNative = true) {
  const effectiveTheme = mode === 'custom' ? customBase : mode;
  const activeTint = mode === 'custom' && glassTint ? glassTint : '';

  localStorage.setItem(LS_MODE_KEY, mode);
  localStorage.setItem(LS_BASE_KEY, customBase);
  localStorage.setItem(LS_THEME_KEY, effectiveTheme);
  localStorage.setItem(LS_TINT_KEY, glassTint || '');

  const root = document.documentElement;
  root.setAttribute('data-theme', effectiveTheme);

  const colors = THEME_BG_MAP[effectiveTheme] || THEME_BG_MAP.white;
  if (document.body) {
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.fg;
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', colors.bg);
  }

  if (activeTint) {
    root.setAttribute('data-glass-tint', 'true');
    root.style.setProperty('--glass-tint-color', activeTint);
  } else {
    root.removeAttribute('data-glass-tint');
    root.style.removeProperty('--glass-tint-color');
  }

  if (notifyNative) {
    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        appearanceUpdate: true,
        theme: effectiveTheme,
        mode,
        glassTint: activeTint,
      });
    } catch (_) {}
  }
}

export function useTheme() {
  const [state, setState] = useState(() => readStoredAppearance());

  useEffect(() => {
    const current = readStoredAppearance();
    applyAppearanceToDOMAndNative(current, true);
    setState(current);

    const onSync = () => {
      setState(readStoredAppearance());
    };
    window.addEventListener('kyoyu-appearance-change', onSync);
    return () => window.removeEventListener('kyoyu-appearance-change', onSync);
  }, []);

  const broadcast = useCallback((next) => {
    applyAppearanceToDOMAndNative(next, true);
    setState(next);
    window.dispatchEvent(new CustomEvent('kyoyu-appearance-change', { detail: next }));
  }, []);

  const setMode = useCallback((nextMode) => {
    const cur = readStoredAppearance();
    let customBase = cur.customBase;
    let mode = nextMode;
    if (nextMode === 'grey') {
      mode = 'custom';
      customBase = 'grey';
    }
    const effectiveTheme = mode === 'custom' ? customBase : mode;
    broadcast({ ...cur, mode, customBase, effectiveTheme });
  }, [broadcast]);

  const setCustomBase = useCallback((nextBase) => {
    const cur = readStoredAppearance();
    const mode = 'custom';
    const customBase = ['white', 'grey', 'dark'].includes(nextBase) ? nextBase : 'grey';
    const effectiveTheme = customBase;
    broadcast({ ...cur, mode, customBase, effectiveTheme });
  }, [broadcast]);

  const setGlassTint = useCallback((hex, pos) => {
    const cur = readStoredAppearance();
    const mode = 'custom';
    const nextPos = pos || cur.tintPos;
    try {
      localStorage.setItem(LS_POS_KEY, JSON.stringify(nextPos));
    } catch (_) {}
    broadcast({
      ...cur,
      mode,
      glassTint: hex || '',
      tintPos: nextPos,
      effectiveTheme: cur.customBase,
    });
  }, [broadcast]);

  const tuple = [
    state.mode,
    setMode,
    {
      theme: state.effectiveTheme,
      mode: state.mode,
      setMode,
      customBase: state.customBase,
      setCustomBase,
      glassTint: state.glassTint,
      setGlassTint,
      tintPos: state.tintPos,
    },
  ];
  return tuple;
}
