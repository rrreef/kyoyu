const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/AlbumSheet.jsx';
let content = fs.readFileSync(file, 'utf8');

const artistRegex = /const safeArtist = \{[\s\S]*?\};\n/m;
const safeArtistStr = `const safeArtist = {
    ...artist,
    id: String(artist.id || Math.random()),
    name: String(artist.name || 'Unknown'),
    realname: artist.realname ? String(artist.realname) : null,
    profile: artist.profile ? String(artist.profile) : null,
    urls: Array.isArray(artist.urls) ? artist.urls.map(String) : [],
    aliases: Array.isArray(artist.aliases) ? artist.aliases.map(String) : [],
    images: Array.isArray(artist.images) ? artist.images.map(String) : [],
    topReleases: (Array.isArray(artist.topReleases) ? artist.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage ? String(r.coverImage) : null,
      type: r.type ? String(r.type) : null
    }))
  };
`;
content = content.replace(artistRegex, safeArtistStr);

const labelRegex = /const safeLabel = \{[\s\S]*?\};\n/m;
const safeLabelStr = `const safeLabel = {
    ...label,
    id: String(label.id || Math.random()),
    name: String(label.name || 'Unknown'),
    profile: label.profile ? String(label.profile) : null,
    urls: Array.isArray(label.urls) ? label.urls.map(String) : [],
    images: Array.isArray(label.images) ? label.images.map(String) : [],
    topReleases: (Array.isArray(label.topReleases) ? label.topReleases : []).map(r => ({
      ...r,
      id: String(r.id || Math.random()),
      title: String(r.title || 'Unknown'),
      year: r.year ? String(r.year) : null,
      thumb: r.thumb ? String(r.thumb) : null,
      coverImage: r.coverImage ? String(r.coverImage) : null,
      type: r.type ? String(r.type) : null
    }))
  };
`;
content = content.replace(labelRegex, safeLabelStr);

fs.writeFileSync(file, content);
console.log('Success AlbumSheet.jsx');
