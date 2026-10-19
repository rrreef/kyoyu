const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(activeProvider === 'bandcamp' && et === 'label'\) return 'artists'; \/\/ Merged Artists\/Labels filter\n    /;
content = content.replace(regex, '');

fs.writeFileSync(file, content);
console.log('Success');
