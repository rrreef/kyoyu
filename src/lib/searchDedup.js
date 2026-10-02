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
 * are treated as separate items and all kept.
 */

import { normalize } from './searchRanker';

// Priority maps — lower number = higher priority
const ALBUM_PRIORITY = { discogs: 0, bandcamp: 1, soundcloud: 2, youtube: 3 };
const TRACK_PRIORITY = { bandcamp: 0, soundcloud: 1, youtube: 2, discogs: 3 };

/**
 * Build a fingerprint key for grouping duplicates.
 *
 * For albums/releases: "release|{artist}|{title}"
 *   - If year or label differs, append them to differentiate versions
 * For tracks: "track|{artist}|{title}"
 * For artists/labels/playlists: unique key (never deduped cross-provider)
 */
function fingerprint(item) {
  const et = (item.entityType || 'track').toLowerCase();

  // Artists, labels, and playlists are never cross-provider deduped
  if (et === 'artist' || et === 'label' || et === 'playlist') {
    return `${et}|${item.provider}|${item.id}`;
  }

  const artist = normalize(item.artistName || item.channelTitle || '');
  const title = normalize(item.title || '');

  if (!artist && !title) return `unique|${item.id || Math.random()}`;

  if (et === 'release' || et === 'album') {
    // For Discogs releases, include year + first label to differentiate versions
    // (represses, remasters, different labels)
    if (item.provider === 'discogs') {
      const year = item.year || '';
      const label = normalize(
        Array.isArray(item.labels) ? (item.labels[0] || '') :
        (typeof item.label === 'string' ? item.label : '')
      );
      // Only append version info if we actually have it
      const versionSuffix = (year || label) ? `|${year}|${label}` : '';
      return `release|${artist}|${title}${versionSuffix}`;
    }
    return `release|${artist}|${title}`;
  }

  // Track
  return `track|${artist}|${title}`;
}

/**
 * Get the priority number for an item (lower = higher priority).
 */
function getPriority(item) {
  const et = (item.entityType || 'track').toLowerCase();
  const provider = (item.provider || '').toLowerCase();

  if (et === 'release' || et === 'album') {
    return ALBUM_PRIORITY[provider] ?? 99;
  }
  return TRACK_PRIORITY[provider] ?? 99;
}

/**
 * Deduplicate an array of search results.
 *
 * Groups by fingerprint, keeps only the highest-priority item per group.
 * Maintains the original order of the kept items.
 *
 * @param {Array} items - The allExternal array from Search.jsx
 * @returns {Array} - Deduplicated array
 */
export function deduplicateResults(items) {
  if (!items || items.length === 0) return items || [];

  // Group items by fingerprint
  const groups = new Map();

  for (const item of items) {
    const key = fingerprint(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  // For each group, pick the highest-priority item
  const kept = new Set();
  for (const [, group] of groups) {
    // Sort by priority (ascending = highest priority first)
    group.sort((a, b) => getPriority(a) - getPriority(b));
    kept.add(group[0]);
  }

  // Return items in their original order, filtering to only kept items
  return items.filter(item => kept.has(item));
}
