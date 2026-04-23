/**
 * Lightweight reactive store for Visual Identity data.
 * Works without a Context provider — just import and use the hook.
 * Blob URLs are valid for the current browser session.
 *
 * IMPORTANT: listeners are stored as stable wrapper functions (ref-backed)
 * so the store survives React Fast Refresh HMR updates without losing
 * subscriber registrations.
 */
import { useState, useEffect, useRef } from 'react';

let _state = {
  coverImage:    null,
  coverPosition: { x: 50, y: 50 },
  avatarImage:   null,
  avatarPosition: { x: 50, y: 50 },
  displayMode:   'prominent',
  primary:       '#9b6dff',
  secondary:     '#29b6f6',
  links:         [],
  artworks:      [],   // { url, label, placement, position, fit }[]
  bio:           '',   // editable artist bio
};

const _listeners = new Set();

export function getVIState()    { return _state; }
export function setVIState(patch) {
  _state = typeof patch === 'function'
    ? patch(_state)
    : { ..._state, ...patch };
  _listeners.forEach(fn => fn(_state));
}

/** React hook — re-renders on any store change.
 *  Uses a stable wrapper ref so React Fast Refresh HMR doesn't leave stale listeners. */
export function useVIStore() {
  const [s, setS] = useState(_state);

  // Keep a mutable ref to the latest setS — updated every render
  const setSRef = useRef(setS);
  setSRef.current = setS;

  useEffect(() => {
    const listener = (newState) => setSRef.current(newState);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [s, setVIState];
}
