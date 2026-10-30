import { useState, useEffect, useCallback } from 'react';

export const THEMES = [
  { id: 'white',  label: 'Light'  },
  { id: 'dark',   label: 'Dark'   },
  { id: 'custom', label: 'Custom' },
];

export const CUSTOM_BASE_THEMES = [
  { id: 'white', label: 'Light' },
  { id: 'grey',  label: 'Gray'  },
  { id: 'dark',  label: 'Dark'  },
];

const LS_THEME_KEY     = 'kyoyu-theme';
const LS_MODE_KEY      = 'kyoyu-appearance-mode';
const LS_BASE_KEY      = 'kyoyu-custom-base-theme';
const LS_CUSTOM_BG_KEY = 'kyoyu-custom-bg';
const LS_TINT_KEY      = 'kyoyu-glass-tint';
const LS_POS_KEY       = 'kyoyu-glass-tint-pos';
const LS_TEXT_COLOR_KEY = 'kyoyu-custom-text-color';

export const DEFAULT_CUSTOM_BG = '#7c7c7c';

const THEME_BG_MAP = {
  white: { bg: '#f8f8f8', fg: '#0f0f0f' },
  grey:  { bg: '#7c7c7c', fg: '#ffffff' },
  dark:  { bg: '#060606', fg: '#ffffff' },
};

export function isLightHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62;
}

function readStoredAppearance() {
  const savedTheme = localStorage.getItem(LS_THEME_KEY) || 'white';
  const rawMode = localStorage.getItem(LS_MODE_KEY);
  let mode = ['white', 'dark', 'custom'].includes(rawMode)
    ? rawMode
    : (savedTheme === 'grey' ? 'custom' : savedTheme);
  if (mode !== 'custom' && (savedTheme === 'dark' || savedTheme === 'white') && mode !== savedTheme) {
    mode = savedTheme;
  }
  const savedBase = localStorage.getItem(LS_BASE_KEY) || 'grey';
  const customBase = ['white', 'grey', 'dark'].includes(savedBase) ? savedBase : 'grey';
  const rawCustomBg = localStorage.getItem(LS_CUSTOM_BG_KEY);
  const customBg = rawCustomBg && /^#[0-9a-fA-F]{6}$/.test(rawCustomBg.trim())
    ? rawCustomBg.trim().toLowerCase()
    : DEFAULT_CUSTOM_BG;
  const glassTint = localStorage.getItem(LS_TINT_KEY) || '';
  const rawTextColor = localStorage.getItem(LS_TEXT_COLOR_KEY) || '';
  const textColor = rawTextColor && /^#[0-9a-fA-F]{6}$/.test(rawTextColor.trim())
    ? rawTextColor.trim()
    : '';
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
  const effectiveTheme = mode === 'custom'
    ? (isLightHex(customBg) ? 'white' : 'grey')
    : mode;
  return { mode, customBase, customBg, glassTint, textColor, tintPos, effectiveTheme };
}

