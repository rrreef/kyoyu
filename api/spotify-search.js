export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { query, limit = 33, offset = 0 } = req.body;
  if (!query) return res.status(200).json({ results: [] });

  const clientId = process.env.SPOTIFY_CLIENT_ID || '2f6a4c4add46410f83e1550aaf07690a';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '589bed253e4f4395a1c4e77f93719ecd';

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Failed to get Spotify token');

    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const searchData = await searchRes.json();

    const results = (searchData.tracks?.items || []).map(t => ({
      id: `sp-${t.id}`,
      spotifyId: t.id,
      title: t.name,
      artistName: t.artists.map(a => a.name).join(', '),
      artworkUrl: t.album.images?.[0]?.url,
      duration: Math.floor(t.duration_ms / 1000),
      albumName: t.album.name,
      url: t.external_urls?.spotify,
      provider: 'spotify',
      entityType: 'track',
      isExternal: true
    }));

    res.status(200).json({ 
      results,
      hasMore: !!searchData.tracks?.next,
      nextOffset: offset + limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
