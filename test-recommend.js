async function test() {
  const url = 'https://aphextwin.bandcamp.com/album/drukqs';
  const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await htmlRes.text();
  
  const fans = [];
  const fanMatch = html.match(/"author":\{"@type":"Person","url":"([^"]+)"/g);
  if (fanMatch) {
    fanMatch.forEach(m => {
      const fanUrl = m.match(/"url":"([^"]+)"/)[1];
      if (!fanUrl.includes('aphextwin.bandcamp.com')) { // sanity check
        fans.push(fanUrl);
      }
    });
  }
  const uniqueFans = [...new Set(fans)].slice(0, 10);
  console.log("Fans:", uniqueFans);
  
  const recommendations = {};
  for (const fanUrl of uniqueFans) {
    const fanRes = await fetch(fanUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!fanRes.ok) continue;
    const fanHtml = await fanRes.text();
    const pagedataMatch = fanHtml.match(/data-blob="([^"]+)"/);
    if (pagedataMatch) {
      try {
        const data = JSON.parse(pagedataMatch[1].replace(/&quot;/g, '"'));
        const items = data.item_cache?.collection ? Object.values(data.item_cache.collection) : [];
        for (const item of items) {
          if (!item.item_url || item.item_url.includes('/album/drukqs')) continue;
          if (!recommendations[item.item_url]) {
            recommendations[item.item_url] = { count: 0, title: item.item_title, artist: item.band_name, artworkUrl: item.item_art_id ? `https://f4.bcbits.com/img/a${item.item_art_id}_10.jpg` : '' };
          }
          recommendations[item.item_url].count++;
        }
      } catch (e) {}
    }
  }
  const sorted = Object.entries(recommendations).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  sorted.forEach(s => console.log(`${s[1].count}x - ${s[1].artist} - ${s[1].title}`));
}
test();
