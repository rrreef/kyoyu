const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/api/discogs-search.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ ==== ACTION: track-info ====/;

const replacement = `// ==== ACTION: artist-profile ====
  if (action === 'artist-profile') {
    return handleArtistProfile(body, res);
  }

  // ==== ACTION: label-profile ====
  if (action === 'label-profile') {
    return handleLabelProfile(body, res);
  }

  // ==== ACTION: track-info ====`;

content = content.replace(regex, replacement);

const regexFooter = /export default async function handler/;

const handleFns = `async function handleArtistProfile(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let { artistId, artistName } = body || {};

  if (!artistId && artistName) {
    try {
      const r = await fetch(\`https://api.discogs.com/database/search?q=\${encodeURIComponent(artistName)}&type=artist&per_page=5\`, { headers: DISCOGS_HEADERS });
      if (r.ok) {
        const d = await r.json();
        const hit = (d.results || []).find(a => normName(a.title) === normName(artistName)) || (d.results || [])[0];
        if (hit) artistId = hit.id;
      }
    } catch (e) {}
  }
  if (!artistId) return res.status(200).json({ error: 'Artist not found on Discogs' });

  const cacheKey = \`artist-profile|\${artistId}\`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 1);
  if (cached) return res.status(200).json(cached);

  let profileData = {};
  try {
    const r = await fetch(\`https://api.discogs.com/artists/\${artistId}\`, { headers: DISCOGS_HEADERS });
    if (r.ok) profileData = await r.json();
  } catch (e) {}

  // Fetch top releases by reusing the artist-top-releases logic internally
  let topReleases = [];
  try {
    const mockRes = { status: () => ({ json: (d) => { topReleases = d.releases || []; return { releases: topReleases }; } }) };
    await handleArtistTopReleases({ artistId, artistName }, mockRes);
  } catch(e) {}

  const result = {
    _v: 1,
    id: artistId,
    name: profileData.name || artistName || '',
    realname: profileData.realname || '',
    profile: profileData.profile || '',
    urls: profileData.urls || [],
    aliases: (profileData.aliases || []).map(a => a.name),
    images: (profileData.images || []).map(i => i.uri),
    topReleases
  };

  await cacheSet(supabase, cacheKey, result);
  return res.status(200).json(result);
}

async function handleLabelProfile(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let { labelId, labelName } = body || {};

  if (!labelId && labelName) {
    try {
      const r = await fetch(\`https://api.discogs.com/database/search?q=\${encodeURIComponent(labelName)}&type=label&per_page=5\`, { headers: DISCOGS_HEADERS });
      if (r.ok) {
        const d = await r.json();
        const hit = (d.results || []).find(a => normName(a.title) === normName(labelName)) || (d.results || [])[0];
        if (hit) labelId = hit.id;
      }
    } catch (e) {}
  }
  if (!labelId) return res.status(200).json({ error: 'Label not found on Discogs' });

  const cacheKey = \`label-profile|\${labelId}\`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 1);
  if (cached) return res.status(200).json(cached);

  let profileData = {};
  try {
    const r = await fetch(\`https://api.discogs.com/labels/\${labelId}\`, { headers: DISCOGS_HEADERS });
    if (r.ok) profileData = await r.json();
  } catch (e) {}

  // Fetch top releases for label
  let topReleases = [];
  try {
    const r = await fetch(\`https://api.discogs.com/labels/\${labelId}/releases?sort=year&sort_order=desc&per_page=10\`, { headers: DISCOGS_HEADERS });
    if (r.ok) {
        const d = await r.json();
        topReleases = (d.releases || []).map(r => ({
            id: \`discogs-l-\${r.type || 'release'}-\${r.id}\`,
            discogsId: r.id,
            type: r.type || 'release',
            title: r.title || '',
            artistName: r.artist || '',
            year: r.year || null,
            thumb: r.thumb || '',
            coverImage: r.thumb || '',
            entityType: 'release',
            provider: 'discogs'
        }));
    }
  } catch(e) {}

  const result = {
    _v: 1,
    id: labelId,
    name: profileData.name || labelName || '',
    profile: profileData.profile || '',
    urls: profileData.urls || [],
    images: (profileData.images || []).map(i => i.uri),
    topReleases
  };

  await cacheSet(supabase, cacheKey, result);
  return res.status(200).json(result);
}

export default async function handler`;

content = content.replace(regexFooter, handleFns);
fs.writeFileSync(file, content);
console.log('Success');
