/**
 * Discogs API client for server-side use (Vercel serverless functions).
 * Handles authentication, rate limiting, and response parsing.
 */

const DISCOGS_BASE = 'https://api.discogs.com';
const USER_AGENT = process.env.DISCOGS_USER_AGENT || 'Kyoyu/1.0 +https://ree.fm';
const TOKEN = process.env.DISCOGS_TOKEN;

// Simple in-memory rate limiter (resets per cold start)
let requestLog = [];
const RATE_LIMIT = 55; // stay under 60/min
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit() {
  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) {
    throw new Error('Discogs rate limit reached. Try again shortly.');
  }
  requestLog.push(now);
}

async function discogsGet(path, params = {}) {
  checkRateLimit();
  
  const url = new URL(`${DISCOGS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });
  
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  };
  if (TOKEN) {
    headers['Authorization'] = `Discogs token=${TOKEN}`;
  }
  
  const res = await fetch(url.toString(), { headers });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs API ${res.status}: ${text}`);
  }
  
  return res.json();
}

/**
 * Search the Discogs database.
 * @param {string} query - Search query
 * @param {string} type - Entity type: 'artist', 'release', 'master', 'label'
 * @param {number} page - Page number (default 1)
 * @param {number} perPage - Results per page (default 20, max 100)
 */
export async function search(query, type, page = 1, perPage = 20) {
  return discogsGet('/database/search', {
    q: query,
    type,
    page,
    per_page: perPage,
  });
}

/**
 * Get a specific artist by Discogs ID.
 */
export async function getArtist(id) {
  return discogsGet(`/artists/${id}`);
}

/**
 * Get an artist's releases.
 */
export async function getArtistReleases(id, page = 1, perPage = 50) {
  return discogsGet(`/artists/${id}/releases`, { page, per_page: perPage, sort: 'year', sort_order: 'desc' });
}

/**
 * Get a specific release by Discogs ID.
 */
export async function getRelease(id) {
  return discogsGet(`/releases/${id}`);
}

/**
 * Get a master release by Discogs ID.
 */
export async function getMaster(id) {
  return discogsGet(`/masters/${id}`);
}

/**
 * Get a specific label by Discogs ID.
 */
export async function getLabel(id) {
  return discogsGet(`/labels/${id}`);
}

/**
 * Get a label's releases.
 */
export async function getLabelReleases(id, page = 1, perPage = 50) {
  return discogsGet(`/labels/${id}/releases`, { page, per_page: perPage });
}

/**
 * Classify a URL into a platform name.
 */
export function classifyUrl(url) {
  if (!url) return 'website';
  const u = url.toLowerCase();
  if (u.includes('spotify.com')) return 'spotify';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('bandcamp.com')) return 'bandcamp';
  if (u.includes('soundcloud.com')) return 'soundcloud';
  if (u.includes('deezer.com')) return 'deezer';
  if (u.includes('discogs.com')) return 'discogs';
  if (u.includes('facebook.com')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  return 'website';
}
