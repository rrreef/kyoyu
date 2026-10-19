const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('} else if (isArtist) {'));
console.log(lines.slice(start, start + 30).join('\n'));
