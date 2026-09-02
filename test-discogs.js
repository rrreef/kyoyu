async function test() {
  const query = 'mby';
  const res = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=artist`, {
    headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` }
  });
  const data = await res.json();
  console.log("mby ->", data.results?.[0]?.title);
  
  const query2 = 'traumprince';
  const res2 = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(query2)}&type=artist`, {
    headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` }
  });
  const data2 = await res2.json();
  console.log("traumprince ->", data2.results?.[0]?.title);
}
test();
