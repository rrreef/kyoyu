const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW_MS = 60000;

// Simple in-memory rate limiting
let requestCounts = {
  count: 0,
  resetTime: Date.now() + RATE_LIMIT_WINDOW_MS
};

function checkRateLimit() {
  const now = Date.now();
  if (now > requestCounts.resetTime) {
    requestCounts.count = 0;
    requestCounts.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  
  if (requestCounts.count >= RATE_LIMIT) {
    return false;
  }
  requestCounts.count++;
  return true;
}

function parseISO8601Duration(iso) {
  if (!iso) return 0;
  
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = (parseInt(match[1]) || 0);
  const minutes = (parseInt(match[2]) || 0);
  const seconds = (parseInt(match[3]) || 0);
  
  return hours * 3600 + minutes * 60 + seconds;
}

export default async function handler(req, res) {
  // CORS configuration
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // Allow localhost for local development testing
  else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const query = body?.query;
  const maxResults = Math.min(parseInt(body?.maxResults) || 10, 50);
  const type = body?.type || 'video';

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1. Search for videos
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: type,
      maxResults: maxResults.toString(),
      key: apiKey
    });

    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
    
    if (!searchRes.ok) {
      const errorData = await searchRes.json().catch(() => ({}));
      console.error('YouTube Search API error:', errorData);
      return res.status(searchRes.status).json({ error: 'Failed to fetch from YouTube' });
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    
    if (items.length === 0) {
      return res.status(200).json({ results: [] });
    }

    // Extract video IDs
    const videoIds = items.map(item => item.id?.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      return res.status(200).json({ results: [] });
    }

    // 2. Fetch video details for duration
    const videosParams = new URLSearchParams({
      part: 'contentDetails',
      id: videoIds.join(','),
      key: apiKey
    });

    const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`);
    
    if (!videosRes.ok) {
      const errorData = await videosRes.json().catch(() => ({}));
      console.error('YouTube Videos API error:', errorData);
      return res.status(videosRes.status).json({ error: 'Failed to fetch video details' });
    }

    const videosData = await videosRes.json();
    const durationMap = {};
    
    if (videosData.items) {
      videosData.items.forEach(video => {
        durationMap[video.id] = parseISO8601Duration(video.contentDetails?.duration);
      });
    }

    // 3. Transform response
    const results = items.map(item => {
      const snippet = item.snippet;
      const videoId = item.id.videoId;
      
      return {
        videoId: videoId,
        title: snippet.title,
        channelTitle: snippet.channelTitle,
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || snippet.thumbnails?.high?.url,
        duration: durationMap[videoId] || 0,
        publishedAt: snippet.publishedAt
      };
    }).filter(item => item.videoId);

    return res.status(200).json({ results });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
