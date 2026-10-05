/**
 * Shared "find a playable source for this song" logic.
 * Used by the Discogs album sheet (resolve: tracks) and by History replay
 * for entries that carry no provider identity.
 * Priority: Bandcamp → SoundCloud → YouTube. Each source must actually be this song.
 */
import { cleanText, parseEntity, isSameTitle, stripTrackPosition, tokens } from './musicMatch';
import { resolveBandcamp } from './unifiedSearch';

export async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export async function resolveBandcampStream(trackUrl, title) {
  const data = await resolveBandcamp(trackUrl, title);
  return data ? { streamUrl: data.streamUrl, duration: data.duration } : null;
}

/**
 * Find a playable source for artist + title.
 * Returns one of:
 *   { provider: 'bandcamp',   providerItemId: trackUrl,  src }
 *   { provider: 'soundcloud', providerItemId: permalink, scTrackId, src }
 *   { provider: 'youtube',    videoId }
 * or null when nothing matches (or when isCurrent() turns false mid-way).
 */
export async function findTrackSource({ artist, title }, isCurrent = () => true) {
  const cleanTitle = stripTrackPosition(title || '');
  const want = { artist: cleanText(artist || ''), title: cleanText(cleanTitle), uploader: '' };
  const searchText = `${artist || ''} ${cleanTitle}`.trim();
  if (!searchText) return null;
  try {
    // 1. Bandcamp
    const bc = await postJson('/api/bandcamp-search', { query: searchText });
    if (!isCurrent()) return null;
    const bcTrack = (bc?.results || []).find(r => r.type === 'track' && isSameTitle(parseEntity(r.title, r.artistName), want));
    if (bcTrack) {
      const resolved = await resolveBandcampStream(bcTrack.trackUrl, cleanTitle);
      if (!isCurrent()) return null;
      if (resolved?.streamUrl) return { provider: 'bandcamp', providerItemId: bcTrack.trackUrl, src: resolved.streamUrl, duration: resolved.duration };
    }

    // 2. SoundCloud
    const sc = await postJson('/api/soundcloud-search', { query: searchText, limit: 15, offset: 0 });
    if (!isCurrent()) return null;
    const scTrack = (sc?.results || []).find(r => isSameTitle(parseEntity(r.title, r.artistName), want));
    if (scTrack) {
      const scStream = await postJson('/api/soundcloud-search', { resolveTrackId: scTrack.trackId });
      if (!isCurrent()) return null;
      if (scStream?.streamUrl) {
        return { provider: 'soundcloud', providerItemId: scTrack.permalinkUrl, scTrackId: String(scTrack.trackId), src: scStream.streamUrl, duration: scTrack.duration };
      }
    }

    // 3. YouTube (titles are messy: accept an exact match, else every title word + the artist present)
    const yt = await postJson('/api/youtube-search', { query: `${searchText} audio` });
    if (!isCurrent()) return null;
    const ytResults = yt?.results || [];
    const ytEnt = (r) => parseEntity(r.title, r.channelTitle);
    const looseYt = (r) => {
      const all = tokens(`${r.title} ${r.channelTitle}`);
      const need = [...tokens(want.title), ...tokens(want.artist)];
      return need.length > 0 && need.every(w => all.has(w));
    };
    const ytTrack = ytResults.find(r => isSameTitle(ytEnt(r), want)) || ytResults.find(looseYt);
    if (ytTrack?.videoId) return { provider: 'youtube', videoId: ytTrack.videoId, duration: ytTrack.duration };
  } catch (e) {
    console.warn('[resolveTrack] error:', e);
  }
  return null;
}
