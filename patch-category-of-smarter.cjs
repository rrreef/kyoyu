const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const categoryOf = \(item\) => \{\n    const et = \(item\.entityType \|\| 'track'\)\.toLowerCase\(\);\n    \n    if \(activeProvider === 'bandcamp' && et === 'label'\) return 'artists'; \/\/ Merged Artists\/Labels filter\n    if \(et === 'artist'\) return 'artists';\n    if \(et === 'label'\) return 'labels';\n    if \(et === 'profile' \|\| et === 'user'\) return 'profiles';\n    if \(et === 'fan'\) return 'fans';\n    if \(et === 'playlist'\) return 'playlists'; \/\/ Map playlist to 'playlists' filter\n    if \(et === 'release' \|\| et === 'album'\) return 'albums';\n    return 'titles';\n  \};/;

const replacement = `const categoryOf = (item) => {
    const et = (item.entityType || 'track').toLowerCase();
    
    if (activeProvider === 'bandcamp' && et === 'label') return 'artists'; // Merged Artists/Labels filter
    if (activeProvider === 'youtube' && et === 'playlist' && activeFilter === 'albums') return 'albums'; // YouTube playlists act as albums too
    if (et === 'artist') return 'artists';
    if (et === 'label') return 'labels';
    if (et === 'profile' || et === 'user') return 'profiles';
    if (et === 'fan') return 'fans';
    if (et === 'playlist') return 'playlists'; // Map playlist to 'playlists' filter
    if (et === 'release' || et === 'album') return 'albums';
    return 'titles';
  };`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log('Success');
} else {
  console.log('Regex failed');
}
