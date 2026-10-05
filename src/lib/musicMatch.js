/**
 * musicMatch.js — Shared "is this the same title / album?" logic.
 *
 * Used by the search orchestrator (one result per title/album) and by the
 * Discogs album sheet playback chain (pick the right Bandcamp / SoundCloud /
 * YouTube track for a Discogs tracklist entry).
 */

import { normalize } from './searchRanker';

const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'of']);

// Parenthesised / bracketed segments made only of these words are noise.
const NOISE_SEGMENT = /^(official|audio|video|music|lyrics?|lyric|visuali[sz]er|hq|hd|4k|original|mix|full|album|ep|lp|stream|out|now|free|download|dl|premiere|exclusive|clip|explicit|clean|remastered|remaster|snippets?|preview|teaser|\d{4}|topic|vevo|\s)+$/;
// (…) segments containing these words describe a different VERSION of the song — keep them.
const VERSION_WORDS = /\b(remix|rmx|edit|mix|mixed|live|rework|version|dub|vip|instrumental|acoustic|cover|bootleg|flip|demo|extended|radio|club|reprise|outro|intro|interlude|session|sessions|unplugged|stripped|slowed|sped|reverb)\b/;
// (…) segments with these words identify WHICH part of a work — keep them.
const PART_WORDS = /\b(pt|part|vol|volume|chapter|no|op|book|side)\b/;
const VERSION_TOKENS = new Set(['remix', 'rmx', 'edit', 'mix', 'mixed', 'live', 'rework', 'version', 'dub', 'vip', 'bootleg', 'flip', 'cover', 'acoustic', 'instrumental', 'extended', 'reprise', 'improv', 'slowed', 'sped']);
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function stripDiscogsArtistSuffix(s) {
  // "Artist (2)" -> "Artist", "Artist*" -> "Artist"
  return (s || '').replace(/\s*\(\d+\)\s*$/, '').replace(/\*+$/, '');
}

/**
 * Clean a free-text string for comparison: lowercase, no diacritics,
 * no punctuation, '&' -> 'and', noise words removed.
 */
export function cleanText(str) {
  if (!str) return '';
  let s = stripDiscogsArtistSuffix(decodeEntities(String(str))).replace(/&/g, ' and ');
  s = normalize(s);
  // "Part I" / "Pt. 1" / "pt 1" -> "pt 1";  "Volume II" -> "vol 2"
  s = s.replace(/\bpart\b/g, 'pt').replace(/\bvolume\b/g, 'vol');
  s = s.replace(/\b(pt|vol|chapter|no|book)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (m, k, r) => `${k} ${ROMAN[r]}`);
  s = s.replace(/\b(full\s+(ep|lp)|snippets?|preview|teaser)\b/g, ' ').replace(/\s+full$/, '');
  s = s.replace(/\b(official\s+(audio|video|music\s+video|visuali[sz]er|lyric\s+video))\b/g, ' ');
  s = s.replace(/\b(original\s+mix|full\s+album|album\s+stream|free\s+download|out\s+now)\b/g, ' ');
  s = s.replace(/\b(feat|ft|featuring|vevo|topic|hq|hd)\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Remove "PREMIERE:" prefixes, [label/catno] blocks and noise-only (…) blocks. */
function precleanTitle(raw) {
  let t = decodeEntities(String(raw || ''));
  t = t.replace(/^\s*(premiere|exclusive|free\s*download|out\s*now)\s*[:|\-–—]\s*/i, '');
  t = t.replace(/\[[^\]]*\]/g, ' ');                       // [Label] [CAT001]
  // (Official Audio) -> removed; (X Remix) / (Pt. I) -> kept; (I, II & III) / (10 Year Anniversary) -> removed
  t = t.replace(/\(([^)]*)\)/g, (m, inner) => {
    const n = normalize(inner);
    if (!n || NOISE_SEGMENT.test(n)) return ' ';
    if (VERSION_WORDS.test(n) || PART_WORDS.test(n)) return m;
    return ' ';
  });
  return t;
}

export function tokens(str) {
  return new Set(cleanText(str).split(' ').filter(w => w && !STOPWORDS.has(w)));
}

function tokenSet(cleaned) {
  return new Set((cleaned || '').split(' ').filter(w => w && !STOPWORDS.has(w)));
}

