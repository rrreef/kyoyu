const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/api/bandcamp-search.js';
let content = fs.readFileSync(file, 'utf8');

const regexFilter = /search_filter: 'b,a,t', \/\/ bands\/labels, albums, tracks/;
const replacementFilter = `search_filter: 'b,a,t,f', // bands/labels, albums, tracks, fans`;
content = content.replace(regexFilter, replacementFilter);

const regexType = /const type = item\.type === 'b' \? \(item\.is_label \? 'label' : 'artist'\) : item\.type === 'a' \? 'album' : 'track';/;
const replacementType = `const type = item.type === 'b' ? (item.is_label ? 'label' : 'artist') : item.type === 'a' ? 'album' : item.type === 'f' ? 'fan' : 'track';`;
content = content.replace(regexType, replacementType);

fs.writeFileSync(file, content);
console.log('Success');
