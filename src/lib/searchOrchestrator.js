/**
 * searchOrchestrator.js — Intent-aware, one-result-per-entity search results.
 *
 *  ARTIST  : artist result (Bandcamp > Discogs), then the artist's Discogs
 *            releases sorted by weighted rating, then everything else.
 *  RELEASE : matching Discogs release(s) (all distinct versions), then any
 *            matching album that is NOT on Discogs, then everything else.
 *  TITLE   : best matching title (Bandcamp > SoundCloud > YouTube within the
 *            best match tier), then the Discogs release containing it, then
 *            everything else.
 *  GENERAL : no clear intent — relevance order with provider priority.
 *
 * In every case the same title / album is shown once:
 *   albums : Discogs > Bandcamp > SoundCloud > YouTube
 *   titles : Bandcamp > SoundCloud > YouTube
 */

import { rankResults } from './searchRanker';
import { cleanText, parseEntity, matchTier, nameTier, isSameTitle, isSameAlbum, artistsOverlap } from './musicMatch';

const ALBUM_PRIO = { discogs: 0, bandcamp: 1, soundcloud: 2, youtube: 3 };
const TRACK_PRIO = { bandcamp: 0, soundcloud: 1, youtube: 2, discogs: 3 };
const ARTIST_PRIO = { bandcamp: 0, discogs: 1, soundcloud: 2, youtube: 3 };

function kindOf(item) {
  const et = (item.entityType || 'track').toLowerCase();
  if (et === 'artist') return 'artist';
  if (et === 'label') return 'label';
  if (et === 'release' || et === 'album' || et === 'playlist') return 'album';
  return 'track';
}

function prio(item) {
  const p = (item.provider || '').toLowerCase();
  const k = item._kind;
  const map = k === 'track' ? TRACK_PRIO : (k === 'album' ? ALBUM_PRIO : ARTIST_PRIO);
  return map[p] ?? 9;
}

const isDiscogs = (i) => i.provider === 'discogs';
const isMaster = (i) => isDiscogs(i) && i.type === 'master';
const isDiscogsSingle = (i) => isDiscogs(i) && (i.formats || []).some(f => /single/i.test(String(f)));

function versionKey(i) {
  const label = Array.isArray(i.labels) ? (i.labels[0] || '') : (i.label || '');
  return `${i.year || ''}|${cleanText(label)}|${cleanText((i.formats || []).join(' '))}`;
}

/** Attach parsed entity, kind and match tier to every item. */
function annotate(query, items) {
  return items.map(item => {
    const _kind = kindOf(item);
    let _ent, _tier;
    if (_kind === 'artist' || _kind === 'label') {
      _ent = { artist: cleanText(item.title), title: cleanText(item.title), uploader: '' };
      _tier = nameTier(query, item.title);
    } else {
      // Discogs titles are already split into artist + release; don't re-split on dashes
      _ent = parseEntity(item.title, item.artistName || item.channelTitle || '', { splitDash: !isDiscogs(item) });
      _tier = matchTier(query, _ent);
    }
    return { ...item, _kind, _ent, _tier };
  });
}

/** Are a and b the same entity (so only one should be shown)? */
function isDuplicate(a, b, { ignoreVersions = false } = {}) {
  if (a._kind === 'artist' || a._kind === 'label') {
    return a._kind === b._kind && !!a._ent.title && a._ent.title === b._ent.title;
  }
  if (a._kind === 'album' && b._kind === 'album') {
    if (!isSameAlbum(a._ent, b._ent)) return false;
    if (isDiscogs(a) && isDiscogs(b) && !ignoreVersions) {
      // Distinct Discogs versions (repress, remaster, other label/format) are all kept.
      // A master is a duplicate of its own versions.
      if (isMaster(a) || isMaster(b)) return true;
      return versionKey(a) === versionKey(b);
    }
    return true;
  }
  if (a._kind === 'track' && b._kind === 'track') return isSameTitle(a._ent, b._ent);
  // Album vs track: a YouTube/SoundCloud upload titled like the album is a full-album upload
  const [alb, trk] = a._kind === 'album' ? [a, b] : [b, a];
  if (alb._kind === 'album' && trk._kind === 'track'
      && (trk.provider === 'youtube' || trk.provider === 'soundcloud' || alb.entityType === 'playlist')) {
    return isSameAlbum(alb._ent, trk._ent);
  }
  return false;
}

