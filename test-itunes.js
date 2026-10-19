async function run() {
  const [songs, albums, artists] = await Promise.all([
    fetch('https://itunes.apple.com/search?term=daft+punk&entity=song&limit=3').then(r=>r.json()),
    fetch('https://itunes.apple.com/search?term=daft+punk&entity=album&limit=3').then(r=>r.json()),
    fetch('https://itunes.apple.com/search?term=daft+punk&entity=musicArtist&limit=3').then(r=>r.json())
  ]);
  console.log('Songs:', songs.results.map(x=>x.trackName));
  console.log('Albums:', albums.results.map(x=>x.collectionName));
  console.log('Artists:', artists.results.map(x=>x.artistName));
}
run();
