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
  const t = await tokenRes.json();
  const searchRes = await fetch('https://api.spotify.com/v1/search?q=daft&type=track,album,artist&limit=5', {
    headers: { 'Authorization': 'Bearer ' + t.access_token }
  });
  console.log(Object.keys(await searchRes.json()));
}
run();
