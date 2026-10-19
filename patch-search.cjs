const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const importRegex = /import \{ openNativeAlbumFast \} from '\.\.\/components\/ui\/AlbumSheet';/;
content = content.replace(importRegex, `import { openNativeAlbumFast, openNativeArtistFast, openNativeLabelFast } from '../components/ui/AlbumSheet';`);

const clickRegex = /\} else if \(\(item\.provider === 'spotify' \|\| item\.provider === 'applemusic'\) && isArtist\) \{\n                    if \(item\.url\) window\.open\(item\.url, '_blank'\);\n                  \}/;
const clickReplacement = `} else if (isArtist) {
                    try {
                      let artistId = null;
                      if (item.provider === 'discogs') artistId = item.id;
                      const r = await fetch('/api/discogs-search', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'artist-profile', artistId, artistName: item.artistName || item.title }),
                      });
                      if (r.ok) {
                        const profile = await r.json();
                        if (profile && !profile.error) {
                          // Merge in any location or other data we might have later
                          openNativeArtistFast({
                             ...profile,
                             provider: item.provider,
                             providerItemId: item.id
                          });
                          return;
                        }
                      }
                      if (item.url) window.open(item.url, '_blank');
                    } catch (e) { if (item.url) window.open(item.url, '_blank'); }
                  } else if (isLabel) {
                    try {
                      let labelId = null;
                      if (item.provider === 'discogs') labelId = item.id;
                      const r = await fetch('/api/discogs-search', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'label-profile', labelId, labelName: item.artistName || item.title }),
                      });
                      if (r.ok) {
                        const profile = await r.json();
                        if (profile && !profile.error) {
                          openNativeLabelFast({
                             ...profile,
                             provider: item.provider,
                             providerItemId: item.id
                          });
                          return;
                        }
                      }
                      if (item.url) window.open(item.url, '_blank');
                    } catch (e) { if (item.url) window.open(item.url, '_blank'); }
                  }`;

content = content.replace(clickRegex, clickReplacement);
fs.writeFileSync(file, content);
console.log('Success');
