const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/Cards.jsx';
let content = fs.readFileSync(file, 'utf8');

// Restore Lucide Heart
content = content.replace(
    /import \{ Play, ShoppingBag \} from 'lucide-react';\nimport LikeIcon from '\.\.\/\.\.\/assets\/like_icon\.svg';/,
    `import { Play, Heart, ShoppingBag } from 'lucide-react';`
);

content = content.replace(
    /<img src=\{LikeIcon\} style=\{\{ width: 14, height: 14, opacity: saved \? 1 : 0\.5 \}\} alt="like" \/>/g,
    `<Heart size={14} fill={saved ? 'currentColor' : 'none'} color={saved ? '#ff5500' : 'currentColor'} opacity={saved ? 1 : 0.5} />`
);
content = content.replace(
    /<img src=\{LikeIcon\} style=\{\{ width: 13, height: 13, opacity: liked \? 1 : 0\.5 \}\} alt="like" \/>/g,
    `<Heart size={13} fill={liked ? 'currentColor' : 'none'} color={liked ? '#ff5500' : 'currentColor'} opacity={liked ? 1 : 0.5} />`
);

fs.writeFileSync(file, content);
