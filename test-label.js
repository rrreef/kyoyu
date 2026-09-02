async function test() {
  const url = 'https://warprecords.bandcamp.com';
  const htmlRes = await fetch(url + '/music', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await htmlRes.text();
  
  const olMatch = html.match(/<ol[^>]*id="music-grid"[^>]*>([\s\S]*?)<\/ol>/i);
  if (olMatch) {
    const listHtml = olMatch[1];
    const itemRegex = /<a href="([^"]+)">[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<br>\s*<span class="artist-override">\s*(.*?)\s*<\/span>|<a href="([^"]+)">[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<\/p>/gi;
    
    const releases = [];
    let match;
    while ((match = itemRegex.exec(listHtml)) !== null) {
      if (match[1]) {
        releases.push({ url: match[1], title: match[3].trim(), artist: match[4].trim() });
      } else if (match[5]) {
        releases.push({ url: match[5], title: match[7].trim() });
      }
    }
    console.log(releases.slice(0, 5));
  }
}
test();
