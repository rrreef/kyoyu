const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/Cards.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/filter: 'invert\(1\)'/g, '');

fs.writeFileSync(file, content);
