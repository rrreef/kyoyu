async function test() {
  const r = await fetch('https://kyoyu.ree.fm/api/discogs-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'artist-profile', artistName: 'Aphex Twin' })
  });
  const text = await r.text();
  console.log(r.status);
  console.log(text.substring(0, 500));
}
test();