function isSubset(a, b) {
  if (a.size === 0) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function union(...sets) {
  const out = new Set();
  for (const s of sets) for (const x of s) out.add(x);
  return out;
}

/**
 * Split an item's (title, artistName) into a real artist + core title.
 * Handles uploads like  title: "Artist - Track"  artistName: "Some Label".
 */
export function parseEntity(title, artistName, { splitDash = true } = {}) {
  const uploader = cleanText(artistName);
  const t = precleanTitle(title);
  const sep = splitDash ? t.match(/\s+[-–—|]\s+/) : null;
  if (sep) {
    const left = cleanText(t.slice(0, sep.index));
    const right = cleanText(t.slice(sep.index + sep[0].length));
    if (left && right) {
      return { artist: left, title: right, uploader };
    }
  }
  return { artist: uploader, title: cleanText(t), uploader };
}

/** True if the two artist strings refer to the same artist (or one is a subset, e.g. "A" vs "A and B"). */
export function artistsOverlap(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return false;
  return isSubset(A, B) || isSubset(B, A);
}

function entityArtistMatch(x, y) {
  return artistsOverlap(x.artist, y.artist)
    || artistsOverlap(x.artist, y.uploader)
    || artistsOverlap(x.uploader, y.artist);
}

const ROMAN_TOKEN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
function identityTokens(str) {
  const out = new Set();
  for (const w of tokenSet(str)) if (!ROMAN_TOKEN.test(w)) out.add(w);
  return out;
}
function setEq(a, b) {
  return a.size > 0 && a.size === b.size && isSubset(a, b);
}

/**
 * Same song: identical core title + overlapping artist. Remix/version tags are part of the core title.
 * Also catches uploads whose artist is embedded in the title without a "-" separator
 * ("Floating Points * Silhouettes", "Says • Nils Frahm"): same set of artist+title words.
 */
export function isSameTitle(x, y) {
  if (!x.title || !y.title) return false;
  if (x.title === y.title && entityArtistMatch(x, y)) return true;
  const xFull = identityTokens(`${x.artist} ${x.title}`), yFull = identityTokens(`${y.artist} ${y.title}`);
  const xTitle = identityTokens(x.title), yTitle = identityTokens(y.title);
  return setEq(xFull, yFull) || setEq(xTitle, yFull) || setEq(xFull, yTitle);
}

/** Same album: identical core album title + overlapping artist. */
export const isSameAlbum = isSameTitle;

/**
 * How well does an entity match the query?
 *  3 = exact: every title word is in the query and every query word is an artist or title word
 *  2 = close: every query word is an artist/title word and the query hits the title
 *  1 = loose: every query word appears somewhere (artist, uploader, title)
 *  0 = no match
 */
export function matchTier(query, ent) {
  const Q = tokens(query);
  if (Q.size === 0 || !ent) return 0;
  const T = tokenSet(ent.title);
  const A = tokenSet(ent.artist);
  const U = tokenSet(ent.uploader);
  const AT = union(A, T);
  // A remix/edit/live version is never an exact match unless the query asks for that version
  const versionMismatch = [...AT].some(w => VERSION_TOKENS.has(w) && !Q.has(w));
  if (T.size > 0 && isSubset(T, Q) && isSubset(Q, AT) && !versionMismatch) return 3;
  if (isSubset(Q, AT)) {
    for (const q of Q) if (T.has(q) && !A.has(q)) return 2;
  }
  if (isSubset(Q, union(AT, U))) return 1;
  return 0;
}

/** Artist/label name vs query: 3 = same name, 1 = query words all in name. */
export function nameTier(query, name) {
  const qn = cleanText(query), nn = cleanText(name);
  if (!qn || !nn) return 0;
  if (qn === nn) return 3;
  const Q = tokenSet(qn), N = tokenSet(nn);
  if (Q.size === N.size && isSubset(Q, N)) return 3;
  if (isSubset(Q, N)) return 1;
  return 0;
}

/** Strip a Discogs tracklist position prefix: "A1. Title" / "2. Title" / "1-3. Title" -> "Title". */
export function stripTrackPosition(title) {
  return String(title || '').replace(/^\s*(?:[A-Z]{1,2}\d+[a-z]?|\d+(?:[-.]\d+)?[a-z]?|[A-Z])\.\s+/, '');
}
