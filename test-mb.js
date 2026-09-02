async function test() {
  let res = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent('artist:traumprince~')}&fmt=json`, { headers: { 'User-Agent': 'Kyoyu/1.0' } });
  let data = await res.json();
  console.log('Testing: artist:traumprince~', data.artists?.[0]?.name);
  await new Promise(r => setTimeout(r, 1100));

  let res2 = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent('traumprince~')}&fmt=json`, { headers: { 'User-Agent': 'Kyoyu/1.0' } });
  let data2 = await res2.json();
  console.log('Testing: traumprince~', data2.artists?.[0]?.name);
}
test();
