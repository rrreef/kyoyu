/**
 * searchRanker.js — Client-side relevance ranking for unified search results.
 *
 * Scores every candidate against the query using:
 *   exact match → exact artist match → prefix → token set → typo tolerance → substring
 * with penalties for noise (tiny substring buried in long title).
 *
 * Also parses "artist + title" queries (e.g. "lord of the isles sunrise 89")
 * and applies combined scoring when both parts match.
 */

// ─── Normalize ──────────────────────────────────────────────────────────────

/**
 * Normalize a string for matching: lowercase, strip diacritics,
 * collapse whitespace, remove most punctuation.
 */
export function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[''`]/g, '')           // smart quotes / backticks
    .replace(/[^\w\s]/g, ' ')        // punctuation → space
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

// ─── Levenshtein Distance ───────────────────────────────────────────────────

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > 40 || b.length > 40) return Math.abs(a.length - b.length);

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// ─── Query Parser ───────────────────────────────────────────────────────────

/**
 * Attempt to split a query into { artistQuery, titleQuery }.
 * Tries common separators first.
 */
export function parseSearchQuery(query) {
  const q = query.trim();

  for (const sep of [' - ', ' – ', ' — ', ' by ']) {
    const idx = q.toLowerCase().indexOf(sep);
    if (idx > 0 && idx < q.length - sep.length) {
      return {
        artistQuery: q.slice(0, idx).trim(),
        titleQuery: q.slice(idx + sep.length).trim(),
      };
    }
  }

  return { artistQuery: q, titleQuery: '' };
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreField(fieldNorm, queryNorm) {
  if (!fieldNorm || !queryNorm) return 0;

  // Stage 1: Exact match
  if (fieldNorm === queryNorm) return 100;

  // Stage 2: Prefix match
  if (fieldNorm.startsWith(queryNorm)) return 70;

  // Stage 3: Token set match — all query tokens found in field
  const qTokens = queryNorm.split(' ').filter(Boolean);
  const fTokens = new Set(fieldNorm.split(' ').filter(Boolean));
  if (qTokens.length > 0 && qTokens.every(t => fTokens.has(t))) return 65;

  // Stage 4: Close typo match
  if (queryNorm.length <= 20 && fieldNorm.length <= 30) {
    const dist = levenshtein(fieldNorm, queryNorm);
    const threshold = queryNorm.length <= 5 ? 1 : queryNorm.length <= 10 ? 2 : 3;
    if (dist <= threshold) return 60;
  }

  // Stage 5: Substring match
  if (fieldNorm.includes(queryNorm)) return 30;

  // Stage 6: Partial token overlap
  if (qTokens.length > 1) {
    const matchCount = qTokens.filter(t => fieldNorm.includes(t)).length;
    const ratio = matchCount / qTokens.length;
    if (ratio >= 0.5) return Math.round(20 * ratio);
  }

  return 0;
}

function noisePenalty(fieldNorm, queryNorm) {
  if (!fieldNorm || !queryNorm) return 0;
  if (fieldNorm.includes(queryNorm) && fieldNorm.length > queryNorm.length * 4 && queryNorm.length < 6) {
    return -20;
  }
  return 0;
}

// ─── Main Scorer ────────────────────────────────────────────────────────────

function scoreResult(result, fullQueryNorm, artistQueryNorm, titleQueryNorm) {
  const titleNorm = normalize(result.title);
  const artistNorm = normalize(result.artistName);
  const channelNorm = normalize(result.channelTitle || '');
  const artistField = artistNorm || channelNorm;

  let score = 0;

  if (titleQueryNorm) {
    const artistScore = Math.max(
      scoreField(artistField, artistQueryNorm),
      scoreField(titleNorm, artistQueryNorm)
    );
    const titleScore = scoreField(titleNorm, titleQueryNorm);

    if (artistScore >= 95 && titleScore >= 95) {
      score = 200;
    } else if (artistScore >= 95) {
      score = 95 + (titleScore * 0.5);
    } else {
      score = Math.max(
        scoreField(titleNorm, fullQueryNorm),
        scoreField(artistField, fullQueryNorm)
      );
    }

    score += noisePenalty(titleNorm, titleQueryNorm);
    score += noisePenalty(artistField, artistQueryNorm);
  } else {
    const titleScore = scoreField(titleNorm, fullQueryNorm);
    const artistScore = scoreField(artistField, fullQueryNorm);

    score = Math.max(titleScore, artistScore);

    if (titleScore > 0 && artistScore > 0) {
      score += 10;
    }

    score += noisePenalty(titleNorm, fullQueryNorm);
    score += noisePenalty(artistField, fullQueryNorm);
  }

  // Entity type intent boost
  const hasNumbers = /\d/.test(fullQueryNorm);
  const hasReleaseKeywords = /\b(ep|lp|remix|mix|album|single|vol|pt)\b/.test(fullQueryNorm);
  if (!hasNumbers && !hasReleaseKeywords && fullQueryNorm.split(' ').length <= 4) {
    if (result.entityType === 'artist' || result.entityType === 'label') {
      score += 5;
    }
  }
  if (hasReleaseKeywords) {
    if (result.entityType === 'track' || result.entityType === 'release' || result.entityType === 'album') {
      score += 5;
    }
  }

  return score;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Rank all results by relevance to the query.
 */
export function rankResults(query, results) {
  if (!query || !results || results.length === 0) return results || [];

  const fullQueryNorm = normalize(query);
  const { artistQuery, titleQuery } = parseSearchQuery(query);
  const artistQueryNorm = normalize(artistQuery);
  const titleQueryNorm = normalize(titleQuery);

  const scored = results.map(r => ({
    ...r,
    _score: scoreResult(r, fullQueryNorm, artistQueryNorm, titleQueryNorm),
  }));

  scored.sort((a, b) => b._score - a._score);

  if (scored.length > 5 && scored[0]._score >= 150) {
    const gap = scored[0]._score - (scored[4]?._score || 0);
    if (gap > 50) {
      scored._dominantHitCutoff = 5;
    }
  }

  return scored;
}

/**
 * Try to detect the artist portion of a query by matching against actual results.
 */
export function detectArtistSplit(query, results) {
  const qNorm = normalize(query);
  const words = qNorm.split(' ');
  if (words.length <= 1) return { artistQuery: query, titleQuery: '' };

  const artistNames = new Set();
  for (const r of results) {
    if (r.artistName) artistNames.add(normalize(r.artistName));
    if (r.channelTitle) artistNames.add(normalize(r.channelTitle));
  }

  let bestArtist = '';
  let bestTitle = '';
  for (let i = words.length - 1; i >= 1; i--) {
    const candidate = words.slice(0, i).join(' ');
    if (artistNames.has(candidate)) {
      bestArtist = candidate;
      bestTitle = words.slice(i).join(' ');
      break;
    }
  }

  if (bestArtist) {
    const artistLen = bestArtist.length;
    const originalArtist = query.trim().slice(0, artistLen);
    const originalTitle = query.trim().slice(artistLen).trim();
    return { artistQuery: originalArtist, titleQuery: originalTitle };
  }

  return parseSearchQuery(query);
}
