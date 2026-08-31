const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;
  const res = await fetch('https://api.soundcloud.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error('Failed to get SoundCloud access token');
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);
  return cachedToken;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing track id' });

    const token = await getAccessToken();
    const scRes = await fetch(`https://api.soundcloud.com/tracks/${id}/streams`, {
      headers: { 'Authorization': `OAuth ${token}` },
    });
    
    if (!scRes.ok) return res.status(404).json({ error: 'Stream not found' });
    const data = await scRes.json();
    
    // Prioritize progressive mp3
    const streamUrl = data.http_mp3_128_url || data.http_mp3_url || data.hls_mp3_128_url;
    
    if (!streamUrl) return res.status(404).json({ error: 'No stream available' });
    
    return res.status(200).json({ streamUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Resolution failed' });
  }
}
