/**
 * searchDedup.js — Cross-provider deduplication for unified search results.
 *
 * Groups results by normalized (artist, title) fingerprint and keeps only
 * the highest-priority provider per group.
 *
 * Priority for albums/releases: discogs > bandcamp > soundcloud > youtube
 * Priority for individual tracks: bandcamp > soundcloud > youtube
 *
 * Different versions of the same album (different year, label, or format)
 * are treated as separate items — but ONLY within Discogs.
 */

import { normalize } from './searchRanker';

const ALBUM_PRIORITY = { discogs: 0, bandcamp: 1, soundcloud: 2, youtube: 3 };
const TRACK_PRIORITY = { bandcamp: 0, soundcloud: 1, youtube: 2, discogs: 3 };

/**
 * Aggressively clean and normalize a string for matching.
 */
function clean(str) {
  if (!str) return '';
  let s = normalize(str);
  // Strip common noise suffixes
  s = s.replace(/\b(official\s*(audio|video|music\s*video|visualizer|lyric\s*video)?)\b/g, '');
  s = s.replace(/\b(full\s*album|album\s*stream|hq|hd|remastered|remaster|original\s*mix)\b/g, '');
  s = s.replace(/\b(feat|ft|featuring)\b\.?\s*/g, '');
  s = s.replace(/\b(vevo|topic)\b/g, '');
  s = s.replace(/[\[\](){}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Build a token-bag key: combine artist + title, split into sorted unique tokens.
 * This makes "Artist - Track Name" match artist="Artist" title="Track Name"
 * regardless of which field the words end up in.
 */
function tokenBag(artist, title) {
  const combined = `${artist} ${title}`.trim();
  const tokens = combined.split(/\s+/).filter(Boolean);
  // Deduplicate and sort
  return [...new Set(tokens)].sort().join(' ');
}

/**
 * Build a fingerprint for grouping duplicates.
 */
function fingerprint(item) {
  const et = (item.entityType || 'track').toLowerCase();

  // Artists and labels: never cross-provider deduped
  if (et === 'artist' || et === 'label') {
    return `${et}|${item.provider}|${item.id}`;
  }

  const artist = clean(item.artistName || item.channelTitle || '');
  const title = clean(item.title || '');

  if (!artist && !title) return `unique|${item.id || Math.random()}`;

  // Use token-bag so word order and field placement don't matter
  const bag = tokenBag(artist, title);

  // Playlists, albums, and releases share the same namespace
  if (et === 'release' || et === 'album' || et === 'playlist') {
    return `release|${bag}`;
  }

  return `track|${bag}`;
}

/**
 * Discogs version key for differentiating represses/remasters.
 */
function versionKey(item) {
  if (item.provider !== 'discogs') return '';
  const year = item.year || '';
  const label = normalize(
    Array.isArray(item.labels) ? (item.labels[0] || '') :
    (typeof item.label === 'string' ? item.label : '')
  );
  return `${year}|${label}`;
}

function getPriority(item) {
  const et = (item.entityType || 'track').toLowerCase();
  const provider = (item.provider || '').toLowerCase();
  if (et === 'release' || et === 'album' || et === 'playlist') {
    return ALBUM_PRIORITY[provider] ?? 99;
  }
  return TRACK_PRIORITY[provider] ?? 99;
}

/**
 * Deduplicate search results.
 *
 * 1. Group by fingerprint (token-bag of artist + title)
 * 2. Within each group:
 *    - If Discogs items exist → keep all unique Discogs versions, drop everything else
 *    - Otherwise → keep only the single highest-priority item
 */
export function deduplicateResults(items) {
  if (!items || items.length === 0) return items || [];

  const groups = new Map();
  for (const item of items) {
    const key = fingerprint(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const kept = new Set();
  for (const [, group] of groups) {
    if (group.length === 1) {
      kept.add(group[0]);
      continue;
    }

    const discogsItems = group.filter(i => i.provider === 'discogs');

    if (discogsItems.length > 0) {
      // Keep all unique Discogs versions, drop everything else
      const seenVersions = new Set();
      for (const d of discogsItems) {
        const vk = versionKey(d);
        if (!seenVersions.has(vk)) {
          seenVersions.add(vk);
          kept.add(d);
        }
      }
    } else {
      // No Discogs: keep only the highest-priority item
      group.sort((a, b) => getPriority(a) - getPriority(b));
      kept.add(group[0]);
    }
  }

  return items.filter(item => kept.has(item));
}