/** b replaces a when b is the better source for the same entity. */
function isBetter(b, a) {
  if (a._kind !== b._kind) {
    const alb = a._kind === 'album' ? a : b;
    if (alb.entityType === 'playlist') return b._kind === 'track'; // a song beats a user playlist named after it
    return b._kind === 'album';                                    // an album beats a full-album upload
  }
  if (a._kind === 'album' && isMaster(a) && isDiscogs(b) && !isMaster(b)) return true; // show versions, hide master
  return prio(b) < prio(a);
}

/**
 * Remove duplicates from `list` (kept in order). Items duplicating a pinned
 * item are dropped; among unpinned duplicates the best source wins and takes
 * the position of the first one seen.
 */
function dedupe(pinned, list, opts) {
  const out = [];
  for (const it of list) {
    if (pinned.some(p => p === it || isDuplicate(p, it, opts))) continue;
    const idx = out.findIndex(o => isDuplicate(o, it, opts));
    if (idx === -1) out.push(it);
    else if (isBetter(it, out[idx])) out[idx] = it;
  }
  return out;
}

/** Relevance order: match tier, then provider priority, then text score. */
function sortRest(query, items) {
  if (items.length === 0) return items;
  const ranked = rankResults(query, items);
  return [...ranked].sort((a, b) =>
    (b._tier - a._tier) || (prio(a) - prio(b)) || ((b._score || 0) - (a._score || 0)));
}

// Outside the pinned block, list one entry per album (no repress/remaster floods)
const REST_OPTS = { ignoreVersions: true };

function maxTier(items) {
  return items.reduce((m, i) => Math.max(m, i._tier), 0);
}

/**
 * Work out what the user searched for.
 * Returns { intent, artistPick, discogsArtist, bestTrack, ... } — everything
 * needed to build the list and to decide which follow-up fetches to make.
 */
export function analyzeSearch(query, rawItems) {
  const items = annotate(query, rawItems);
  const artists = items.filter(i => i._kind === 'artist');
  const albums = items.filter(i => i._kind === 'album');
  const tracks = items.filter(i => i._kind === 'track');

  const exactArtists = artists.filter(i => i._tier === 3);
  if (exactArtists.length > 0) {
    const artistPick = [...exactArtists].sort((a, b) => prio(a) - prio(b))[0];
    const discogsArtist = exactArtists.find(isDiscogs) || null;
    return { intent: 'artist', items, artistPick, discogsArtist };
  }

  // User-made playlists (often named after a song) never decide the intent
  const releaseLike = albums.filter(i => i.entityType !== 'playlist');
  const releaseTier = maxTier(releaseLike);
  const trackTier = maxTier(tracks);
  const topReleases = releaseLike.filter(i => i._tier === releaseTier);
  const onlySingles = topReleases.length > 0 && topReleases.every(i => isDiscogsSingle(i) || i.provider !== 'discogs')
    && topReleases.some(isDiscogsSingle);

  if (releaseTier >= 2 && releaseTier >= trackTier && !(onlySingles && trackTier === releaseTier)) {
    return { intent: 'release', items, releaseTier };
  }

  if (trackTier >= 2) {
    const bestTrack = pickBestTrack(tracks, trackTier, query);
    const instantRelease = findReleaseForTrack(bestTrack, albums);
    return { intent: 'title', items, bestTrack, instantRelease };
  }

  return { intent: 'general', items };
}

function pickBestTrack(tracks, tier, query) {
  const candidates = tracks.filter(t => t._tier === tier);
  const ranked = rankResults(query, candidates);
  const best = [...ranked].sort((a, b) => (prio(a) - prio(b)) || ((b._score || 0) - (a._score || 0)))[0];
  if (!best) return null;
  // If a higher-priority provider has the very same song (at any tier), use it.
  const upgrade = tracks
    .filter(t => isSameTitle(t._ent, best._ent) && prio(t) < prio(best))
    .sort((a, b) => prio(a) - prio(b))[0];
  return upgrade || best;
}

