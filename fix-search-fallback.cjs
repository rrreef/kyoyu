const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regexArtist = /try \{\n\s*let artistId = null;\n\s*if \(item\.provider === 'discogs'\) artistId = item\.id;\n\s*const r = await fetch\('\/api\/discogs-search', \{\n\s*method: 'POST', headers: \{ 'Content-Type': 'application\/json' \},\n\s*body: JSON\.stringify\(\{ action: 'artist-profile', artistId, artistName: item\.artistName \|\| item\.title \}\),\n\s*\}\);\n\s*if \(r\.ok\) \{\n\s*const profile = await r\.json\(\);\n\s*if \(profile && !profile\.error\) \{\n\s*\/\/ Merge in any location or other data we might have later\n\s*openNativeArtistFast\(\{\n\s*\.\.\.profile,\n\s*provider: item\.provider,\n\s*providerItemId: item\.id\n\s*\}\);\n\s*return;\n\s*\}\n\s*\}\n\s*if \(item\.url\) window\.open\(item\.url, '_blank'\);\n\s*\} catch \(e\) \{ if \(item\.url\) window\.open\(item\.url, '_blank'\); \}/;

const replacementArtist = `try {
                      let artistId = null;
                      if (item.provider === 'discogs') artistId = item.id;
                      
                      let artistData = {
                          id: item.id || \`local-\${Math.random()}\`,
                          name: item.artistName || item.title || 'Unknown Artist',
                          realname: null,
                          profile: null,
                          urls: item.url ? [item.url] : [],
                          aliases: [],
                          images: (item.profileAvatar || item.cover) ? [item.profileAvatar || item.cover] : [],
                          topReleases: [],
                          provider: item.provider,
                          providerItemId: item.id
                      };

                      try {
                        const r = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'artist-profile', artistId, artistName: item.artistName || item.title }),
                        });
                        if (r.ok) {
                          const profile = await r.json();
                          if (profile && !profile.error) {
                            artistData = {
                               ...artistData,
                               ...profile,
                               images: profile.images?.length ? profile.images : artistData.images,
                               urls: profile.urls?.length ? profile.urls : artistData.urls,
                            };
                          }
                        }
                      } catch (err) { console.error('Discogs fallback error', err); }
                      
                      openNativeArtistFast(artistData);
                    } catch (e) { 
                      console.error('Artist sheet fallback failed', e);
                    }`;

content = content.replace(regexArtist, replacementArtist);

const regexLabel = /try \{\n\s*let labelId = null;\n\s*if \(item\.provider === 'discogs'\) labelId = item\.id;\n\s*const r = await fetch\('\/api\/discogs-search', \{\n\s*method: 'POST', headers: \{ 'Content-Type': 'application\/json' \},\n\s*body: JSON\.stringify\(\{ action: 'label-profile', labelId, labelName: item\.artistName \|\| item\.title \}\),\n\s*\}\);\n\s*if \(r\.ok\) \{\n\s*const profile = await r\.json\(\);\n\s*if \(profile && !profile\.error\) \{\n\s*openNativeLabelFast\(\{\n\s*\.\.\.profile,\n\s*provider: item\.provider,\n\s*providerItemId: item\.id\n\s*\}\);\n\s*return;\n\s*\}\n\s*\}\n\s*if \(item\.url\) window\.open\(item\.url, '_blank'\);\n\s*\} catch \(e\) \{ if \(item\.url\) window\.open\(item\.url, '_blank'\); \}/;

const replacementLabel = `try {
                      let labelId = null;
                      if (item.provider === 'discogs') labelId = item.id;
                      
                      let labelData = {
                          id: item.id || \`local-\${Math.random()}\`,
                          name: item.artistName || item.title || 'Unknown Label',
                          profile: null,
                          urls: item.url ? [item.url] : [],
                          images: (item.profileAvatar || item.cover) ? [item.profileAvatar || item.cover] : [],
                          topReleases: [],
                          provider: item.provider,
                          providerItemId: item.id
                      };

                      try {
                        const r = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'label-profile', labelId, labelName: item.artistName || item.title }),
                        });
                        if (r.ok) {
                          const profile = await r.json();
                          if (profile && !profile.error) {
                            labelData = {
                               ...labelData,
                               ...profile,
                               images: profile.images?.length ? profile.images : labelData.images,
                               urls: profile.urls?.length ? profile.urls : labelData.urls,
                            };
                          }
                        }
                      } catch (err) { console.error('Discogs fallback error', err); }
                      
                      openNativeLabelFast(labelData);
                    } catch (e) { 
                      console.error('Label sheet fallback failed', e);
                    }`;

content = content.replace(regexLabel, replacementLabel);

fs.writeFileSync(file, content);
console.log('Success Search.jsx fallback');
