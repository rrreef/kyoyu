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
 * are treated as separate items and all kept — but ONLY within Discogs.
 * Cross-provider, a Bandcamp album with the same artist+title as a Discogs
 * release is always dropped in favour of the Discogs release.
 */

import { normalize } from './searchRanker';

// Priority maps — lower number = higher priority
const ALBUM_PRIORITY = { discogs: 0, bandcamp: 1, soundcloud: 2, youtube: 3 };
const TRACK_PRIORITY = { bandcamp: 0, soundcloud: 1, youtube: 2, discogs: 3 };

/**
 * Extra normalization for music search: strip common noise words
 * that differ across providers but refer to the same content.
 */
function cleanTitle(str) {
  if (!str) return '';
  let s = normalize(str);
  // Strip common YouTube/SoundCloud suffixes
  s = s.replace(/\b(official\s*(audio|video|music\s*video|visualizer|lyric\s*video)?)\b/g, '');
  s = s.replace(/\b(full\s*album|album\s*stream|hq|hd|remastered|remaster)\b/g, '');
  s = s.replace(/\b(feat|ft)\b\.?\s*/g, '');
  s = s.replace(/[\[\]()]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Build a BASE fingerprint for cross-provider grouping.
 * No year/label — those are only used to differentiate Discogs versions
 * WITHIN a group, after cross-provider dedup has happened.
 */
function baseFingerprint(item) {
  const et = (item.entityType || 'track').toLowerCase();

  // Artists and labels: unique per provider (never cross-provider deduped)
  if (et === 'artist' || et === 'label') {
    return `${et}|${item.provider}|${item.id}`;
  }

  const artist = cleanTitle(item.artistName || item.channelTitle || '');
  const title = cleanTitle(item.title || '');

  if (!artist && !title) return `unique|${item.id || Math.random()}`;

  // Playlists, albums, and releases all share the same namespace
  // so a SoundCloud playlist "Album Name" dedupes against a Discogs release "Album Name"
  if (et === 'release' || et === 'album' || et === 'playlist') {
    return `release|${artist}|${title}`;
  }

  // Individual tracks
  return `track|${artist}|${title}`;
}

/**
 * Build a VERSION fingerprint for differentiating Discogs releases
 * of the same album (represses, remasters, different labels).
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

/**
 * Get the priority number for an item (lower = higher priority).
 */
function getPriority(item) {
  const et = (item.entityType || 'track').toLowerCase();
  const provider = (item.provider || '').toLowerCase();

  if (et === 'release' || et === 'album' || et === 'playlist') {
    return ALBUM_PRIORITY[provider] ?? 99;
  }
  return TRACK_PRIORITY[provider] ?? 99;
}

/**
 * Deduplicate an array of search results.
 *
 * Two-pass approach:
 * 1. Group by base fingerprint (artist + title, no version info)
 * 2. Within each group:
 *    - If any Discogs items exist, keep ALL unique Discogs versions (by year/label)
 *      and drop everything else (Bandcamp, SoundCloud, YouTube duplicates)
 *    - If no Discogs items, keep only the single highest-priority item
 *
 * @param {Array} items - The allExternal array from Search.jsx
 * @returns {Array} - Deduplicated array
 */
export function deduplicateResults(items) {
  if (!items || items.length === 0) return items || [];

  // Pass 1: group by base fingerprint
  const groups = new Map();
  for (const item of items) {
    const key = baseFingerprint(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  // Pass 2: within each group, decide what to keep
  const kept = new Set();
  for (const [, group] of groups) {
    if (group.length === 1) {
      kept.add(group[0]);
      continue;
    }

    const discogsItems = group.filter(i => i.provider === 'discogs');

    if (discogsItems.length > 0) {
      // Keep all unique Discogs versions (differentiated by year+label)
      const seenVersions = new Set();
      for (const d of discogsItems) {
        const vk = versionKey(d);
        if (!seenVersions.has(vk)) {
          seenVersions.add(vk);
          kept.add(d);
        }
      }
      // Drop all non-Discogs items in this group (they're duplicates)
    } else {
      // No Discogs: keep only the highest-priority item
      group.sort((a, b) => getPriority(a) - getPriority(b));
      kept.add(group[0]);
    }
  }

  // Return items in their original order, filtering to only kept items
  return items.filter(item => kept.has(item));
}
