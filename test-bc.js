async function test() {
  const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ search_text: 'aphex twin drukqs', search_filter: 'a', full_page: true, fan_id: 0 }),
  });
  const data = await bcRes.json();
  console.log(JSON.stringify(data.auto.results[0], null, 2));
}
test();
