const clientId = '2f6a4c4add46410f83e1550aaf07690a';
const clientSecret = '589bed253e4f4395a1c4e77f93719ecd';

async function run() {
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const tokenData = await tokenRes.json();
  console.log('Token data:', tokenData);
  
  if (!tokenData.access_token) return;

  const searchRes = await fetch(`https://api.spotify.com/v1/search?q=daft&type=track&limit=33&offset=0`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  });
  const searchData = await searchRes.json();
  console.log('Search tracks items length:', searchData.tracks?.items?.length);
  if (searchData.tracks?.items?.length) {
     console.log('First track id:', searchData.tracks.items[0].id);
  } else {
     console.log(searchData);
  }
}
run();
