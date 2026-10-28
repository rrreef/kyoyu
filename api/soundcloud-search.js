// POST /api/soundcloud-search
// Body: { query: string, limit?: number }
// Returns: { results: [...] }
//
// Uses official SoundCloud API with OAuth2 client_credentials flow.
// Requires SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET in env.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Simple in-memory rate limiter
let requestLog = [];
const RATE_LIMIT = 50;
const RATE_WINDOW = 60000;

// Cached OAuth token
let cachedToken = null;
let tokenExpiresAt = 0;

// Cached web client_id (extracted from soundcloud.com JS bundles for v2 API)
// Pre-seeded with a known working value to avoid cold-start timeout
let cachedWebClientId = 'kR7dAfT5UXQgmgde1pLjfsRGiaoANLvT';
let webClientIdExpiresAt = Date.now() + 3600000; // treat seed as valid for 1h

/**
 * Extract the internal web client_id from SoundCloud's JS bundles.
 * This is the same client_id the website uses with api-v2.
 * Cached for 1 hour.
 */
async function getWebClientId(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedWebClientId && now < webClientIdExpiresAt) {
    return cachedWebClientId;
  }
  try {
    const pageRes = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' }
    });
    if (!pageRes.ok) return cachedWebClientId;
    const html = await pageRes.text();
    const scriptUrls = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    // client_id is in one of the last JS bundles
    for (const url of scriptUrls.slice(-6).reverse()) {
      const jsRes = await fetch(url);
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const cidMatch = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{28,40})"/) || js.match(/client_id="([a-zA-Z0-9]{28,40})"/);
      if (cidMatch) {
        cachedWebClientId = cidMatch[1];
        webClientIdExpiresAt = now + 3600000; // 1 hour
        return cachedWebClientId;
      }
    }
  } catch (e) {
    console.warn('Failed to extract SC web client_id:', e.message);
  }
  return cachedWebClientId;
}

/**
 * Pick best iOS/WebKit-compatible transcodings (never Ogg/Opus).
 * Prefers progressive MP3 first, then HLS MP3/AAC.
 */
function pickCompatibleTranscodings(transcodings = []) {
  if (!Array.isArray(transcodings)) return [];
  const valid = transcodings.filter(t => {
    if (!t || !t.url || t.snipped) return false;
    const mime = String(t.format?.mime_type || '').toLowerCase();
    const preset = String(t.preset || '').toLowerCase();
    if (mime.includes('ogg') || mime.includes('opus') || preset.includes('opus')) return false;
    return true;
  });
  const score = (t) => {
    const proto = String(t.format?.protocol || '').toLowerCase();
    const mime = String(t.format?.mime_type || '').toLowerCase();
    const preset = String(t.preset || '').toLowerCase();
    const isMp3OrAac = mime.includes('mpeg') || mime.includes('mp4') || mime.includes('aac') || preset.includes('mp3') || preset.includes('aac') || preset.includes('abr');
    if (proto === 'progressive' && isMp3OrAac) return 100;
    if (proto === 'progressive') return 90;
    if (proto === 'hls' && (mime.includes('mp4') || mime.includes('aac') || preset.includes('aac') || preset.includes('abr'))) return 85;
    if (proto === 'hls' && (mime.includes('mpeg') || preset.includes('mp3'))) return 80;
    if (proto === 'hls') return 60;
    return 10;
  };
  return valid.sort((a, b) => score(b) - score(a));
}

