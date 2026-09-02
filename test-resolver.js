async function test(query) {
  console.log(`Resolving: ${query}`);
  // 1. MusicBrainz fuzzy search
  const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent('artist:' + query + '~')}&fmt=json`, {
    headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' }
  });
  const mbData = await mbRes.json();
  if (!mbData.artists || mbData.artists.length === 0) {
    console.log("Not found in MB");
    return;
  }
  const canonical = mbData.artists[0].name;
  console.log("Canonical:", canonical);
  
  // 2. Discogs Search
  const discogsRes = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(canonical)}&type=artist`, {
    headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` }
  });
  const discogsData = await discogsRes.json();
  if (!discogsData.results || discogsData.results.length === 0) {
    console.log("Not found in Discogs");
    return;
  }
  const discogsId = discogsData.results[0].id;
  
  // 3. Discogs Aliases
  const artistRes = await fetch(`https://api.discogs.com/artists/${discogsId}`, {
    headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` }
  });
  const artistData = await artistRes.json();
  const aliases = (artistData.aliases || []).map(a => a.name);
  console.log("Aliases:", aliases);
}
test('traumprince');
test('aphex twin');
