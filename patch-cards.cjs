const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/Cards.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add SVG imports
content = content.replace(
    /import \{ Play, Heart, ShoppingBag \} from 'lucide-react';/,
    `import { Play, ShoppingBag } from 'lucide-react';
import LikeIcon from '../../assets/like_icon.svg';`
);

// Replace <Heart />
content = content.replace(
    /<Heart\s*size=\{14\}\s*fill=\{saved \? 'currentColor' : 'none'\}\s*\/>/g,
    `<img src={LikeIcon} style={{ width: 14, height: 14, opacity: saved ? 1 : 0.5, filter: 'invert(1)' }} alt="like" />`
);
content = content.replace(
    /<Heart\s*size=\{13\}\s*fill=\{liked \? 'currentColor' : 'none'\}\s*\/>/g,
    `<img src={LikeIcon} style={{ width: 13, height: 13, opacity: liked ? 1 : 0.5, filter: 'invert(1)' }} alt="like" />`
);

fs.writeFileSync(file, content);
console.log('Patched Cards.jsx');
