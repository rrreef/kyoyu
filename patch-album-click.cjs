const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /\} else if \(item\.provider === 'bandcamp'[\s\S]*?\} else if \(\(item\.provider === 'spotify' \|\| item\.provider === 'applemusic'\) && \(isArtist \|\| isRelease\)\) \{\n                    if \(item\.url\) window\.open\(item\.url, '_blank'\);\n                  \} else if \(\!isArtist && \!isLabel\) \{/m;

const replacement = `} else if ((item.provider === 'spotify' || item.provider === 'applemusic') && isArtist) {
                    if (item.url) window.open(item.url, '_blank');
                  } else if (isRelease) {
                    // Universal Album Sheet: fetch tracks from provider, info from Discogs
                    try {
                      let tracks = [];
                      if (item.provider === 'bandcamp') {
                        const r = await fetch('/api/bandcamp-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'fetch-album', albumUrl: item.trackUrl }),
                        });
                        if (r.ok) tracks = (await r.json()).tracks.map(t => ({ ...t, id: \`bc-\${t.trackId}\`, url: t.streamUrl, trackUrl: t.trackUrl, providerItemId: t.trackUrl, cover: t.artworkUrl || item.artworkUrl || '' }));
                      } else if (item.provider === 'spotify') {
                        const r = await fetch('/api/youtube-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'fetch-spotify-album', provider: 'spotify', albumId: item.id }),
                        });
                        if (r.ok) tracks = (await r.json()).tracks.map(t => ({ ...t, providerItemId: t.spotifyId }));
                      } else if (item.provider === 'applemusic') {
                        const amId = item.id.replace('am-al-', '');
                        const r = await fetch(\`https://itunes.apple.com/lookup?id=\${amId}&entity=song\`);
                        if (r.ok) {
                          const data = await r.json();
                          tracks = data.results.slice(1).map(t => ({ id: \`am-\${t.trackId}\`, title: t.trackName, artist: t.artistName, duration: Math.floor(t.trackTimeMillis / 1000), provider: 'applemusic', providerItemId: String(t.trackId) }));
                        }
                      }
                      
                      let info = {};
                      if (item.provider !== 'discogs') {
                        const rInfo = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'track-info', title: item.title, artist: item.artistName || '', album: item.title }),
                        });
                        if (rInfo.ok) info = await rInfo.json();
                      } else {
                        const rInfo = await fetch('/api/discogs-search', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'track-info', title: item.title, artist: item.artistName || '', album: item.title, discogsReleaseId: item.id }),
                        });
                        if (rInfo.ok) info = await rInfo.json();
                        tracks = (info.tracklist || []).map((t, i) => ({
                          id: \`discogs-track-\${i}\`,
                          title: \`\${t.position ? t.position + '. ' : ''}\${t.title || ''}\`,
                          artist: t.artists?.join(', ') || info.artist || item.artistName || '',
                          url: \`resolve:\${t.artists?.join(', ') || info.artist || item.artistName || ''} \${t.title || ''}\`,
                          provider: '',
                        }));
                      }

                      const formatLinks = (links) => {
                        if (!links || !links.length) return '';
                        const md = links.map(l => {
                           let name = l.name.toLowerCase();
                           let url = l.url.toLowerCase();
                           let label = l.name;
                           if (url.includes('discogs.com') || name.includes('discogs')) label = 'Discogs';
                           else if (url.includes('musicbrainz.org') || name.includes('musicbrainz')) label = 'MusicBrainz';
                           else if (url.includes('bandcamp.com') || name.includes('bandcamp')) label = 'Bandcamp';
                           else if (url.includes('instagram.com') || name.includes('instagram')) label = 'Instagram';
                           else if (url.includes('soundcloud.com') || name.includes('soundcloud')) label = 'SoundCloud';
                           else if (url.includes('youtube.com') || name.includes('youtube')) label = 'YouTube';
                           else label = 'Website';
                           return \`[\${label}](\${l.url})\`;
                        });
                        const uniqueMd = [];
                        const seen = new Set();
                        for (const m of md) {
                          const label = m.match(/\\[(.*?)\\]/)[1];
                          if (!seen.has(label)) { seen.add(label); uniqueMd.push(m); }
                        }
                        return \`\\nLinks:\\n\${uniqueMd.join('  •  ')}\`;
                      };

                      const aliases = info.artistAliases?.length ? \`Aliases: \${info.artistAliases.join(', ')}\` : '';
                      const bioText = info.artistBio ? \`\\nAbout the artist:\\n\${info.artistBio}\${aliases ? '\\n' + aliases : ''}\` : (aliases ? \`\\nAbout the artist:\\n\${aliases}\` : '');
                      const desc = [
                        info.formats?.length ? \`Format: \${info.formats.join(' / ')}\` : '',
                        info.country ? \`Country: \${info.country}\` : '',
                        info.description || '',
                        info.credits?.mixing?.length ? \`Mixed by: \${info.credits.mixing.join(', ')}\` : '',
                        info.credits?.mastering?.length ? \`Mastered by: \${info.credits.mastering.join(', ')}\` : '',
                        bioText,
                        formatLinks(info.links)
                      ].filter(Boolean).join('\\n');

                      openNativeAlbumFast({
                        id: item.id || \`album-\${item.title}\`,
                        title: info.album || item.title || '',
                        artist: info.artist || item.artistName || '',
                        cover: item.coverImage || item.artworkUrl || item.thumbnail || item.thumb || '',
                        year: info.year || item.year || null,
                        genre: info.genre || '',
                        label: info.label || '',
                        provider: item.provider,
                        description: desc,
                        tracks: tracks,
                      });
                    } catch (e) { /* ignore */ }
                  } else if (!isArtist && !isLabel) {`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log('Success');
} else {
  console.log('Regex failed');
}
