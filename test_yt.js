async function test() {
  const query = "traumprinz";
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' }
  });
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});/);
  if (!match) {
    console.log("NO MATCH");
    return;
  }
  const data = JSON.parse(match[1]);
  const items = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  
  const results = items.filter(i => i.videoRenderer).map(i => {
    const v = i.videoRenderer;
    return {
      trackId: v.videoId,
      title: v.title?.runs?.[0]?.text || '',
      channelTitle: v.ownerText?.runs?.[0]?.text || '',
    };
  }).slice(0, 33);
  console.log("RESULTS:", results.length, results[0]);
}
test();
