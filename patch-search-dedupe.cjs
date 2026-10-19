const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Sort by strict score\n\s*scored\.sort\(\(a, b\) => b\._rawScore - a\._rawScore\);/;
const replacement = `// Sort by strict score
    scored.sort((a, b) => b._rawScore - a._rawScore);

    // Dedupe
    const seen = new Set();
    scored = scored.filter(r => {
      const title = (r.title || '').toLowerCase().trim();
      const artist = (r.artistName || r.channelTitle || '').toLowerCase().trim();
      const kind = r.entityType || 'track';
      const key = \`\${kind}|\${title}|\${artist}\`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Success');
