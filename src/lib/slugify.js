/**
 * Generate a URL-safe slug from a string.
 * Examples: 'Aphex Twin' -> 'aphex-twin', 'Warp Records' -> 'warp-records'
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')                   // decompose accents
    .replace(/[\u0300-\u036f]/g, '')    // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // remove non-alphanumeric
    .replace(/[\s_]+/g, '-')           // spaces/underscores to hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .replace(/^-|-$/g, '');            // trim leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a suffix if needed.
 */
export function slugifyUnique(text, existingSlugs = []) {
  const base = slugify(text);
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
