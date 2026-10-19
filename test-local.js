import handler from './api/discogs-search.js';
const req = { method: 'POST', body: { action: 'artist-profile', artistName: 'Aphex Twin' }, headers: {} };
const res = { 
  status: (c) => ({ 
    json: (d) => console.log(c, JSON.stringify(d).substring(0, 500)) 
  }), 
  setHeader: () => {} 
};
await handler(req, res);