/**
 * Get an OAuth2 access token using client_credentials grant.
 * Caches the token until it expires.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken; // Return cached token (with 1min safety margin)
  }

  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SoundCloud credentials not configured');
  }

  const res = await fetch('https://api.soundcloud.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('SoundCloud OAuth error:', res.status, errText);
    throw new Error('Failed to get SoundCloud access token');
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // SoundCloud tokens typically last 3600s (1 hour)
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit reached' });
  }
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  // ── Mode 1: Resolve stream URL for a single track ──
  const rawResolveId = body?.resolveTrackId;
  const resolveUrl = body?.resolveUrl || body?.trackUrl || '';
  const cleanResolveId = rawResolveId ? String(rawResolveId).replace(/^sc-/, '').trim() : '';
  if (cleanResolveId || resolveUrl) {
    try {
      let track = null;
      let streamUrl = null;
      let webClientId = await getWebClientId(false);

      const fetchV2Track = async (cid) => {
        if (!cid) return null;
        if (cleanResolveId && /^\d+$/.test(cleanResolveId)) {
          const r = await fetch(`https://api-v2.soundcloud.com/tracks/${cleanResolveId}?client_id=${encodeURIComponent(cid)}`, {
            headers: {
              'Accept': 'application/json; charset=utf-8',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
          });
          if (r.ok) return await r.json();
          if (r.status === 401 || r.status === 403) return { _authFailed: true };
        }
        if (resolveUrl && resolveUrl.includes('soundcloud.com')) {
          const r = await fetch(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(resolveUrl)}&client_id=${encodeURIComponent(cid)}`, {
            headers: {
              'Accept': 'application/json; charset=utf-8',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
          });
          if (r.ok) return await r.json();
          if (r.status === 401 || r.status === 403) return { _authFailed: true };
        }
        return null;
      };

      // Step 1: Resolve via api-v2.soundcloud.com using web client_id
      let v2Result = await fetchV2Track(webClientId);
      if (v2Result && v2Result._authFailed) {
        webClientId = await getWebClientId(true);
        v2Result = await fetchV2Track(webClientId);
      }
      if (v2Result && !v2Result._authFailed && v2Result.id) {
        track = v2Result;
        const candidates = pickCompatibleTranscodings(track.media?.transcodings || []);
        const trackAuth = track.track_authorization || '';
        for (const trans of candidates) {
          try {
            const sep = trans.url.includes('?') ? '&' : '?';
            let resolveEndpoint = `${trans.url}${sep}client_id=${encodeURIComponent(webClientId)}`;
            if (trackAuth && !resolveEndpoint.includes('track_authorization=')) {
              resolveEndpoint += `&track_authorization=${encodeURIComponent(trackAuth)}`;
            }
            const transRes = await fetch(resolveEndpoint, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
              },
            });
            if (transRes.ok) {
              const transData = await transRes.json();
              if (transData?.url) {
                streamUrl = transData.url;
                break;
              }
            }
          } catch (e) {
            console.warn('SC v2 transcoding resolve error:', e.message);
          }
        }
      }

      // Step 2: Official API v1 fallback if env credentials exist and v2 did not yield streamUrl
      if (!streamUrl && process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET && cleanResolveId) {
        try {
          const token = await getAccessToken();
          if (!track) {
            const trackRes = await fetch(`https://api.soundcloud.com/tracks/${cleanResolveId}?representation=full`, {
              headers: {
                'Accept': 'application/json; charset=utf-8',
                'Authorization': `OAuth ${token}`,
              },
            });
            if (trackRes.ok) {
              track = await trackRes.json();
            }
          }

          const streamsRes = await fetch(`https://api.soundcloud.com/tracks/${cleanResolveId}/streams`, {
            headers: {
              'Accept': 'application/json; charset=utf-8',
              'Authorization': `OAuth ${token}`,
            },
          });
          if (streamsRes.ok) {
            const streams = await streamsRes.json();
            // Prefer progressive HTTP MP3 first, then AAC/MP3 HLS (never opus/ogg)
            let candidateUrl = streams.http_mp3_128_url
              || streams.hls_aac_160_url
              || streams.hls_aac_96_url
              || streams.hls_mp3_128_url
              || null;
            if (!candidateUrl) {
              for (const key of Object.keys(streams)) {
                if (!/opus|ogg/i.test(key) && typeof streams[key] === 'string' && streams[key].startsWith('http')) {
                  candidateUrl = streams[key];
                  break;
                }
              }
            }
            if (candidateUrl) {
              if (candidateUrl.includes('api.soundcloud.com')) {
                const cdnRes = await fetch(candidateUrl, {
                  headers: { 'Authorization': `OAuth ${token}` },
                  redirect: 'follow',
                });
                if (cdnRes.ok) {
                  const contentType = cdnRes.headers.get('content-type') || '';
                  if (contentType.includes('json')) {
                    const cdnData = await cdnRes.json();
                    streamUrl = cdnData.url || cdnRes.url;
                  } else {
                    streamUrl = cdnRes.url;
                  }
                }
              } else {
                streamUrl = candidateUrl;
              }
            }
          }

          if (!streamUrl && track?.media?.transcodings?.length) {
            const candidates = pickCompatibleTranscodings(track.media.transcodings);
            for (const cand of candidates) {
              const transRes = await fetch(cand.url, {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': `OAuth ${token}`,
                },
                redirect: 'follow',
              });
              if (transRes.ok) {
                const transData = await transRes.json();
                if (transData?.url) {
                  streamUrl = transData.url;
                  break;
                }
              }
            }
          }
        } catch (v1Err) {
          console.warn('SC v1 fallback resolve error:', v1Err.message);
        }
      }

      if (!streamUrl || !track) {
        return res.status(404).json({ error: 'No playable stream found' });
      }

      const rawDur = Number(track.duration || track.full_duration || 0);
      const durationSec = rawDur > 1000 ? Math.round(rawDur / 1000) : Math.round(rawDur);

      return res.status(200).json({
        streamUrl,
        trackId: String(track.id || cleanResolveId),
        title: track.title || '',
        artistName: track.user?.username || '',
        artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
        duration: durationSec,
      });
    } catch (err) {
      console.error('SoundCloud resolve error:', err);
      return res.status(500).json({ error: 'Failed to resolve stream' });
    }
  }

  // ── Mode 2: Search for tracks ──
  const query = body?.query;
  const limit = Math.min(parseInt(body?.limit) || 33, 200);
  const offset = parseInt(body?.offset) || 0;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    // Strategy: try v2 first, fall back to v1 if env credentials exist
    let collection = [];

    // ── Attempt 1: v2 search with web client_id (broadest results) ──
    try {
      let webClientId = await getWebClientId(false);
      if (webClientId) {
        const fetchSearchV2 = async (cid) => {
          const v2Params = new URLSearchParams({
            q: query,
            limit: limit.toString(),
            offset: offset.toString(),
            linked_partitioning: '1',
            client_id: cid,
          });
          return await fetch(`https://api-v2.soundcloud.com/search/tracks?${v2Params.toString()}`, {
            headers: { 'Accept': 'application/json; charset=utf-8' },
          });
        };
        let v2Res = await fetchSearchV2(webClientId);
        if (v2Res.status === 401 || v2Res.status === 403) {
          webClientId = await getWebClientId(true);
          if (webClientId) v2Res = await fetchSearchV2(webClientId);
        }
        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          collection = Array.isArray(v2Data) ? v2Data : (v2Data.collection || []);
        } else {
          console.warn('SC v2 returned', v2Res.status, '- falling back');
        }
      }
    } catch (e) {
      console.warn('SC v2 error:', e.message);
    }

    // ── Attempt 2: v1 /tracks (title-only, last resort) ──
    if (collection.length === 0 && process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET) {
      const token = await getAccessToken();
      const v1Params = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        offset: offset.toString(),
        linked_partitioning: '1',
      });
      const v1Res = await fetch(`https://api.soundcloud.com/tracks?${v1Params.toString()}`, {
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Authorization': `OAuth ${token}`,
        },
      });
      if (v1Res.ok) {
        const v1Data = await v1Res.json();
        collection = Array.isArray(v1Data) ? v1Data : (v1Data.collection || []);
      }
    }

    const results = collection.map(track => ({
      trackId: track.id,
      title: track.title || '',
      artistName: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000),
      permalinkUrl: track.permalink_url || '',
      waveformUrl: track.waveform_url || '',
      playbackCount: track.playback_count || 0,
      likesCount: track.likes_count || track.favoritings_count || 0,
      userFollowersCount: track.user?.followers_count || 0,
      genre: track.genre || '',
      year: (track.release_date || track.created_at || '').slice(0, 4) || null,
    }));

    // Also search playlists via v2
    let playlists = [];
    try {
      const webCid = await getWebClientId();
      if (webCid) {
        const plParams = new URLSearchParams({
          q: query, limit: '11', client_id: webCid,
        });
        const plRes = await fetch(`https://api-v2.soundcloud.com/search/playlists?${plParams.toString()}`, {
          headers: { 'Accept': 'application/json; charset=utf-8' },
        });
        if (plRes.ok) {
          const plData = await plRes.json();
          playlists = (plData.collection || []).map(pl => ({
            playlistId: pl.id,
            title: pl.title || '',
            artistName: pl.user?.username || '',
            artworkUrl: (pl.artwork_url || pl.user?.avatar_url || '').replace('-large', '-t500x500'),
            trackCount: pl.track_count || 0,
            permalinkUrl: pl.permalink_url || '',
            duration: Math.round((pl.duration || 0) / 1000),
            tracks: (pl.tracks || []).map(t => ({
              trackId: t.id,
              title: t.title || '',
              artistName: t.user?.username || '',
              artworkUrl: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
              duration: Math.round((t.duration || 0) / 1000),
              permalinkUrl: t.permalink_url || '',
            })),
          }));
        }
      }
    } catch (e) {
      console.warn('SC playlist search error:', e.message);
    }

    const hasMore = collection.length >= limit;
    return res.status(200).json({ results, playlists, hasMore, nextOffset: offset + collection.length });
  } catch (err) {
    console.error('SoundCloud search error:', err);
    return res.status(200).json({ results: [], playlists: [] });
  }
}
