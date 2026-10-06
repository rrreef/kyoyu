import ytdl from '@distube/ytdl-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const videoId = req.query.videoId;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    const info = await ytdl.getInfo(videoId);
    let format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    
    // Return the direct googlevideo.com URL
    return res.status(200).json({ streamUrl: format.url, title: info.videoDetails.title });
  } catch (error) {
    console.error('ytdl-core error:', error);
    return res.status(500).json({ error: 'Extraction failed' });
  }
}
