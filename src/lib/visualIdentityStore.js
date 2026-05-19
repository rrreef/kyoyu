/**
 * Lightweight reactive store for Visual Identity data.
 * Persists to localStorage so settings survive page reloads.
 * Avatar image/cover use data URLs — stored in localStorage.
 * On logout, only 'kyoyu-' prefixed keys are cleared (see AuthContext).
 */
import { useState, useEffect, useRef } from 'react';

const LS_KEY = 'kyoyu-vi-state';

const DEFAULTS = {
  coverImage:     null,
  coverPosition:  { x: 50, y: 50 },
  avatarImage:    null,
  avatarPosition: { x: 50, y: 50 },
  displayMode:    'prominent',
  primary:        '#9b6dff',
  secondary:      '#29b6f6',
  links:          [],
  artworks:       [],   // { url, label, placement, position, fit }[]
  bio:            '',
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      coverPosition:  { ...DEFAULTS.coverPosition,  ...(parsed.coverPosition  || {}) },
      avatarPosition: { ...DEFAULTS.avatarPosition, ...(parsed.avatarPosition || {}) },
    };
  } catch { return { ...DEFAULTS }; }
}

function saveToStorage(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

let _state = loadFromStorage();

const _listeners = new Set();

export function getVIState() { return _state; }
export function setVIState(patch) {
  _state = typeof patch === 'function'
    ? patch(_state)
    : { ..._state, ...patch };
  saveToStorage(_state);
  _listeners.forEach(fn => fn(_state));
}

/** React hook — re-renders on any store change. */
export function useVIStore() {
  const [s, setS] = useState(_state);

  const setSRef = useRef(setS);
  setSRef.current = setS;

  useEffect(() => {
    const listener = (newState) => setSRef.current(newState);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [s, setVIState];
}