/** Find the release a track belongs to among already-loaded results. */
function findReleaseForTrack(track, albums) {
  if (!track) return null;
  const discogsAlbums = albums.filter(isDiscogs);
  // 1. A Discogs single of this exact song
  const single = discogsAlbums.find(a => isDiscogsSingle(a) && isSameAlbum(a._ent, track._ent));
  if (single) return single;
  // 2. The Bandcamp track's own album, if it's on Discogs (or at least on Bandcamp)
  if (track.albumName) {
    const parsed = parseEntity(track.albumName, '', { splitDash: false });
    const albumEnt = { artist: track._ent.artist, title: parsed.title, uploader: track._ent.uploader };
    const onDiscogs = discogsAlbums.filter(a => isSameAlbum(a._ent, albumEnt))
      .sort((a, b) => (isMaster(b) - isMaster(a)) || ((Number(a.year) || 9999) - (Number(b.year) || 9999)));
    if (onDiscogs.length) return onDiscogs[0];
  }
  return null;
}

/**
 * Build the final ordered list.
 * @param analysis  result of analyzeSearch()
 * @param extras    { artistReleases: [...] | null, trackRelease: {...} | null } (raw, un-annotated)
 */
export function buildResults(query, analysis, extras = {}) {
  const { intent, items } = analysis;

  if (intent === 'artist') {
    const { artistPick } = analysis;
    const artistName = artistPick._ent.title;
    const byArtist = (i) => artistsOverlap(i._ent.artist, artistName) || artistsOverlap(i._ent.uploader, artistName);

    let releases;
    if (extras.artistReleases && extras.artistReleases.length > 0) {
      releases = annotate(query, extras.artistReleases);
    } else {
      // Interim (ratings still loading): artist's Discogs releases from the search, one per album, most collected first
      const interim = items.filter(i => i._kind === 'album' && isDiscogs(i) && byArtist(i));
      releases = dedupe([], [...interim].sort((a, b) => (b.have || 0) - (a.have || 0)), { ignoreVersions: true });
    }
    const bcOnly = dedupe(releases, items.filter(i => i._kind === 'album' && i.provider === 'bandcamp' && byArtist(i)));
    const pinned = [artistPick, ...releases, ...bcOnly];

    // Artist view shows one entry per album: drop other versions of pinned releases
    const rest = items.filter(i => !pinned.includes(i)
      && !(i._kind === 'album' && byArtist(i) && pinned.some(p => p._kind === 'album' && isDuplicate(p, i, { ignoreVersions: true }))));
    return [...pinned, ...dedupe(pinned, sortRest(query, rest), REST_OPTS)];
  }

  if (intent === 'release') {
    const { releaseTier } = analysis;
    const matching = items.filter(i => i._kind === 'album' && i.entityType !== 'playlist' && i._tier >= releaseTier);
    const discogsMatches = dedupe([], matching.filter(isDiscogs)
      .sort((a, b) => (b._tier - a._tier) || ((Number(a.year) || 9999) - (Number(b.year) || 9999))));
    const others = dedupe(discogsMatches, matching.filter(i => !isDiscogs(i)).sort((a, b) => prio(a) - prio(b)));
    const pinned = [...discogsMatches, ...others];
    const rest = items.filter(i => !pinned.includes(i));
    return [...pinned, ...dedupe(pinned, sortRest(query, rest), REST_OPTS)];
  }

  if (intent === 'title') {
    const { bestTrack } = analysis;
    let release = analysis.instantRelease;
    if (!release && extras.trackRelease) {
      const [annotated] = annotate(query, [extras.trackRelease]);
      // Prefer an already-loaded copy of the same release (keeps its id/artwork)
      release = items.find(i => i._kind === 'album' && isDiscogs(i) && isDuplicate(i, annotated)) || annotated;
    }
    const pinned = [bestTrack, release].filter(Boolean);
    const rest = items.filter(i => !pinned.includes(i));
    return [...pinned, ...dedupe(pinned, sortRest(query, rest), REST_OPTS)];
  }

  return dedupe([], sortRest(query, items), REST_OPTS);
}

/** Strip internal fields before handing items to the UI (keeps _score for debugging). */
export function stripInternal(list) {
  return list.map(({ _kind, _ent, _tier, ...rest }) => rest);
}
