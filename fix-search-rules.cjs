const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/pages/Search.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const orderedAll = stripInternal\(buildResults\(query, searchAnalysis, activeExtras\)\)[\s\S]*?\.filter\(item => activeFilter === 'all' \|\| filterMatch\(categoryOf\(item\)\)\);/;

const replacement = `const providerPriority = (() => {
    try {
      const stored = localStorage.getItem('providerPriority');
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return ['spotify', 'applemusic', 'youtube', 'bandcamp', 'soundcloud', 'discogs'];
  })();

  const getProviderScore = (provider) => {
    const idx = providerPriority.indexOf(provider);
    return idx !== -1 ? (100 - idx * 10) : 0; // Higher is better
  };

  const orderedAll = (() => {
    // Score all results strictly using searchRanker, plus our dynamic provider priority
    let scored = allExternal.map(r => {
      // Basic text matching based on words and characters
      const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
      const tNorm = (r.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aNorm = (r.artistName || r.channelTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      
      let textScore = 0;
      if (tNorm === qNorm || aNorm === qNorm) textScore += 1000;
      else if (tNorm.includes(qNorm) || aNorm.includes(qNorm)) textScore += 500;
      else {
        const words = query.toLowerCase().split(' ').filter(Boolean);
        const matches = words.filter(w => (r.title || '').toLowerCase().includes(w) || (r.artistName || '').toLowerCase().includes(w));
        textScore += (matches.length / (words.length || 1)) * 100;
      }
      
      const providerScore = getProviderScore(r.provider);
      return { ...r, _rawScore: textScore + providerScore + (r.ratingCount ? r.ratingCount / 1000 : 0) };
    });

    // Sort by strict score
    scored.sort((a, b) => b._rawScore - a._rawScore);

    // Apply Filter constraints
    if (activeFilter !== 'all') {
      const categoryOnly = scored.filter(item => filterMatch(categoryOf(item)));
      // Rules B & C: show exactly 33 items (or as many as possible)
      return categoryOnly.slice(0, 33);
    } else {
      // Filter == 'all'
      if (activeProvider !== 'all') {
        // Rule A: Specific provider, NO category -> 3 artists, 10 albums, 20 titles
        const artists = scored.filter(i => categoryOf(i) === 'artists').slice(0, 3);
        const albums = scored.filter(i => categoryOf(i) === 'albums').slice(0, 10);
        const titles = scored.filter(i => categoryOf(i) === 'titles').slice(0, 20);
        
        // If ratios are off, we could backfill, but user said "reduce and respect ratio", 
        // meaning strict limits per category are fine.
        return [...artists, ...albums, ...titles].sort((a, b) => b._rawScore - a._rawScore);
      } else {
        // No Provider, No Category -> Use intelligent orchestrator or just ratio?
        // "this will define what result come first when user doesn't filter a provider"
        // Let's use the same ratio logic for consistency, or just return top results.
        // I will return top 3 artists, top 10 albums, top 20 titles to be safe.
        const artists = scored.filter(i => categoryOf(i) === 'artists').slice(0, 3);
        const albums = scored.filter(i => categoryOf(i) === 'albums').slice(0, 10);
        const titles = scored.filter(i => categoryOf(i) === 'titles').slice(0, 20);
        return [...artists, ...albums, ...titles].sort((a, b) => b._rawScore - a._rawScore);
      }
    }
  })();`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Success');
