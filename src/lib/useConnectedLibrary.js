import { useEffect, useState } from 'react';
import { fetchAccountLibrary, isStreamingAvailable, onStreamingEvent, useStreamingStatus } from './streaming';

/* Library data from connected SoundCloud / Bandcamp accounts, fetched automatically as soon as an account is
   connected, cached for the session and refreshed in the background (so the Library is always up to date). */

let cache = { soundcloud: {}, bandcamp: {}, spotify: {}, applemusic: {}, tidal: {}, discogs: {}, youtube: {} };      // service → kind → items
let errors = {};                                    // "service:kind" → message of the last failed load
const fetchedAt = {};                               // "service:kind" → ms
const inflight = new Map();
const listeners = new Set();
const STALE_MS = 5 * 60 * 1000;
const emit = () => listeners.forEach((fn) => fn());

async function ensure(service, kind, force = false) {
  const k = `${service}:${kind}`;
  if (!force && cache[service]?.[kind] && Date.now() - (fetchedAt[k] || 0) < STALE_MS) return;
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

function extractDiscogsRelId(str = '') {
  const s = String(str);
  const m = s.match(/dg-t-(\d+)-\d+/) || s.match(/(?:dg|discogs)-(?:order-)?(\d+)/) || s.match(/\/release\/(\d+)/);
  return m ? m[1] : '';
}

function extractYouTubeVid(str = '') {
  const s = String(str);
  const m = s.match(/^(?:yt|youtube)-([A-Za-z0-9_-]{11})$/) || s.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function matchesItem(entry, targetId, targetUrl = '') {
  if (!entry) return false;
  const eid = String(entry.id || '');
  const tid = String(targetId || '');
  if (eid && tid && eid === tid) return true;
  if (targetUrl && (entry.trackUrl === targetUrl || entry.permalinkUrl === targetUrl || entry.url === targetUrl)) return true;
  const d1 = extractDiscogsRelId(eid);
  const d2 = extractDiscogsRelId(tid) || extractDiscogsRelId(targetUrl);
  if (d1 && d2 && d1 === d2) return true;
  const y1 = entry.videoId || extractYouTubeVid(eid);
  const y2 = extractYouTubeVid(tid) || extractYouTubeVid(targetUrl);
  if (y1 && y2 && y1 === y2) return true;
  return false;
}

/** Check if a track or album ID is currently in any connected account's likes / wishlist. */
export function isItemInConnectedLikes(idOrItem) {
  const rawId = typeof idOrItem === 'object' ? (idOrItem?.id || '') : idOrItem;
  const rawUrl = typeof idOrItem === 'object' ? (idOrItem?.trackUrl || idOrItem?.providerUrl || idOrItem?.url || '') : '';
  const cleanId = String(rawId || '').split('?ts=')[0];
  if (!cleanId && !rawUrl) return false;

  const lists = [
    cache.bandcamp?.wishlist,
    cache.soundcloud?.likes,
    cache.discogs?.wishlist,
    cache.spotify?.likes,
    cache.spotify?.albums,
    cache.applemusic?.likes,
    cache.applemusic?.albums,
    cache.tidal?.likes,
    cache.tidal?.albums,
    cache.youtube?.likes,
    cache.youtube?.albums,
  ];
  for (const list of lists) {
    if (Array.isArray(list) && list.some((it) => matchesItem(it, cleanId, rawUrl))) {
      return true;
    }
  }
  return false;
}

if (typeof window !== 'undefined') {
  onStreamingEvent((evt) => {
    if (!evt) return;
    if (evt.type === 'libraryOptimistic' && evt.service) {
      const s = evt.service;
      const bucket =
        s === 'bandcamp' ? 'wishlist' :
        s === 'discogs' ? 'wishlist' :
        s === 'soundcloud' ? 'likes' :
        evt.kind === 'playlist' ? 'playlists' :
        evt.kind === 'album' ? 'albums' : 'likes';
      if (!cache[s]) cache[s] = {};
      const current = Array.isArray(cache[s][bucket]) ? [...cache[s][bucket]] : [];
      const tid = evt.item?.id || evt.itemId || '';
      const turl = evt.url || evt.item?.trackUrl || '';
      if (!evt.liked) {
        cache[s][bucket] = current.filter((it) => !matchesItem(it, tid, turl));
        emit();
      } else if (evt.item && !current.some((it) => matchesItem(it, tid, turl))) {
        const it = evt.item;
        const vid = it.videoId || it.replay?.videoId || it.origin?.videoId || extractYouTubeVid(tid) || extractYouTubeVid(turl);
        const entry = {
          id: tid || it.id,
          provider: s,
          kind: s === 'discogs' ? 'album' : (evt.kind || it.kind || 'track'),
          videoId: vid || undefined,
          title: it.title || it.name || '',
          artistName: it.artistName || it.artist || '',
          artist: it.artistName || it.artist || '',
          artworkUrl: it.artworkUrl || it.cover || it.releaseCover || '',
          cover: it.artworkUrl || it.cover || it.releaseCover || '',
          trackUrl: turl || it.trackUrl || '',
          permalinkUrl: turl || it.permalinkUrl || '',
          url: turl || it.url || '',
        };
        cache[s][bucket] = [entry, ...current];
        emit();
      }
    } else if (evt.type === 'libraryChanged' && evt.service) {
      const s = evt.service;
      const buckets =
        s === 'bandcamp' ? ['wishlist'] :
        s === 'discogs' ? ['wishlist'] :
        s === 'soundcloud' ? ['likes'] :
        s === 'youtube' ? ['likes', 'playlists', 'albums'] :
        ['likes', 'albums'];
      setTimeout(() => {
        for (const b of buckets) {
          delete fetchedAt[`${s}:${b}`];
          ensure(s, b, true);
        }
      }, 700);
    }
  });
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
  const am = !!status?.applemusic?.connected;
  const td = !!status?.tidal?.connected;
  const dg = !!status?.discogs?.connected;
  const yt = !!status?.youtube?.connected;

  useEffect(() => {
    if (!isStreamingAvailable()) return;
    if (bc) {
      ensure('bandcamp', 'collection'); ensure('bandcamp', 'wishlist'); ensure('bandcamp', 'following'); ensure('bandcamp', 'playlists');
    } else if (Object.keys(cache.bandcamp).length) { cache.bandcamp = {}; emit(); }
    if (sc) {
      ensure('soundcloud', 'likes'); ensure('soundcloud', 'playlists'); ensure('soundcloud', 'following');
    } else if (Object.keys(cache.soundcloud).length) { cache.soundcloud = {}; emit(); }
    if (sp) {
      ensure('spotify', 'likes'); ensure('spotify', 'playlists'); ensure('spotify', 'albums'); ensure('spotify', 'following');
    } else if (Object.keys(cache.spotify).length) { cache.spotify = {}; emit(); }
    if (am) {
      ensure('applemusic', 'likes'); ensure('applemusic', 'playlists'); ensure('applemusic', 'albums'); ensure('applemusic', 'following');
    } else if (Object.keys(cache.applemusic || {}).length) { cache.applemusic = {}; emit(); }
    if (td) {
      ensure('tidal', 'likes'); ensure('tidal', 'playlists'); ensure('tidal', 'albums'); ensure('tidal', 'following');
    } else if (Object.keys(cache.tidal || {}).length) { cache.tidal = {}; emit(); }
    if (dg) {
      ensure('discogs', 'collection'); ensure('discogs', 'wishlist'); ensure('discogs', 'purchases');
    } else if (Object.keys(cache.discogs || {}).length) { cache.discogs = {}; emit(); }
    if (yt) {
      ensure('youtube', 'likes'); ensure('youtube', 'playlists'); ensure('youtube', 'albums'); ensure('youtube', 'following');
    } else if (Object.keys(cache.youtube || {}).length) { cache.youtube = {}; emit(); }
  }, [bc, sc, sp, am, td, dg, yt]);

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
    soundcloud: {
      connected: sc,
      likes:     sc ? get('soundcloud', 'likes') : [],
      playlists: sc ? get('soundcloud', 'playlists') : [],
      following: sc ? get('soundcloud', 'following') : [],
    },
    spotify: {
      connected: sp,
      likes:     sp ? get('spotify', 'likes') : [],
      playlists: sp ? get('spotify', 'playlists') : [],
      albums:    sp ? get('spotify', 'albums') : [],
      following: sp ? get('spotify', 'following') : [],
    },
    applemusic: {
      connected: am,
      likes:     am ? get('applemusic', 'likes') : [],
      playlists: am ? get('applemusic', 'playlists') : [],
      albums:    am ? get('applemusic', 'albums') : [],
      following: am ? get('applemusic', 'following') : [],
    },
    tidal: {
      connected: td,
      likes:     td ? get('tidal', 'likes') : [],
      playlists: td ? get('tidal', 'playlists') : [],
      albums:    td ? get('tidal', 'albums') : [],
      following: td ? get('tidal', 'following') : [],
    },
    discogs: {
      connected: dg,
      collection: dg ? get('discogs', 'collection') : [],
      wishlist:   dg ? get('discogs', 'wishlist') : [],
      purchases:  dg ? get('discogs', 'purchases') : [],
    },
    youtube: {
      connected: yt,
      likes:     yt ? get('youtube', 'likes') : [],
      playlists: yt ? get('youtube', 'playlists') : [],
      albums:    yt ? get('youtube', 'albums') : [],
      following: yt ? get('youtube', 'following') : [],
    },
  };
}