export function applyAppearanceToDOMAndNative({ mode, customBase, customBg, glassTint, textColor }, notifyNative = true) {
  const activeCustomBg = (customBg && /^#[0-9a-fA-F]{6}$/.test(customBg.trim()))
    ? customBg.trim().toLowerCase()
    : DEFAULT_CUSTOM_BG;
  const effectiveTheme = mode === 'custom'
    ? (isLightHex(activeCustomBg) ? 'white' : 'grey')
    : mode;
  const activeTint = mode === 'custom' && glassTint ? glassTint : '';
  const storedText = textColor !== undefined ? textColor : (localStorage.getItem(LS_TEXT_COLOR_KEY) || '');
  const activeTextColor = (mode === 'custom' && storedText && /^#[0-9a-fA-F]{6}$/.test(storedText.trim()))
    ? storedText.trim()
    : '';

  localStorage.setItem(LS_MODE_KEY, mode);
  localStorage.setItem(LS_BASE_KEY, customBase || 'grey');
  localStorage.setItem(LS_CUSTOM_BG_KEY, activeCustomBg);
  localStorage.setItem(LS_THEME_KEY, effectiveTheme);
  localStorage.setItem(LS_TINT_KEY, glassTint || '');

  const root = document.documentElement;
  root.setAttribute('data-theme', effectiveTheme);

  const colors = THEME_BG_MAP[effectiveTheme] || THEME_BG_MAP.white;
  const isNativeWebView = typeof window !== 'undefined' && Boolean(window.webkit?.messageHandlers?.player);
  const hasCustomBgImage = mode === 'custom' && (Boolean((localStorage.getItem('kyoyu-custom-bg-image') || '').trim()) || isNativeWebView);
  const finalBg = hasCustomBgImage ? 'transparent' : (mode === 'custom' ? activeCustomBg : colors.bg);
  const finalFg = activeTextColor || (mode === 'custom' ? (isLightHex(activeCustomBg) ? '#0f0f0f' : '#ffffff') : colors.fg);

  if (mode === 'custom') {
    root.setAttribute('data-custom-bg', 'true');
    if (hasCustomBgImage) {
      root.setAttribute('data-custom-bg-image', 'true');
      root.setAttribute('data-custom-bg-img', 'true');
      root.style.removeProperty('--custom-bg-color');
      root.style.removeProperty('--bg-deep');
      root.style.removeProperty('--bg-primary');
    } else {
      root.removeAttribute('data-custom-bg-image');
      root.removeAttribute('data-custom-bg-img');
      root.style.setProperty('--custom-bg-color', activeCustomBg);
      root.style.setProperty('--bg-deep', activeCustomBg);
      root.style.setProperty('--bg-primary', activeCustomBg);
    }
  } else {
    root.removeAttribute('data-custom-bg-image');
    root.removeAttribute('data-custom-bg-img');
    root.removeAttribute('data-custom-bg');
    root.style.removeProperty('--custom-bg-color');
    root.style.removeProperty('--bg-deep');
    root.style.removeProperty('--bg-primary');
  }

  if (activeTextColor) {
    root.setAttribute('data-custom-text', 'true');
    root.style.setProperty('--custom-text-color', activeTextColor);
  } else {
    root.removeAttribute('data-custom-text');
    root.style.removeProperty('--custom-text-color');
  }

  root.style.backgroundColor = finalBg;
  root.style.color = finalFg;
  if (hasCustomBgImage) {
    root.style.setProperty('background', 'transparent', 'important');
    root.style.setProperty('background-color', 'transparent', 'important');
  }

  if (document.body) {
    document.body.style.backgroundColor = finalBg;
    document.body.style.color = finalFg;
    if (hasCustomBgImage) {
      document.body.style.setProperty('background', 'transparent', 'important');
      document.body.style.setProperty('background-color', 'transparent', 'important');
    }
  }
  const appRoot = document.getElementById('root');
  if (appRoot) {
    appRoot.style.backgroundColor = finalBg;
    if (hasCustomBgImage) {
      appRoot.style.setProperty('background', 'transparent', 'important');
      appRoot.style.setProperty('background-color', 'transparent', 'important');
    }
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', hasCustomBgImage ? activeCustomBg : finalBg);
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
      if (typeof window.__kyoyuApplyAppearanceDOM === 'function') {
        window.__kyoyuApplyAppearanceDOM(
          mode,
          effectiveTheme,
          activeTint,
          mode === 'custom' ? activeCustomBg : '',
          true
        );
      }
    } catch (_) {}

    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        appearanceUpdate: true,
        theme: effectiveTheme,
        mode,
        glassTint: activeTint,
        customBg: mode === 'custom' ? activeCustomBg : '',
      });
    } catch (_) {}
  }
}

export function useTheme() {
  const [state, setState] = useState(() => readStoredAppearance());

  useEffect(() => {
    const current = readStoredAppearance();
    applyAppearanceToDOMAndNative(current, false);
    setState(current);

    const onSync = () => {
      const latest = readStoredAppearance();
      applyAppearanceToDOMAndNative(latest, false);
      setState(latest);
    };
    const onStorage = (e) => {
      if (!e.key || [LS_THEME_KEY, LS_MODE_KEY, LS_BASE_KEY, LS_CUSTOM_BG_KEY, LS_TINT_KEY, LS_TEXT_COLOR_KEY, 'kyoyu-custom-bg-image'].includes(e.key)) {
        onSync();
      }
    };
    window.addEventListener('kyoyu-appearance-change', onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('kyoyu-appearance-change', onSync);
      window.removeEventListener('storage', onStorage);
    };
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
    const effectiveTheme = mode === 'custom'
      ? (isLightHex(cur.customBg) ? 'white' : 'grey')
      : mode;
    broadcast({ ...cur, mode, customBase, effectiveTheme });
  }, [broadcast]);

  const setCustomBase = useCallback((nextBase) => {
    const cur = readStoredAppearance();
    const mode = 'custom';
    const customBase = ['white', 'grey', 'dark'].includes(nextBase) ? nextBase : 'grey';
    const nextBg = THEME_BG_MAP[customBase]?.bg || cur.customBg || DEFAULT_CUSTOM_BG;
    const effectiveTheme = isLightHex(nextBg) ? 'white' : 'grey';
    broadcast({ ...cur, mode, customBase, customBg: nextBg, effectiveTheme });
  }, [broadcast]);

  const setCustomBg = useCallback((hex) => {
    const cur = readStoredAppearance();
    const mode = 'custom';
    const cleanHex = (hex && /^#[0-9a-fA-F]{6}$/.test(hex.trim()))
      ? hex.trim().toLowerCase()
      : DEFAULT_CUSTOM_BG;
    const effectiveTheme = isLightHex(cleanHex) ? 'white' : 'grey';
    broadcast({
      ...cur,
      mode,
      customBg: cleanHex,
      effectiveTheme,
    });
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
      effectiveTheme: isLightHex(cur.customBg) ? 'white' : 'grey',
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
      customBg: state.customBg,
      setCustomBg,
      glassTint: state.glassTint,
      setGlassTint,
      tintPos: state.tintPos,
    },
  ];
  return tuple;
}
