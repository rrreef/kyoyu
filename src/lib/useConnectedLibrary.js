import { useEffect, useState } from 'react';
import { fetchAccountLibrary, isStreamingAvailable, useStreamingStatus } from './streaming';

/* Library data from connected SoundCloud / Bandcamp accounts, fetched automatically as soon as an account is
   connected, cached for the session and refreshed in the background (so the Library is always up to date). */

let cache = { soundcloud: {}, bandcamp: {}, spotify: {} };      // service → kind → items
let errors = {};                                    // "service:kind" → message of the last failed load
const fetchedAt = {};                               // "service:kind" → ms
const inflight = new Map();
const listeners = new Set();
const STALE_MS = 5 * 60 * 1000;
const emit = () => listeners.forEach((fn) => fn());

async function ensure(service, kind) {
  const k = `${service}:${kind}`;
  if (cache[service]?.[kind] && Date.now() - (fetchedAt[k] || 0) < STALE_MS) return;
  if (inflight.has(k)) return;
  const p = fetchAccountLibrary(service, kind)
    .then((items) => {
      if (!cache[service]) cache[service] = {};
      cache[service][kind] = items;
      fetchedAt[k] = Date.now();
      delete errors[k];
    })
    .catch((e) => {
      errors[k] = e?.message || 'Could not load';
      if (!cache[service]) cache[service] = {};
      if (!cache[service][kind]) cache[service][kind] = [];
    })
    .finally(() => { inflight.delete(k); emit(); });
  inflight.set(k, p);
}

export function useConnectedLibrary() {
  const status = useStreamingStatus();
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const bc = !!status?.bandcamp?.connected;
  const sc = !!status?.soundcloud?.connected;
  const sp = !!status?.spotify?.connected;

  useEffect(() => {
    if (!isStreamingAvailable()) return;
    if (bc) {
      ensure('bandcamp', 'collection'); ensure('bandcamp', 'wishlist'); ensure('bandcamp', 'following'); ensure('bandcamp', 'playlists');
    } else if (Object.keys(cache.bandcamp).length) { cache.bandcamp = {}; emit(); }
    if (sc) { ensure('soundcloud', 'likes'); ensure('soundcloud', 'playlists'); }
    else if (Object.keys(cache.soundcloud).length) { cache.soundcloud = {}; emit(); }
    if (sp) {
      ensure('spotify', 'likes'); ensure('spotify', 'playlists'); ensure('spotify', 'albums'); ensure('spotify', 'following');
    } else if (Object.keys(cache.spotify).length) { cache.spotify = {}; emit(); }
  }, [bc, sc, sp]);

  const get = (service, kind) => (cache[service]?.[kind] || []);
  const loading = inflight.size > 0;

  return {
    loading,
    errors,
    bandcamp: {
      connected: bc,
      collection: bc ? get('bandcamp', 'collection') : [],
      wishlist:   bc ? get('bandcamp', 'wishlist') : [],
      following:  bc ? get('bandcamp', 'following') : [],
      playlists:  bc ? get('bandcamp', 'playlists') : [],
    },
    soundcloud: { connected: sc, likes: sc ? get('soundcloud', 'likes') : [], playlists: sc ? get('soundcloud', 'playlists') : [] },
    spotify: {
      connected: sp,
      likes:     sp ? get('spotify', 'likes') : [],
      playlists: sp ? get('spotify', 'playlists') : [],
      albums:    sp ? get('spotify', 'albums') : [],
      following: sp ? get('spotify', 'following') : [],
    },
  };
}
