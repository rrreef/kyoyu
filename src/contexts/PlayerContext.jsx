import { createContext, useContext, useReducer, useRef, useEffect, useCallback } from 'react';
import { releases, djSets } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { resolveBandcamp, invalidateBandcampResolve } from '../lib/unifiedSearch';
import { findTrackSource, rememberResolvedTrackProvider, getRememberedTrackProvider } from '../lib/resolveTrack';
import { activePlaybackService, findStreamingMatch, callStreaming, refreshStreamingStatus, isStreamingAvailable, isStreamingProvider, cleanTrackOrReleaseTitle, splitCleanMetadata } from '../lib/streaming';
import { resolveAutoplay } from '../lib/autoplay-resolver';

const PlayerContext = createContext(null);

// ── History replay identity ──
// Stream URLs from these hosts are signed/expiring, so they can never be replayed later.
const EXPIRING_SRC = /bcbits\.com|sndcdn\.com|googlevideo\.com/i;

/** Work out how a played track can be replayed later (exact same provider + item). */
export function historyReplayInfo(t) {
  if (!t) return { provider: 'lookup' };
  if (t.replay?.provider && t.replay.provider !== 'lookup') return t.replay;
  if (t.origin?.provider && t.origin.provider !== 'lookup') return t.origin;
  const id = String(t.id || '');
  if (t.provider === 'youtube' && (t.videoId || t.providerItemId)) return { provider: 'youtube', videoId: t.videoId || t.providerItemId };
  if (/^yt-/.test(id)) return { provider: 'youtube', videoId: id.slice(3) };
  // Apple Music / Spotify / TIDAL items replay through their own engine (never a lookalike from YouTube)
  if (isStreamingProvider(t.provider) && (t.providerItemId || t.spotifyId || t.tidalId)) {
    return { provider: t.provider, itemId: String(t.providerItemId || t.spotifyId || t.tidalId).replace(/^(am|sp|td)-/, '') };
  }
  if (t.provider === 'soundcloud' || /^sc-\d+/.test(id) || /^https?:\/\/[^/]*soundcloud\.com\//i.test(t.providerUrl || t.providerItemId || t.trackUrl || t.url || '')) {
    const scId = t.scTrackId || t.trackId || (id.match(/^sc-(\d+)/) || [])[1] || '';
    const scUrl = [t.providerUrl, t.providerItemId, t.permalinkUrl, t.trackUrl, t.url].find(u => typeof u === 'string' && /^https?:\/\/[^/]*soundcloud\.com\//i.test(u)) || '';
    if (scId || scUrl) return { provider: 'soundcloud', scTrackId: scId ? String(scId).replace(/^sc-/, '') : '', url: scUrl };
  }
  if (t.provider === 'bandcamp' && /^https?:\/\//.test(t.providerItemId || t.providerUrl || t.trackUrl || '')) {
    return { provider: 'bandcamp', url: t.providerItemId || t.providerUrl || t.trackUrl };
  }
  const src = t.src || t.fileUrl || t.audioUrl || '';
  if (src && !src.startsWith('resolve:') && !EXPIRING_SRC.test(src)) return { provider: 'native' };
  // Check if this title was previously played & resolved on a preferred provider
  const remembered = getRememberedTrackProvider({
    id: t.id,
    title: t.title || t.name || '',
    artist: t.artist || t.artistName || '',
  });
  if (remembered) {
    if (remembered.provider === 'bandcamp' && remembered.providerItemId) {
      return { provider: 'bandcamp', url: remembered.providerItemId };
    }
    if (remembered.provider === 'soundcloud' && remembered.scTrackId) {
      return { provider: 'soundcloud', scTrackId: String(remembered.scTrackId), url: remembered.providerItemId || '' };
    }
    if (remembered.provider === 'youtube' && remembered.videoId) {
      return { provider: 'youtube', videoId: remembered.videoId };
    }
    if (isStreamingProvider(remembered.provider) && remembered.providerItemId) {
      return { provider: remembered.provider, itemId: String(remembered.providerItemId) };
    }
  }
  // No identity (never played before): find it by artist + title
  return { provider: 'lookup' };
}

/** Provider identity of a track, so a saved copy (like, playlist, download) replays the exact same source. */
export function trackIdentity(t) {
  if (!t) return {};
  const out = {};
  for (const k of ['provider', 'providerItemId', 'providerUrl', 'scTrackId', 'spotifyId', 'appleMusicId', 'tidalId', 'videoId', 'origin', 'isPrivate']) {
    if (t[k]) out[k] = t[k];
  }
  out.replay = historyReplayInfo(t);
  return out;
}

function historyKey(t, r = historyReplayInfo(t)) {
  if (r.provider === 'youtube')    return `yt:${r.videoId}`;
  if (r.provider === 'soundcloud') return `sc:${r.scTrackId}`;
  if (r.provider === 'bandcamp')   return `bc:${r.url}`;
  if (isStreamingProvider(r.provider)) return `${r.provider}:${r.itemId}`;
  return `id:${t.id}`;
}

const allTracks = [
  ...releases.flatMap(r => r.tracks.map(t => ({ ...t, releaseId: r.id, releaseCover: r.cover, releaseTitle: r.title, artistName: r.artist }))),
  ...djSets.map(s => ({ id: s.id, title: s.title, releaseCover: s.cover, releaseTitle: s.title, artistName: s.artist })),
];

const initialState = {
  currentTrack: null, queue: [], isPlaying: false, volume: 0.8,
  progress: 0, duration: 0, isMuted: false, isShuffled: false, repeatMode: 'none',
  provider: 'native',       // 'native' | 'youtube' | 'soundcloud'
  providerItemId: null,     // YouTube videoId or SoundCloud trackId/URL
  providerUrl: null,        // Original source URL for "Open on..." link
};

function parseDurationSeconds(val) {
  if (typeof val === 'number' && isFinite(val) && val > 0) {
    return val > 36000 ? Math.round(val / 1000) : val;
  }
  if (typeof val === 'string' && val.trim()) {
    const s = val.trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      return n > 36000 ? Math.round(n / 1000) : n;
    }
    const parts = s.split(':').map(Number);
    if (parts.length === 2 && isFinite(parts[0]) && isFinite(parts[1])) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && isFinite(parts[0]) && isFinite(parts[1]) && isFinite(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Actions that must NOT clear a restored (paused, not-yet-loaded) session
const KEEP_RESTORED = new Set(['SET_PROGRESS', 'SET_DURATION', 'SET_VOLUME', 'SET_QUEUE', 'TOGGLE_SHUFFLE', 'CYCLE_REPEAT', 'RESTORE_SESSION', 'NATIVE_ERROR', 'UPDATE_CURRENT_TRACK']);
function playerReducer(state, action) {
  const next = baseReducer(state, action);
  if (!state.restoredPending || next === state || next.restoredPending === false) return next;
  if (KEEP_RESTORED.has(action.type)) return next;
  if (action.type === 'SET_PLAYING' && !action.value) return next;
  return { ...next, restoredPending: false };
}

function baseReducer(state, action) {

  switch (action.type) {
    case 'STOP': {
      if (typeof window !== 'undefined' && window.__kyoyuAudioRef) {
        window.__kyoyuAudioRef.pause();
        window.__kyoyuAudioRef.src = '';
      }
      return { ...state, currentTrack: null, isPlaying: false, progress: 0, duration: 0, queue: [],
               provider: 'native', providerItemId: null, providerUrl: null };
    }
    case 'PLAY_TRACK': {
      // We ALWAYS set provider to 'native' because PLAY_TRACK handles actual mp3 streams.
      // (YouTube has its own PLAY_YOUTUBE action).
      const trackDur = parseDurationSeconds(action.track?.duration);
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: trackDur > 0 ? trackDur : 0,
               provider: 'native', providerItemId: null, providerUrl: null };
    }
    case 'PLAY_YOUTUBE': {
      // Pause native audio when switching to YouTube
      if (typeof window !== 'undefined' && window.__kyoyuAudioRef) {
        window.__kyoyuAudioRef.pause();
        window.__kyoyuAudioRef.src = '';
      }
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: action.track.duration || 0,
               provider: 'youtube', providerItemId: action.videoId, providerUrl: `https://www.youtube.com/watch?v=${action.videoId}` };
    }
    case 'PLAY_SOUNDCLOUD': {
      // Pause native audio when switching to SoundCloud
      if (typeof window !== 'undefined' && window.__kyoyuAudioRef) {
        window.__kyoyuAudioRef.pause();
        window.__kyoyuAudioRef.src = '';
      }
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: action.track.duration || 0,
               provider: 'soundcloud', providerItemId: action.trackUrl, providerUrl: action.trackUrl };
    }
    case 'PLAY_STREAMING': {
      // Apple Music / Spotify — audio is played natively (MusicKit / Spotify app), not by <audio> or an iframe
      if (typeof window !== 'undefined' && window.__kyoyuAudioRef) {
        window.__kyoyuAudioRef.pause();
        window.__kyoyuAudioRef.src = '';
      }
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: action.track.duration || 0,
               provider: action.service, providerItemId: action.itemId, providerUrl: action.url || null };
    }
    case 'UPDATE_CURRENT_TRACK': {
      if (!state.currentTrack) return state;
      const updatedTrack = { ...state.currentTrack, ...(action.patch || {}) };
      const nextDur = parseDurationSeconds(action.patch?.duration);
      return {
        ...state,
        currentTrack: updatedTrack,
        ...(action.itemId ? { providerItemId: action.itemId } : {}),
        ...(nextDur > 0 ? { duration: nextDur } : {}),
      };
    }
    case 'NATIVE_ERROR':
      return { ...state, nativeErrorCount: (state.nativeErrorCount || 0) + 1 };
    case 'TOGGLE_PLAY':  return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYING':  return { ...state, isPlaying: action.value };
    case 'SET_VOLUME':   return { ...state, volume: action.value };
    case 'SET_PROGRESS': return { ...state, progress: action.value };
    case 'SET_DURATION': return { ...state, duration: action.value };
    case 'SET_QUEUE':    return { ...state, queue: action.queue };
    case 'TOGGLE_SHUFFLE': return { ...state, isShuffled: !state.isShuffled };
    case 'CYCLE_REPEAT': {
      const modes = ['none','all','one'];
      return { ...state, repeatMode: modes[(modes.indexOf(state.repeatMode)+1)%modes.length] };
    }
    case 'RESTORE_SESSION': {
      // Rebuild the last session PAUSED. Stream URLs expire, so nothing is loaded until the user presses play
      // (see resumeRestoredSession). provider is 'native' so no iframe / engine starts by itself.
      return { ...state, currentTrack: action.track, queue: action.queue || [], isPlaying: false,
               progress: action.progress || 0, duration: action.duration || 0,
               provider: 'native', providerItemId: null, providerUrl: null, restoredPending: true };
    }
    case 'RESTART_CURRENT': {
      // Last-resort "next": never end in silence — replay the current track from the start
      if (!state.currentTrack) return state;
      return { ...state, currentTrack: { ...state.currentTrack, _restart: Date.now() }, progress: 0, isPlaying: true };
    }
    case 'NEXT_TRACK': {
      if (!state.queue.length) {
        // No queue — stop playback (e.g. end of YT/SC/BC track)
        return { ...state, isPlaying: false };
      }
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      if (idx < 0) return state;
      // At the last track — do nothing
      if (idx >= state.queue.length - 1) return state;
      return { ...state, currentTrack: { ...state.queue[idx + 1] }, progress:0, duration:0, isPlaying:true };
    }
    case 'PREV_TRACK': {
      if (!state.queue.length) {
        // No queue — restart current track from beginning
        return { ...state, currentTrack: { ...state.currentTrack, _restart: Date.now() }, progress:0 };
      }
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      if (idx < 0) return state;
      if (idx <= 0) {
        return { ...state, currentTrack: { ...state.currentTrack, _restart: Date.now() }, progress:0 };
      }
      return { ...state, currentTrack: { ...state.queue[idx - 1] }, progress:0, duration:0, isPlaying:true };
    }
    default: return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(null);
  const playIdRef = useRef(0); // increments on each track change to cancel stale plays
  const masterPlaySeqRef = useRef(0); // global sequence counter across all providers to cancel stale async resolutions
  const stateRef = useRef(state);
  stateRef.current = state;
  // Always-fresh handles for callbacks registered once (audio 'ended', native bridge, timers)
  const playNextAutoplayRef = useRef(() => {});
  const playNextSearchRef = useRef(() => {});
  playNextAutoplayRef.current = () => playNextAutoplay();
  playNextSearchRef.current = () => playNextSearch();
  // Position to seek to once a resumed (restored) track is actually playing: { id, pos }
  const pendingSeekRef = useRef(null);

  // Apple Music / Spotify connection status (iOS app only) — needed before the first YouTube play is routed
  useEffect(() => { refreshStreamingStatus(); }, []);

  // ── Native Error Fallback ──
  // AVPlayer could not load the stream: try a fresh Bandcamp stream once, then the same song elsewhere.
  const nativeRetryRef = useRef('');
  useEffect(() => {
    const cur = state.currentTrack;
    if (!(state.nativeErrorCount > 0) || !cur) return;
    if (cur.provider === 'youtube' || !(cur.src || cur.audioUrl || cur.fileUrl)) return;
    const id = cur.id;
    const stillCurrent = () => stateRef.current.currentTrack?.id === id;
    (async () => {
      const r = historyReplayInfo(cur);
      if (r.provider === 'youtube' && r.videoId) {
        // YouTube stream refused by AVPlayer: retry with the next client (skip the ones that failed), iframe only as the last resort
        const meta = { title: cur.title, artist: cur.artistName || cur.artist, thumbnail: cur.releaseCover, duration: cur.duration };
        const failedClient = ((cur.src || '').match(/[?&]c=([A-Z_]+)/) || [])[1];
        const key = `${id}|yt`;
        const skip = (nativeRetryRef.current.startsWith(key) ? nativeRetryRef.current.slice(key.length).split(',').filter(Boolean) : []);
        if (failedClient && !skip.includes(failedClient)) skip.push(failedClient);
        nativeRetryRef.current = key + skip.join(',');
        if (skip.length < 3) {
          let res = null;
          try { res = await callStreaming('ytResolve', { videoId: r.videoId, skip }, 15000); } catch (e) { window.__kyoyuYtError = e?.message || String(e); }
          if (!stillCurrent()) return;
          if (res?.url && res.url !== cur.src) { playTrack({ ...cur, src: res.url, _restart: Date.now() }); return; }
        }
        playYouTube(r.videoId, meta, { forceIframe: true });
        return;
      }
      if (r.provider === 'bandcamp' && nativeRetryRef.current !== `${id}|bc`) {
        nativeRetryRef.current = `${id}|bc`;
        invalidateBandcampResolve(r.url);
        const fresh = await resolveBandcamp(r.url, cur.title);
        if (!stillCurrent()) return;
        if (fresh?.streamUrl && fresh.streamUrl !== cur.src) {
          playTrack({ ...cur, src: fresh.streamUrl, audioUrl: fresh.streamUrl, url: fresh.streamUrl, _restart: Date.now() });
          return;
        }
      }
      if (nativeRetryRef.current === `${id}|alt`) return;
      nativeRetryRef.current = `${id}|alt`;
      const found = await findTrackSource({ artist: cur.artistName || cur.artist || '', title: cur.title || '' }, stillCurrent);
      if (!stillCurrent()) return;
      if (found && !(found.provider === 'bandcamp' && found.providerItemId === r.url)) playFoundSource(found, cur);
      else dispatch({ type: 'NEXT_TRACK' });
    })();
  }, [state.nativeErrorCount]); // eslint-disable-line

  // ── Create audio element on mount ──
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.volume = 0.8;
    // Append to DOM (hidden) — WKWebView needs this for reliable playback
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioRef.current = audio;
    window.__kyoyuAudioRef = audio;

    const onTime  = () => dispatch({ type:'SET_PROGRESS', value: audio.currentTime });
    const onMeta  = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) dispatch({ type:'SET_DURATION', value: d });
    };
    const isNativeIOS = !!window.webkit?.messageHandlers?.audioFallback;
    const onPlay  = () => { if (!isNativeIOS) dispatch({ type:'SET_PLAYING',  value: true  }); };
    const onPause = () => { if (!isNativeIOS) dispatch({ type:'SET_PLAYING',  value: false }); };
    const onEnded = () => {
      // Always go through refs: this listener is registered once, so direct calls would use stale state
      if (stateRef.current.repeatMode === 'one') { dispatch({ type: 'RESTART_CURRENT' }); return; }
      const sq = searchQueueRef.current;
      if (sq.length > 0 && searchQueueIdxRef.current >= 0 && searchQueueIdxRef.current < sq.length - 1) {
        playNextSearchRef.current();
      } else {
        playNextAutoplayRef.current();
      }
    };

    const onError = () => {
      console.warn('[Player] audio error:', audio.error?.code, audio.error?.message);
    };

    audio.addEventListener('timeupdate',     onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('error',          onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate',     onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('error',          onError);
      audio.remove();
    };
  }, []);

  // ── History & Back-Stack tracking ──
  const listenedStackRef = useRef([]);
  const isSteppingBackRef = useRef(false);

  useEffect(() => {
    if (!state.currentTrack || state.currentTrack.title === 'Loading...') return;
    try {
      rememberResolvedTrackProvider(state.currentTrack);
      const replay = historyReplayInfo(state.currentTrack);
      const key = historyKey(state.currentTrack, replay);

      const trackToSave = { ...state.currentTrack, replay, _hkey: key };
      delete trackToSave._restart;
      trackToSave.title = trackToSave.title || trackToSave.artistName || 'Unknown Track';
      trackToSave.artist = trackToSave.artistName || trackToSave.artist || '';
      trackToSave.cover = trackToSave.releaseCover || trackToSave.cover || trackToSave.artworkUrl;
      trackToSave.timestamp = Date.now();

      if (isSteppingBackRef.current) {
        isSteppingBackRef.current = false;
      } else {
        // Update chronological back-stack (shared across tabs via localStorage)
        let stack = listenedStackRef.current;
        try {
          const rawStack = localStorage.getItem('kyoyu-back-stack-v1');
          if (rawStack) {
            const parsed = JSON.parse(rawStack);
            if (Array.isArray(parsed)) stack = parsed;
          }
        } catch (e) {}
        const top = stack.length > 0 ? stack[stack.length - 1] : null;
        const topKey = top ? (top._hkey || historyKey(top)) : '';
        const normStr = (s) => String(s || '').toLowerCase().trim();
        const topTA = top ? `${normStr(top.title)}::${normStr(top.artist || top.artistName)}` : '';
        const curTA = `${normStr(trackToSave.title)}::${normStr(trackToSave.artist || trackToSave.artistName)}`;
        if (top && (String(top.id || '') === String(trackToSave.id || '') || (key && topKey === key) || (curTA !== '::' && topTA === curTA))) {
          stack[stack.length - 1] = trackToSave;
        } else {
          stack.push(trackToSave);
          if (stack.length > 40) stack = stack.slice(stack.length - 40);
        }
        listenedStackRef.current = stack;
        try { localStorage.setItem('kyoyu-back-stack-v1', JSON.stringify(stack)); } catch (e) {}

        const historyStr = localStorage.getItem('kyoyu-play-history') || '[]';
        let history = JSON.parse(historyStr);
        history = history.filter(t => t.id !== state.currentTrack.id && (t._hkey || historyKey(t)) !== key);
        history.unshift(trackToSave);
        history = history.slice(0, 20);
        localStorage.setItem('kyoyu-play-history', JSON.stringify(history));
        window.dispatchEvent(new Event('kyoyu-play-history-changed'));
      }
    } catch (err) {}
  }, [state.currentTrack]);

  // ── Track change → stop old, load new, play when ready ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    // A restored session is shown paused; nothing is loaded until the user presses play
    if (state.restoredPending) return;
    // When switching to an external engine (Spotify, Apple Music, or YouTube iframe), ensure AVPlayer and web <audio> are stopped
    if (state.provider !== 'native') {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      try {
        const mh = window.webkit?.messageHandlers;
        if (mh?.audioFallback) mh.audioFallback.postMessage({ url: '' });
      } catch (e) {}
      return;
    }

    // Stop current playback cleanly before switching or if src is empty (placeholder)
    audio.pause();
    audio.currentTime = 0;

    const src = state.currentTrack.src || state.currentTrack.fileUrl || state.currentTrack.audioUrl || '';
    if (src.startsWith('resolve:')) {
      // e.g. next track in a Discogs tracklist — find its real source instead of sending "resolve:" to AVPlayer
      const t = state.currentTrack;
      setTimeout(() => playSaved({ ...t, src: '', audioUrl: '', url: t.url }), 0);
      return;
    }
    if (!src) {
      // If no src (e.g. placeholder track while resolving), tell native iOS to clear player
      try {
        const mh = window.webkit?.messageHandlers;
        if (mh?.audioFallback) mh.audioFallback.postMessage({ url: '' });
      } catch (e) {}
      return;
    }

    // Increment play ID to cancel any pending play from previous track
    const myPlayId = ++playIdRef.current;

    // ── Send URL directly to native AVPlayer (iOS) ──
    // Whenever state.provider === 'native' (which includes Bandcamp, SoundCloud, resolved YouTube direct audio, and Native tracks),
    // AVPlayer in AudioFallbackBridge is the single source of truth on iOS.
    try {
      const mh = window.webkit?.messageHandlers;
      if (mh?.audioFallback) {
        if (window.__kyoyuTrack) window.__kyoyuTrack.lastSentUrl = src;
        // Resumed session: start exactly where the user left off
        const ps = pendingSeekRef.current;
        let seekTo = 0;
        if (ps && ps.id === state.currentTrack.id && ps.pos > 1) { seekTo = ps.pos; pendingSeekRef.current = null; }
        mh.audioFallback.postMessage(seekTo > 0 ? { url: src, seekTo } : { url: src });
      }
      if (mh?.audioSession) mh.audioSession.postMessage('play');
    } catch (e) { /* not in WKWebView */ }

    // Set pre-computed duration from DB if available (show instantly)
    if (state.currentTrack.duration) {
      const d = String(state.currentTrack.duration);
      let dbDuration = 0;
      if (d.includes(':')) {
        const parts = d.split(':');
        if (parts.length === 2) dbDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else {
        dbDuration = parseInt(d) || 0;
      }
      if (dbDuration > 0) dispatch({ type: 'SET_DURATION', value: dbDuration });
    }

    // On native iOS, AVPlayer handles all direct stream playback (Bandcamp, SoundCloud, YouTube direct, Native).
    // Never load the stream into the WKWebView <audio> element on iOS, which causes dual-playback or CORS/0-duration ended events.
    const isNativeIOS = !!window.webkit?.messageHandlers?.audioFallback;
    if (isNativeIOS) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    audio.src = src;
    audio.load();

    // Play web audio when ready (web browser only)
    const onCanPlay = () => {
      audio.removeEventListener('canplay', onCanPlay);
      if (playIdRef.current === myPlayId) {
        audio.play().catch(() => {});
      }
    };
    audio.addEventListener('canplay', onCanPlay);

    // Fallback: try to play after 500ms even if canplay hasn't fired
    const fallbackTimer = setTimeout(() => {
      if (playIdRef.current === myPlayId && audio.paused) {
        audio.play().catch(() => {});
      }
    }, 500);

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
      clearTimeout(fallbackTimer);
    };
    // src is a dependency: a resolving track keeps its id (placeholder → real stream), and the
    // audio must load as soon as the stream URL arrives.
  }, [state.currentTrack?.id, state.currentTrack?._restart, state.restoredPending, state.provider, state.currentTrack?.src || state.currentTrack?.fileUrl || state.currentTrack?.audioUrl || '']); // eslint-disable-line


  // ── Play / pause sync ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.restoredPending) return;
    // External providers handle their own play/pause
    if (state.provider !== 'native') return;

    const isNativeIOS = !!window.webkit?.messageHandlers?.audioFallback;
    if (state.isPlaying) {
      if (!isNativeIOS) audio.play().catch(() => {});
      // On native iOS, directly tell AVPlayer
      try {
        const mh = window.webkit?.messageHandlers?.audioFallback;
        if (mh) mh.postMessage('resume');
      } catch(e) {}
    } else {
      if (!isNativeIOS) audio.pause();
      try {
        const mh = window.webkit?.messageHandlers?.audioFallback;
        if (mh) mh.postMessage('pause');
      } catch(e) {}
    }
  }, [state.isPlaying, state.provider]); // eslint-disable-line

  // ── Sync in-app slider when hardware volume buttons are pressed ──
  useEffect(() => {
    window.__kyoyuSystemVolumeChanged = (v) => {
      const vol = Math.max(0, Math.min(1, Number(v)));
      if (audioRef.current) audioRef.current.volume = vol;
      dispatch({ type:'SET_VOLUME', value: vol });
    };
    return () => { delete window.__kyoyuSystemVolumeChanged; };
  }, []);

  // ── Helpers (stable — safe in drag handlers) ──

  const seekTo = useCallback((seconds) => {
    if (!isFinite(seconds)) return;
    let t = Math.max(0, seconds);
    
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      t = Math.min(t, audio.duration);
      audio.currentTime = t;
    }
    
    try {
      const mh = window.webkit?.messageHandlers?.audioFallback;
      if (mh) mh.postMessage({ seek: t });
    } catch(e) {}
    
    dispatch({ type:'SET_PROGRESS', value: t });
  }, []);

  // Called on every drag frame — sets volume directly, no dispatch
  const setAudioVolumeDirect = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  // Called on drag release — sets volume + syncs React state
  const setVolume = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    if (audioRef.current) audioRef.current.volume = vol;
    dispatch({ type:'SET_VOLUME', value: vol });
  }, []);

  function playTrack(track, queue = []) {
    // Normalise track shape — public tracks use audioUrl (R2), uploads use fileUrl/src
    const rawArtist = track.artistName || track.artist || '';
    const rawTitle = track.title || track.name || '';
    const rawLabel = track.label || track.labelName || track.releaseLabel || '';
    const rawAlbum = track.releaseTitle || track.albumTitle || track.album || '';
    const cleaned = splitCleanMetadata(rawTitle, rawArtist, rawLabel, rawAlbum);
    const normDur = parseDurationSeconds(track.duration);
    const isPrivateTrack = Boolean(
      track.isPrivate ||
      (typeof (track.providerUrl || track.providerItemId || track.url) === 'string' && /soundcloud\.com\/[^/]+\/[^/]+\/s-[A-Za-z0-9]+/i.test(track.providerUrl || track.providerItemId || track.url)) ||
      ((track.provider === 'applemusic' || track.sourceProvider === 'applemusic' || String(track.id || '').startsWith('am-')) &&
        (String(track.id || '').startsWith('am-i.') || String(track.appleMusicId || track.providerItemId || '').startsWith('i.')) &&
        !track.catalogId)
    );
    const normTrack = {
      ...track,
      title: cleaned.title || rawTitle,
      src: track.src || track.fileUrl || track.audioUrl || '',
      artistName: cleaned.artist || rawArtist,
      label: isPrivateTrack ? '' : (cleaned.label || rawLabel),
      releaseTitle: isPrivateTrack ? '' : (cleaned.album || rawAlbum),
      releaseCover: track.releaseCover || track.cover || track.artworkUrl || '',
      duration: normDur > 0 ? normDur : (track.duration || 0),
      isPrivate: isPrivateTrack,
    };
    dispatch({ type:'PLAY_TRACK', track: normTrack });
    try {
      window.webkit.messageHandlers.player.postMessage({
        visible: true,
        playing: true,
        trackId: String(normTrack.id || ''),
        title: normTrack.title || '',
        artist: normTrack.artistName || '',
        label: isPrivateTrack ? '' : (normTrack.label || ''),
        albumName: isPrivateTrack ? '' : (normTrack.releaseTitle || ''),
        artwork: normTrack.releaseCover || '',
        provider: 'native',
        sourceProvider: normTrack.sourceProvider || normTrack.provider || normTrack.origin?.provider || 'native',
        isPrivate: isPrivateTrack,
        ...(normDur > 0 ? { dur: normDur } : {}),
      });
    } catch(e){} 
    const normQueue = queue.map(t => {
      const qArtist = t.artistName || t.artist || '';
      const qTitle = t.title || t.name || '';
      const qLabel = t.label || t.labelName || t.releaseLabel || '';
      const qAlbum = t.releaseTitle || t.albumTitle || t.album || '';
      const qClean = splitCleanMetadata(qTitle, qArtist, qLabel, qAlbum);
      return {
        ...t,
        title: qClean.title || qTitle,
        src: t.src || t.fileUrl || t.audioUrl || '',
        artistName: qClean.artist || qArtist,
        label: t.isPrivate ? '' : (qClean.label || qLabel),
        releaseTitle: t.isPrivate ? '' : (qClean.album || qAlbum),
        releaseCover: t.releaseCover || t.cover || t.artworkUrl || '',
      };
    });
    if (normQueue.length) dispatch({ type:'SET_QUEUE', queue: normQueue });
    // Note: actual audio loading happens in the useEffect above (triggered by PLAY_TRACK)
  }

  function playRelease(release) {
    if (!release?.tracks?.length) return;
    const cleanRelTitle = cleanTrackOrReleaseTitle(release.title, release.artist);
    const tracks = release.tracks.map(t => {
      const tArtist = t.artist || release.artist || '';
      return {
        ...t,
        title:        cleanTrackOrReleaseTitle(t.title, tArtist),
        releaseId:    release.id,
        releaseCover: t.cover || release.cover,
        releaseTitle: cleanRelTitle,
        label:        t.label || release.label || '',
        artistName:   tArtist,
        // Normalise audio source: public tracks use audioUrl (R2)
        src:          t.src || t.fileUrl || t.audioUrl || '',
      };
    });
    playTrack(tracks[0], tracks);
  }

  const playYouTubeCounterRef = useRef(0);
  function playYouTube(videoId, metadata = {}, opts = {}) {
    // Playlist ("PL…") / channel ("UC…") ids are not videos and would load forever
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) { console.warn('[Player] ignoring invalid YouTube video id', videoId); return; }
    const myCounter = ++playYouTubeCounterRef.current;
    const mySeq = opts.seq || ++masterPlaySeqRef.current;
    const rawAlbum = metadata.releaseTitle || metadata.albumName || metadata.album || '';
    const cleaned = splitCleanMetadata(metadata.title || 'YouTube Video', metadata.channelTitle || metadata.artist || '', metadata.label || '', rawAlbum);
    const title = cleaned.title || metadata.title || 'YouTube Video';
    const artistName = cleaned.artist || metadata.channelTitle || metadata.artist || '';
    const label = cleaned.label || metadata.label || '';
    const releaseTitle = cleaned.album || rawAlbum;
    const releaseCover = metadata.releaseCover || metadata.thumbnail || metadata.artworkUrl || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const providerUrl = metadata.providerUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const sourceProvider = metadata.sourceProvider || 'youtube';
    const trackId = metadata.id || `yt-${videoId}`;
    const origin = { provider: 'youtube', videoId };

    // Fallback engine: the YouTube iframe (foreground only on iOS, but works when the stream can't be resolved)
    const startIframe = () => {
      if (myCounter !== playYouTubeCounterRef.current || mySeq !== masterPlaySeqRef.current) return;
      const track = {
        id: trackId, title, artistName, label, releaseTitle, releaseCover, duration: parseDurationSeconds(metadata.duration) || 0,
        src: '', provider: 'youtube', sourceProvider, providerItemId: videoId, videoId, providerUrl, origin,
      };
      dispatch({ type: 'PLAY_YOUTUBE', videoId, track });
      try {
        window.webkit.messageHandlers.player.postMessage({
          visible: true,
          playing: true,
          trackId: String(track.id || ''),
          title: track.title || '',
          artist: track.artistName || '',
          label: track.label || '',
          albumName: track.releaseTitle || '',
          artwork: track.releaseCover || '',
          provider: 'youtube',
          sourceProvider,
        });
      } catch(e){}
    };

    // iOS app: play the YouTube audio stream with AVPlayer — exactly like SoundCloud / Bandcamp
    // (background playback, lock screen, Dynamic Island, no iframe). Resolved on the device.
    if (opts.forceIframe || !isStreamingAvailable()) { startIframe(); return; }

    nativeRetryRef.current = '';
    showPlaceholder({ id: trackId, title, artistName, label, releaseTitle, releaseCover, duration: metadata.duration || 0, provider: 'youtube', sourceProvider, videoId, providerUrl, origin });
    (async () => {
      let res = null;
      try { res = await callStreaming('ytResolve', { videoId }, 15000); } catch (e) { res = null; window.__kyoyuYtError = e?.message || String(e); }
      if (myCounter !== playYouTubeCounterRef.current || mySeq !== masterPlaySeqRef.current) return;
      if (!res?.url) { startIframe(); return; }
      playTrack({
        id: trackId,
        _restart: Date.now(),
        title,
        artistName,
        label,
        releaseTitle,
        releaseCover,
        duration: res.duration || metadata.duration || 0,
        src: res.url,
        provider: 'youtube',
        sourceProvider,
        providerItemId: videoId,
        videoId,
        providerUrl,
        origin,
      });
    })();
  }

  const playSoundCloudCounterRef = useRef(0);
  async function playSoundCloud(trackUrl, metadata = {}, opts = {}) {
    playSoundCloudCounterRef.current += 1;
    const myCounter = playSoundCloudCounterRef.current;
    const mySeq = opts.seq || ++masterPlaySeqRef.current;
    // Extract numeric track ID from metadata or the item id (e.g. "sc-88335161")
    let trackId = metadata.trackId || metadata.scTrackId || '';
    if (trackId) {
      trackId = String(trackId).replace(/^sc-/, '').trim();
    }
    if (!trackId && metadata.id) {
      const m = String(metadata.id).match(/^sc-(\d+)/);
      if (m) trackId = m[1];
    }
    const cleanTrackUrl = (typeof trackUrl === 'string' && trackUrl.includes('soundcloud.com'))
      ? trackUrl
      : ([metadata.permalinkUrl, metadata.providerUrl, metadata.url].find(u => typeof u === 'string' && u.includes('soundcloud.com')) || '');

    if (!trackId && !cleanTrackUrl) {
      console.warn('[Player] SoundCloud: no trackId or trackUrl available, cannot resolve stream');
      return;
    }

    const isPrivateSc = Boolean(metadata.isPrivate || /\/s-[A-Za-z0-9]+/i.test(cleanTrackUrl || ''));
    const rawAlbum = isPrivateSc ? '' : (metadata.releaseTitle || metadata.albumName || metadata.album || '');
    const initClean = splitCleanMetadata(metadata.title || 'SoundCloud Track', metadata.artistName || metadata.artist || '', isPrivateSc ? '' : (metadata.label || ''), rawAlbum);
    const initDur = parseDurationSeconds(metadata.duration);
    const placeholderId = metadata.id || (trackId ? `sc-${trackId}` : `sc-${Date.now()}`);
    const sourceProvider = metadata.sourceProvider || 'soundcloud';
    const placeholderTrack = {
      id: placeholderId,
      title: initClean.title || metadata.title || 'SoundCloud Track',
      artistName: initClean.artist || metadata.artistName || metadata.artist || '',
      label: isPrivateSc ? '' : (initClean.label || metadata.label || ''),
      releaseTitle: isPrivateSc ? '' : (initClean.album || rawAlbum),
      releaseCover: metadata.releaseCover || metadata.artworkUrl || metadata.cover || '',
      duration: initDur,
      src: '',
      provider: 'soundcloud',
      sourceProvider,
      providerUrl: cleanTrackUrl,
      providerItemId: cleanTrackUrl || (trackId ? String(trackId) : ''),
      scTrackId: trackId ? String(trackId) : '',
      isPrivate: isPrivateSc,
      origin: { provider: 'soundcloud', scTrackId: trackId ? String(trackId) : '', url: cleanTrackUrl || '', isPrivate: isPrivateSc },
    };
    showPlaceholder(placeholderTrack);

    try {
      let data = null;

      // 1. iOS app: resolve directly on-device via StreamingBridge ('scResolve') so CloudFront
      // stream URLs are signed for the user's device IP and filtered for MP3/AAC (never Ogg/Opus).
      if (isStreamingAvailable()) {
        try {
          const nativeRes = await callStreaming('scResolve', {
            trackId: trackId ? String(trackId) : '',
            trackUrl: cleanTrackUrl || '',
          }, 12000);
          if (nativeRes && (nativeRes.streamUrl || nativeRes.url)) {
            data = {
              streamUrl: nativeRes.streamUrl || nativeRes.url,
              trackId: nativeRes.trackId || trackId,
              title: nativeRes.title || '',
              artistName: nativeRes.artistName || '',
              artworkUrl: nativeRes.artworkUrl || '',
              duration: parseDurationSeconds(nativeRes.duration),
              isPrivate: Boolean(nativeRes.isPrivate || isPrivateSc),
            };
          }
        } catch (nativeErr) {
          console.warn('[Player] Native scResolve failed, falling back to /api/soundcloud-search:', nativeErr?.message || nativeErr);
        }
      }

      // 2. Fallback: resolve via serverless API
      if (!data || !data.streamUrl) {
        const res = await fetch('/api/soundcloud-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolveTrackId: trackId || undefined,
            resolveUrl: cleanTrackUrl || undefined,
          }),
        });

        if (res.ok) {
          const apiData = await res.json();
          if (apiData && apiData.streamUrl) {
            data = apiData;
          }
        } else {
          console.warn('[Player] SoundCloud stream resolve failed:', res.status);
        }
      }

      if (myCounter !== playSoundCloudCounterRef.current || mySeq !== masterPlaySeqRef.current) return;
      if (!data || !data.streamUrl) {
        console.warn('[Player] SoundCloud: no stream URL returned');
        dispatch({ type: 'SET_PLAYING', value: false });
        return;
      }

      const finalTrackId = String(data.trackId || trackId || '').replace(/^sc-/, '');
      const finalIsPrivate = Boolean(data.isPrivate || isPrivateSc);
      const resClean = splitCleanMetadata(
        metadata.title || data.title || 'SoundCloud Track',
        metadata.artistName || metadata.artist || data.artistName || '',
        finalIsPrivate ? '' : (initClean.label || metadata.label || ''),
        finalIsPrivate ? '' : (initClean.album || rawAlbum)
      );
      const resolvedDur = parseDurationSeconds(data.duration) || initDur || 0;
      const resolvedTrack = {
        id: metadata.id || (finalTrackId ? `sc-${finalTrackId}` : placeholderId),
        _restart: Date.now(), // re-fires the audio useEffect (same id as the placeholder)
        scTrackId: finalTrackId,
        provider: 'soundcloud',
        sourceProvider,
        providerItemId: cleanTrackUrl || finalTrackId,
        origin: { provider: 'soundcloud', scTrackId: finalTrackId, url: cleanTrackUrl || '', isPrivate: finalIsPrivate },
        title: resClean.title || metadata.title || data.title || 'SoundCloud Track',
        artistName: resClean.artist || metadata.artistName || metadata.artist || data.artistName || '',
        label: finalIsPrivate ? '' : (resClean.label || ''),
        releaseTitle: finalIsPrivate ? '' : (resClean.album || rawAlbum),
        releaseCover: metadata.releaseCover || metadata.artworkUrl || data.artworkUrl || metadata.cover || '',
        duration: resolvedDur,
        src: data.streamUrl,
        providerUrl: cleanTrackUrl,
        isPrivate: finalIsPrivate,
      };
      playTrack(resolvedTrack);
    } catch (err) {
      console.warn('[Player] SoundCloud stream resolve error:', err);
      dispatch({ type: 'SET_PLAYING', value: false });
    }
  }

  // ── Search queue: multi-provider playlist from search results ──
  const searchQueueRef = useRef([]);
  const searchQueueIdxRef = useRef(-1);
  const isResolvingAutoplayRef = useRef(false);

  // Play a single item from the search queue based on its provider
  const playSearchItemCounterRef = useRef(0);
  async function playSearchItem(item) {
    if (!item) return;
    playSearchItemCounterRef.current += 1;
    const myCounter = playSearchItemCounterRef.current;
    const mySeq = ++masterPlaySeqRef.current;
    if (item.provider === 'youtube') {
      let vid = item.providerItemId || item.videoId;
      if (!vid && item.id && item.id.startsWith('yt-')) vid = item.id.replace('yt-', '');
      if (item.url && !vid) {
        const m = item.url.match(/(?:v=|youtu\.be\/|embed\/)([^&?]+)/);
        if (m) vid = m[1];
      }
      playYouTube(vid, {
        id: item.id || `yt-${vid}`,
        title: item.title,
        channelTitle: item.artistName || item.artist,
        releaseTitle: item.albumName || item.releaseTitle || item.albumTitle || '',
        label: item.label || item.labelName || '',
        thumbnail: item.artworkUrl || item.releaseCover || item.cover,
        duration: item.duration,
      }, { seq: mySeq });
    } else if (item.provider === 'soundcloud') {
      // Resolve stream URL via API and play natively (same as native tracks)
      playSoundCloud(item.providerItemId || item.permalinkUrl || item.url, {
        id: item.id,
        trackId: item.scTrackId || item.trackId || (item.id && String(item.id).replace(/^sc-/, '')),
        title: item.title,
        artistName: item.artistName || item.artist,
        releaseTitle: item.isPrivate ? '' : (item.albumName || item.releaseTitle || item.albumTitle || ''),
        label: item.isPrivate ? '' : (item.label || item.labelName || ''),
        artworkUrl: item.artworkUrl || item.releaseCover || item.cover,
        duration: item.duration,
        isPrivate: Boolean(item.isPrivate),
      }, { seq: mySeq });
    } else if (item.provider === 'bandcamp') {
      const bcUrl = item.providerItemId || item.trackUrl || item.url;
      const cleaned = splitCleanMetadata(
        item.title || '',
        item.artistName || item.artist || '',
        item.label || item.labelName || '',
        item.albumName || item.releaseTitle || item.albumTitle || ''
      );
      const meta = {
        id: item.id,
        title: cleaned.title || item.title || '',
        artistName: cleaned.artist || item.artistName || '',
        label: cleaned.label || item.label || item.labelName || '',
        labelUrl: item.labelUrl || '',
        releaseTitle: cleaned.album || item.albumName || item.releaseTitle || '',
        year: item.year || '',
        releaseCover: item.artworkUrl || item.releaseCover || item.cover || '',
        url: bcUrl,
        duration: item.duration || 0,
        sourceProvider: 'bandcamp',
      };
      showPlaceholder({ ...meta, provider: 'bandcamp', providerItemId: meta.url, providerUrl: item.providerUrl || meta.url });
      const isCurrent = () => myCounter === playSearchItemCounterRef.current && mySeq === masterPlaySeqRef.current && stateRef.current.currentTrack?.id === item.id;
      await playBandcampOrFallback(meta, isCurrent);
    } else if (item.provider === 'spotify' || item.provider === 'applemusic' || item.provider === 'tidal') {
      await playStreamingItem(item, myCounter, mySeq);
    } else {
      // native track
      playTrack(item);
    }
  }

  /** Apple Music / Spotify / TIDAL result → their native engine; if that's unavailable, the same song elsewhere. */
  async function playStreamingItem(item, myCounter, mySeq = ++masterPlaySeqRef.current) {
    const service = item.provider;
    const itemId = String(item.providerItemId || item.spotifyId || item.appleMusicId || item.tidalId || item.trackId || '').replace(/^(am|sp|td)-/, '');
    const isPrivateAm = Boolean(
      item.isPrivate ||
      (service === 'applemusic' && (itemId.startsWith('i.') || String(item.id || '').startsWith('am-i.')) && !item.catalogId)
    );
    const cleaned = splitCleanMetadata(
      item.title || '',
      item.artistName || item.artist || '',
      isPrivateAm ? '' : (item.label || item.labelName || ''),
      isPrivateAm ? '' : (item.albumName || item.releaseTitle || '')
    );
    const meta = {
      id: item.id || `${service}-${itemId}`,
      title: cleaned.title || item.title || '',
      artistName: cleaned.artist || item.artistName || item.artist || '',
      label: isPrivateAm ? '' : (cleaned.label || item.label || item.labelName || ''),
      releaseCover: item.artworkUrl || item.releaseCover || item.cover || '',
      duration: parseDurationSeconds(item.duration) || 0,
      releaseTitle: isPrivateAm ? '' : (cleaned.album || item.albumName || item.releaseTitle || ''),
      sourceProvider: service,
      isPrivate: isPrivateAm,
    };
    const stillCurrent = () => myCounter === playSearchItemCounterRef.current && mySeq === masterPlaySeqRef.current;
    // Immediately stop any active AVPlayer stream before handing off to Spotify / Apple Music
    try { window.webkit?.messageHandlers?.audioFallback?.postMessage({ url: '' }); } catch (e) {}

    if (itemId && isStreamingAvailable()) {
      const track = {
        ...meta,
        src: '',
        provider: service,
        sourceProvider: service,
        providerItemId: itemId,
        providerUrl: item.url || '',
        isPrivate: isPrivateAm,
        ...(service === 'spotify' ? { spotifyId: itemId } : {}),
        ...(service === 'applemusic' ? { appleMusicId: itemId } : {}),
        ...(service === 'tidal' ? { tidalId: itemId } : {}),
      };
      dispatch({ type: 'PLAY_STREAMING', service, itemId, url: item.url, track });
      try {
        window.webkit.messageHandlers.player.postMessage({
          visible: true,
          playing: true,
          trackId: String(track.id || ''),
          title: track.title,
          artist: track.artistName || '',
          label: isPrivateAm ? '' : (track.label || ''),
          albumName: isPrivateAm ? '' : (track.releaseTitle || ''),
          artwork: track.releaseCover || '',
          provider: service,
          sourceProvider: service,
          isPrivate: isPrivateAm,
          ...(meta.duration > 0 ? { dur: meta.duration } : {}),
        });
      } catch (e) {}
      // Spotify's App Remote is flaky right after a cold start / app switch: give its own engine a few tries
      let lastError = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!stillCurrent()) return;
        try {
          await callStreaming('play', {
            service,
            itemId,
            title: meta.title || '',
            artist: meta.artistName || '',
            duration: Number(meta.duration) || 0,
          });
          return;
        } catch (err) {
          lastError = err?.message || String(err);
          console.warn(`[Player] ${service} playback failed (attempt ${attempt + 1}):`, lastError);
          if (/subscription|not connected|not configured|not installed/i.test(lastError)) break;
          if (attempt < 2) await new Promise(r => setTimeout(r, 900));
        }
      }
      window.__kyoyuStreamError = lastError;
    }
    if (!stillCurrent()) return;
    // Seamless audio fallback: if the native Spotify / Apple Music / TIDAL SDK could not start playback
    // (or on web where no native SDK exists), resolve the exact same track via Bandcamp / SoundCloud / YouTube
    // while keeping the original Spotify/Apple Music metadata, album name, and artwork!
    showPlaceholder({ ...meta, provider: service, sourceProvider: service, providerItemId: itemId, providerUrl: item.url || '' });
    const found = await findTrackSource({ id: meta.id, artist: meta.artistName, title: meta.title }, stillCurrent);
    if (!stillCurrent()) return;
    if (found) {
      playFoundSource(found, {
        ...meta,
        sourceProvider: service,
        ...(service === 'spotify' ? { spotifyId: itemId } : {}),
        ...(service === 'applemusic' ? { appleMusicId: itemId } : {}),
        ...(service === 'tidal' ? { tidalId: itemId } : {}),
      }, mySeq);
      return;
    }
    dispatch({ type: 'SET_PLAYING', value: false });
  }

  useEffect(() => {
    window.__kyoyuRecoverStreamingFailure = async (service, failedTrack, rawItemId) => {
      if (!failedTrack || !failedTrack.title) {
        dispatch({ type: 'SET_PLAYING', value: false });
        return;
      }
      const mySeq = masterPlaySeqRef.current;
      const myCounter = playSearchItemCounterRef.current;
      const stillCurrent = () => myCounter === playSearchItemCounterRef.current && mySeq === masterPlaySeqRef.current;
      const itemId = String(rawItemId || failedTrack.providerItemId || failedTrack.spotifyId || failedTrack.appleMusicId || failedTrack.tidalId || '').replace(/^(am|sp|td|spotify|applemusic|tidal)-/, '');
      const meta = {
        id: failedTrack.id || `${service}-${itemId}`,
        title: failedTrack.title || '',
        artistName: failedTrack.artistName || failedTrack.artist || '',
        label: failedTrack.label || '',
        releaseCover: failedTrack.releaseCover || failedTrack.artworkUrl || failedTrack.cover || '',
        duration: parseDurationSeconds(failedTrack.duration) || 0,
        releaseTitle: failedTrack.releaseTitle || failedTrack.albumName || '',
        sourceProvider: service || failedTrack.sourceProvider || 'spotify',
        isPrivate: Boolean(failedTrack.isPrivate),
      };
      const found = await findTrackSource({ id: meta.id, artist: meta.artistName, title: meta.title }, stillCurrent);
      if (!stillCurrent()) return;
      if (found) {
        playFoundSource(found, {
          ...meta,
          sourceProvider: meta.sourceProvider,
          ...(service === 'spotify' ? { spotifyId: itemId } : {}),
          ...(service === 'applemusic' ? { appleMusicId: itemId } : {}),
          ...(service === 'tidal' ? { tidalId: itemId } : {}),
        }, mySeq);
        return;
      }
      dispatch({ type: 'SET_PLAYING', value: false });
    };
    return () => { delete window.__kyoyuRecoverStreamingFailure; };
  });

  // ── Shared helpers for resolving plays ──

  /** Show a track in the player immediately (no stream yet). */
  function showPlaceholder(meta) {
    const isPrivateMeta = Boolean(meta.isPrivate);
    const cleaned = splitCleanMetadata(meta.title || 'Loading...', meta.artistName || meta.artist || '', isPrivateMeta ? '' : (meta.label || ''), isPrivateMeta ? '' : (meta.releaseTitle || ''));
    const phDur = parseDurationSeconds(meta.duration);
    const track = {
      ...meta,
      src: '',
      title: cleaned.title || meta.title || 'Loading...',
      artistName: cleaned.artist || meta.artistName || meta.artist || '',
      label: isPrivateMeta ? '' : (cleaned.label || meta.label || ''),
      releaseTitle: isPrivateMeta ? '' : (cleaned.album || meta.releaseTitle || ''),
      duration: phDur > 0 ? phDur : (meta.duration || 0),
      isPrivate: isPrivateMeta,
    };
    try { window.webkit?.messageHandlers?.audioFallback?.postMessage({ url: '' }); } catch (e) {}
    dispatch({ type: 'PLAY_TRACK', track });
    try {
      window.webkit.messageHandlers.player.postMessage({
        visible: true,
        playing: true,
        trackId: String(track.id || ''),
        title: track.title,
        artist: track.artistName || '',
        label: isPrivateMeta ? '' : (track.label || ''),
        albumName: isPrivateMeta ? '' : (track.releaseTitle || ''),
        artwork: track.releaseCover || '',
        provider: track.provider || 'native',
        sourceProvider: track.sourceProvider || track.provider || 'native',
        isPrivate: isPrivateMeta,
        ...(phDur > 0 ? { dur: phDur } : {}),
      });
    } catch(e){}
    // Keep the ref in sync right away: a cached resolve can finish before React re-renders
    stateRef.current = { ...stateRef.current, currentTrack: track };
  }

  /** Play a source found by findTrackSource, keeping the visible metadata of `meta`. */
  function playFoundSource(found, meta, seq = masterPlaySeqRef.current) {
    const cleaned = splitCleanMetadata(meta.title || '', meta.artistName || meta.artist || '', meta.label || '', meta.releaseTitle || '');
    const title = cleaned.title || meta.title || '';
    const artist = cleaned.artist || meta.artistName || meta.artist || '';
    const releaseTitle = cleaned.album || meta.releaseTitle || '';
    const cover = meta.releaseCover || meta.cover || meta.artworkUrl || '';
    const sourceProvider = meta.sourceProvider || found.provider;
    if (found.provider === 'youtube') {
      playYouTube(found.videoId, {
        id: meta.id || `yt-${found.videoId}`,
        title,
        artist,
        releaseTitle,
        label: cleaned.label || meta.label || '',
        releaseCover: cover,
        thumbnail: cover,
        duration: found.duration || meta.duration,
        sourceProvider,
      }, { seq });
      return;
    }
    const isBc = found.provider === 'bandcamp';
    playTrack({
      id: meta.id || (found.scTrackId ? `sc-${found.scTrackId}` : ''),
      _restart: Date.now(),
      title,
      artistName: artist,
      releaseCover: cover,
      src: found.src,
      releaseTitle,
      label: cleaned.label || meta.label || '',
      year: meta.year || '',
      duration: found.duration || meta.duration || 0,
      providerUrl: found.providerItemId,
      sourceProvider,
      ...(meta.spotifyId ? { spotifyId: meta.spotifyId } : {}),
      ...(meta.appleMusicId ? { appleMusicId: meta.appleMusicId } : {}),
      ...(meta.tidalId ? { tidalId: meta.tidalId } : {}),
      ...(isBc
        ? { provider: 'bandcamp', providerItemId: found.providerItemId }
        : { provider: 'soundcloud', providerItemId: found.providerItemId, scTrackId: String(found.scTrackId || '') }),
      origin: isBc
        ? { provider: 'bandcamp', url: found.providerItemId }
        : { provider: 'soundcloud', scTrackId: String(found.scTrackId || ''), url: found.providerItemId || '' },
    });
  }

  /** Bandcamp track page → stream → play. If Bandcamp fails, the same song from SoundCloud/YouTube. */
  async function playBandcampOrFallback(meta, isCurrent) {
    let resolved = null;
    try { resolved = await resolveBandcamp(meta.url, meta.title); } catch (e) { resolved = null; }
    if (!isCurrent()) return;
    if (resolved?.streamUrl) {
      const mergedArtist = meta.artistName || resolved.artist || '';
      const mergedTitle = cleanTrackOrReleaseTitle(meta.title || resolved.title || '', mergedArtist);
      const rawMetaAlbum = cleanTrackOrReleaseTitle(meta.releaseTitle || '', mergedArtist);
      const rawResolvedAlbum = cleanTrackOrReleaseTitle(resolved.albumName || '', mergedArtist);
      const isMetaAlbumSameAsTitle = rawMetaAlbum && mergedTitle && rawMetaAlbum.toLowerCase() === mergedTitle.toLowerCase();
      const mergedAlbum = (rawResolvedAlbum && (!rawMetaAlbum || isMetaAlbumSameAsTitle))
        ? rawResolvedAlbum
        : (rawMetaAlbum || rawResolvedAlbum || '');
      const mergedLabel = meta.label || resolved.label || '';
      const mergedLabelUrl = meta.labelUrl || resolved.labelUrl || '';
      const mergedAlbumUrl = meta.albumUrl || resolved.albumUrl || '';
      playTrack({
        id: meta.id,
        _restart: Date.now(),
        title: mergedTitle || meta.title || resolved.title,
        artistName: mergedArtist,
        releaseCover: meta.releaseCover || resolved.artworkUrl || '',
        releaseTitle: mergedAlbum,
        albumUrl: mergedAlbumUrl,
        label: mergedLabel,
        labelUrl: mergedLabelUrl,
        year: meta.year || resolved.year || '',
        src: resolved.streamUrl,
        duration: resolved.duration || meta.duration || 0,
        provider: 'bandcamp',
        sourceProvider: meta.sourceProvider || 'bandcamp',
        providerItemId: meta.url,
        providerUrl: meta.url,
        origin: { provider: 'bandcamp', url: meta.url },
      });
      try {
        window.webkit?.messageHandlers?.player?.postMessage({
          trackId: String(meta.id || ''),
          albumName: mergedAlbum,
          label: mergedLabel,
          labelUrl: mergedLabelUrl,
          year: String(meta.year || resolved.year || ''),
        });
      } catch (e) {}
      return;
    }
    console.warn('[Player] Bandcamp stream unavailable, looking for the same song elsewhere:', meta.url);
    const found = await findTrackSource({ id: meta.id, artist: meta.artistName || '', title: meta.title || '' }, isCurrent);
    if (!isCurrent()) return;
    if (found) playFoundSource(found, meta);
    else dispatch({ type: 'SET_PLAYING', value: false });
  }

  // ── Saved items (History, Library likes, playlists): play the exact same provider/item ──
  const savedPlayCounterRef = useRef(0);
  async function playSaved(item, queue, opts = {}) {
    if (!item) return;
    savedPlayCounterRef.current += 1;
    const myCounter = savedPlayCounterRef.current;
    const mySeq = ++masterPlaySeqRef.current;
    // A saved-item tap is a standalone play, not part of a search-results queue
    if (!opts.keepSearchQueue) {
      searchQueueRef.current = [];
      searchQueueIdxRef.current = -1;
    }
    if (Array.isArray(queue) && queue.length) dispatch({ type: 'SET_QUEUE', queue });

    const r = historyReplayInfo(item);
    const isPrivateSaved = Boolean(item.isPrivate || item.origin?.isPrivate);
    const rawTitle = item.title || item.name || '';
    const rawArtist = item.artist || item.artistName || '';
    const rawLabel = isPrivateSaved ? '' : (item.label || item.labelName || item.releaseLabel || '');
    const rawAlbum = isPrivateSaved ? '' : (item.releaseTitle || item.album || '');
    const cleaned = splitCleanMetadata(rawTitle, rawArtist, rawLabel, rawAlbum);
    const title = cleaned.title || rawTitle;
    const artist = cleaned.artist || rawArtist;
    const label = isPrivateSaved ? '' : (cleaned.label || rawLabel);
    const releaseTitle = isPrivateSaved ? '' : (cleaned.album || rawAlbum);
    const cover = item.cover || item.releaseCover || item.artworkUrl || '';
    const id = item.id || `saved-${artist}-${title}`;
    const meta = {
      id,
      title,
      artistName: artist,
      label,
      labelUrl: item.labelUrl || '',
      year: item.year || item.releaseYear || '',
      albumUrl: isPrivateSaved ? '' : (item.albumUrl || ''),
      releaseCover: cover,
      duration: item.duration || 0,
      releaseTitle,
      isPrivate: isPrivateSaved,
    };
    const isCurrent = () => myCounter === savedPlayCounterRef.current && mySeq === masterPlaySeqRef.current && stateRef.current.currentTrack?.id === id;

    if (r.provider === 'youtube') {
      playYouTube(r.videoId, { id, title, artist, releaseTitle, label, thumbnail: cover, releaseCover: cover, duration: item.duration }, { seq: mySeq });
    } else if (r.provider === 'soundcloud') {
      playSoundCloud(r.url || '', { id, trackId: r.scTrackId, title, artistName: artist, releaseTitle, label, artworkUrl: cover, releaseCover: cover, duration: item.duration, isPrivate: isPrivateSaved }, { seq: mySeq });
    } else if (r.provider === 'bandcamp') {
      showPlaceholder({ ...meta, provider: 'bandcamp', sourceProvider: 'bandcamp', providerItemId: r.url, providerUrl: r.url, replay: r });
      await playBandcampOrFallback({ ...meta, url: r.url, sourceProvider: 'bandcamp' }, isCurrent);
    } else if (isStreamingProvider(r.provider)) {
      if (!opts.keepSearchQueue) {
        searchQueueRef.current = [];
        searchQueueIdxRef.current = -1;
      }
      await playStreamingItem(
        { id, provider: r.provider, providerItemId: r.itemId, title, artistName: artist, label, artworkUrl: cover, duration: item.duration || 0, releaseTitle: meta.releaseTitle, url: item.providerUrl || item.url || '', isPrivate: isPrivateSaved, strict: true },
        playSearchItemCounterRef.current += 1,
        mySeq,
      );
    } else if (r.provider === 'native') {
      playTrack({ ...item, id, title, artistName: artist, label, releaseTitle, releaseCover: cover, isPrivate: isPrivateSaved });
    } else {
      // No identity saved (older entries): find the song again by artist + title
      showPlaceholder({ ...meta, replay: r });
      const found = await findTrackSource({ id, artist, title }, isCurrent);
      if (!isCurrent()) return;
      if (found) playFoundSource(found, meta, mySeq);
      else dispatch({ type: 'SET_PLAYING', value: false });
    }
  }
  const playFromHistory = playSaved;

  function setSearchQueue(queue, startIndex) {
    searchQueueRef.current = queue;
    searchQueueIdxRef.current = startIndex;
  }

  function playNextSearch() {
    const q = searchQueueRef.current;
    const idx = searchQueueIdxRef.current;
    if (!q.length || idx < 0) return false;
    if (idx >= q.length - 1) {
      // End of search queue -> fallback to autoplay
      playNextAutoplay();
      return true;
    }
    const nextIdx = idx + 1;
    searchQueueIdxRef.current = nextIdx;
    playSearchItem(q[nextIdx]);
    return true;
  }

  function playPrevSearch() {
    const q = searchQueueRef.current;
    const idx = searchQueueIdxRef.current;
    if (!q.length || idx < 0) return false;
    if (idx <= 0) {
      return false;
    }
    const prevIdx = idx - 1;
    searchQueueIdxRef.current = prevIdx;
    playSearchItem(q[prevIdx]);
    return true;
  }

  function playPreviousListened() {
    const cur = stateRef.current.currentTrack;
    const curId = String(cur?.id || '');
    const curKey = cur ? (cur._hkey || historyKey(cur)) : '';
    const normStr = (s) => String(s || '').toLowerCase().trim();
    const curTitleArtist = cur ? `${normStr(cur.title)}::${normStr(cur.artistName || cur.artist)}` : '';

    const isSameAsCurrent = (item) => {
      if (!item || !cur) return false;
      const tid = String(item.id || '');
      const tkey = item._hkey || historyKey(item);
      if (curId && tid && curId === tid) return true;
      if (curKey && tkey && curKey === tkey) return true;
      const itemTitleArtist = `${normStr(item.title || item.name)}::${normStr(item.artistName || item.artist)}`;
      if (curTitleArtist && curTitleArtist !== '::' && curTitleArtist === itemTitleArtist) return true;
      return false;
    };

    // 1. Check the chronological listened stack (synced via localStorage across tabs)
    let stack = Array.isArray(listenedStackRef.current) ? [...listenedStackRef.current] : [];
    try {
      const rawStack = localStorage.getItem('kyoyu-back-stack-v1');
      if (rawStack) {
        const parsed = JSON.parse(rawStack);
        if (Array.isArray(parsed) && parsed.length > 0) stack = parsed;
      }
    } catch (e) {}

    // Pop any top entries matching the currently playing track
    let popped = 0;
    while (stack.length > 0 && isSameAsCurrent(stack[stack.length - 1])) {
      stack.pop();
      popped += 1;
    }
    // If the active WebView differed from the one that started the track, the top of stack is still the active track
    if (popped === 0 && stack.length >= 2) {
      stack.pop();
    }

    let prevTrack = stack.length > 0 ? stack[stack.length - 1] : null;

    // 2. Fallback to persistent play history (`kyoyu-play-history`) if stack has no prior entry
    if (!prevTrack) {
      try {
        const rawHist = localStorage.getItem('kyoyu-play-history');
        if (rawHist) {
          const hist = JSON.parse(rawHist);
          if (Array.isArray(hist)) {
            prevTrack = hist.find(t => t && !isSameAsCurrent(t)) || (hist.length >= 2 ? hist[1] : null);
          }
        }
      } catch (e) {}
    }

    if (prevTrack) {
      isSteppingBackRef.current = true;
      listenedStackRef.current = stack;
      try { localStorage.setItem('kyoyu-back-stack-v1', JSON.stringify(stack)); } catch (e) {}
      playSaved(prevTrack, stateRef.current.queue);
      return true;
    }

    // 3. Fallback to active searchQueue or queue reducer
    if (playPrevSearch()) return true;
    dispatch({ type: 'PREV_TRACK' });
    return true;
  }

  function isInSearchQueue() {
    return searchQueueRef.current.length > 0 && searchQueueIdxRef.current >= 0;
  }

  // ── JS Bridges for native Swift UI ─────────────────────────────────
  // These must be defined in PlayerProvider (always mounted) so Swift
  // can call them regardless of which sheet/page is currently open.

  useEffect(() => {
    // ── Queue bridge ──
    window.__kyoyuGlobalPlayTrack = (track, queue) => playTrack(track, queue);
    window.__kyoyuGlobalPlayYouTube = (videoId, metadata) => playYouTube(videoId, metadata);
    window.__kyoyuGlobalSetQueue = (queue) => dispatch({ type: 'SET_QUEUE', queue });
    window.__kyoyuPlaySaved = (item, queue) => playSaved(item, queue);
    window.__kyoyuGetCurrentTrack = () => stateRef.current.currentTrack;
    window.__kyoyuGetQueue = () => {
      const q = (stateRef.current?.queue?.length ? stateRef.current.queue : state.queue) || [];
      const searchQ = searchQueueRef.current || [];
      const nativeAlbTracks = (typeof window !== 'undefined' && Array.isArray(window.__kyoyuCurrentNativeAlbum?.tracks))
        ? window.__kyoyuCurrentNativeAlbum.tracks
        : [];
      let activeQueue = q.length > 0 ? [...q] : (searchQ.length > 0 ? [...searchQ] : [...nativeAlbTracks]);

      // Ensure the currently playing track is always included in the queue list
      const cur = stateRef.current.currentTrack || state.currentTrack;
      if (cur) {
        const curId = String(cur.id || '');
        const curTitle = String(cur.title || cur.name || '').trim().toLowerCase();
        const hasCurrent = activeQueue.some(t =>
          (curId && String(t.id || '') === curId) ||
          (curTitle && String(t.title || t.name || '').trim().toLowerCase() === curTitle)
        );
        if (!hasCurrent) {
          activeQueue = [cur, ...activeQueue];
        }
      }

      // Include prefetched autoplay track if queue only has current track
      const prefetched = prefetchedAutoplayRef.current?.item;
      if (prefetched && activeQueue.length <= 1) {
        activeQueue.push(prefetched);
      }

      const fallbackCover = (typeof window !== 'undefined' && window.__kyoyuCurrentNativeAlbum?.cover) || cur?.releaseCover || cur?.artworkUrl || cur?.cover || '';
      const fallbackArtist = (typeof window !== 'undefined' && window.__kyoyuCurrentNativeAlbum?.artist) || cur?.artistName || cur?.artist || '';

      return JSON.stringify(activeQueue.map((t, idx) => ({
        id: String(t.id || `queue-${idx}`),
        title: String(t.title || t.name || 'Unknown'),
        artist: t.artistName || t.artist || fallbackArtist || '',
        album: t.releaseTitle || t.albumTitle || t.album || '',
        cover: t.releaseCover || t.cover || t.artworkUrl || fallbackCover || '',
        url: t.src || t.audioUrl || t.fileUrl || t.trackUrl || t.providerUrl || t.url || '',
        videoId: t.videoId || (String(t.id || '').startsWith('yt-') ? String(t.id).slice(3) : ''),
        scTrackId: t.scTrackId || (String(t.id || '').startsWith('sc-') ? String(t.id).slice(3) : ''),
        provider: t.provider || t.sourceProvider || '',
      })));
    };

    window.__kyoyuPlayQueueItem = (index, trackId) => {
      const q = (stateRef.current?.queue?.length ? stateRef.current.queue : state.queue) || [];
      const searchQ = searchQueueRef.current || [];
      const nativeAlbTracks = (typeof window !== 'undefined' && Array.isArray(window.__kyoyuCurrentNativeAlbum?.tracks))
        ? window.__kyoyuCurrentNativeAlbum.tracks
        : [];

      const findInList = (list) => {
        if (!Array.isArray(list) || list.length === 0) return { item: null, idx: -1 };
        if (trackId) {
          const hitIdx = list.findIndex(t => String(t.id || '') === String(trackId));
          if (hitIdx !== -1) return { item: list[hitIdx], idx: hitIdx };
        }
        if (index >= 0 && index < list.length) {
          return { item: list[index], idx: index };
        }
        return { item: null, idx: -1 };
      };

      const fromQ = findInList(q);
      if (fromQ.item) {
        const item = fromQ.item;
        const rawUrl = String(item.src || item.audioUrl || item.fileUrl || item.trackUrl || item.url || '');
        if (rawUrl.startsWith('resolve:') && typeof window.__kyoyuPlayNativeTrack === 'function') {
          window.__kyoyuPlayNativeTrack(item.id);
        } else if (!item.src && !item.audioUrl && !item.fileUrl && (item.provider || item.scTrackId || item.videoId)) {
          playSaved(item, q);
        } else {
          playTrack(item, q);
        }
        return true;
      }

      const fromSearch = findInList(searchQ);
      if (fromSearch.item) {
        searchQueueIdxRef.current = fromSearch.idx;
        playSearchItem(fromSearch.item);
        return true;
      }

      const fromNative = findInList(nativeAlbTracks);
      if (fromNative.item && typeof window.__kyoyuPlayNativeTrack === 'function') {
        window.__kyoyuPlayNativeTrack(fromNative.item.id);
        return true;
      }
      return false;
    };

    window.__kyoyuRemoveFromQueue = (index, trackId) => {
      const q = [...((stateRef.current?.queue?.length ? stateRef.current.queue : state.queue) || [])];
      if (q.length > 0) {
        const rmIdx = trackId ? q.findIndex(t => String(t.id || '') === String(trackId)) : index;
        const targetIdx = rmIdx !== -1 ? rmIdx : index;
        if (targetIdx >= 0 && targetIdx < q.length) {
          q.splice(targetIdx, 1);
          dispatch({ type: 'SET_QUEUE', queue: q });
        }
      }
      if (Array.isArray(searchQueueRef.current) && searchQueueRef.current.length > 0) {
        const sq = [...searchQueueRef.current];
        const rmIdx = trackId ? sq.findIndex(t => String(t.id || '') === String(trackId)) : index;
        const targetIdx = rmIdx !== -1 ? rmIdx : index;
        if (targetIdx >= 0 && targetIdx < sq.length) {
          sq.splice(targetIdx, 1);
          searchQueueRef.current = sq;
        }
      }
    };

    window.__kyoyuMoveQueueItem = (fromIndex, toIndex) => {
      const f = Number(fromIndex);
      const t = Number(toIndex);
      if (!Number.isFinite(f) || !Number.isFinite(t) || f === t || f < 0 || t < 0) return false;
      const reorderList = (arr) => {
        if (!Array.isArray(arr) || f >= arr.length || t >= arr.length) return null;
        const copy = [...arr];
        const [moved] = copy.splice(f, 1);
        copy.splice(t, 0, moved);
        return copy;
      };
      const q = (stateRef.current?.queue?.length ? stateRef.current.queue : state.queue) || [];
      if (q.length > 0) {
        const nextQ = reorderList(q);
        if (nextQ) {
          dispatch({ type: 'SET_QUEUE', queue: nextQ });
          return true;
        }
      }
      if (Array.isArray(searchQueueRef.current) && searchQueueRef.current.length > 0) {
        const nextSq = reorderList(searchQueueRef.current);
        if (nextSq) {
          searchQueueRef.current = nextSq;
          return true;
        }
      }
      if (typeof window !== 'undefined' && Array.isArray(window.__kyoyuCurrentNativeAlbum?.tracks)) {
        const nextTracks = reorderList(window.__kyoyuCurrentNativeAlbum.tracks);
        if (nextTracks) {
          window.__kyoyuCurrentNativeAlbum.tracks = nextTracks;
          return true;
        }
      }
      return false;
    };

    // ── Comments bridge (Supabase) ──
    window.__kyoyuGetComments = async (trackId) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id || '';

        // Fetch all comments for the track (top-level + replies)
        const { data, error } = await supabase
          .from('comments')
          .select('id, content, created_at, user_id, parent_id, profiles(display_name, avatar_url)')
          .eq('track_id', trackId)
          .order('created_at', { ascending: true })
          .limit(200);
        if (error) {
          console.warn('Comments fetch error:', JSON.stringify(error));
          return '[]';
        }

        // Fetch all likes for these comments in one query
        const commentIds = (data || []).map(c => c.id);
        let likesMap = {}; // commentId -> { count, userLiked }
        if (commentIds.length > 0) {
          const { data: likes } = await supabase
            .from('comment_likes')
            .select('comment_id, user_id')
            .in('comment_id', commentIds);
          (likes || []).forEach(l => {
            if (!likesMap[l.comment_id]) likesMap[l.comment_id] = { count: 0, userLiked: false };
            likesMap[l.comment_id].count++;
            if (l.user_id === uid) likesMap[l.comment_id].userLiked = true;
          });
        }

        // Build comment tree: top-level comments with nested replies
        const allComments = (data || []).map(c => ({
          id: c.id,
          content: c.content,
          created_at: c.created_at,
          parent_id: c.parent_id || '',
          username: c.profiles?.display_name || 'User',
          avatar_url: c.profiles?.avatar_url || '',
          is_mine: c.user_id === uid,
          like_count: likesMap[c.id]?.count || 0,
          user_liked: likesMap[c.id]?.userLiked || false,
        }));

        // Separate into top-level and replies
        const topLevel = allComments.filter(c => !c.parent_id);
        const replies = allComments.filter(c => c.parent_id);
        // Attach replies to their parent
        const result = topLevel.map(c => ({
          ...c,
          replies: replies.filter(r => r.parent_id === c.id),
        }));
        // Reverse so newest first
        result.reverse();
        return JSON.stringify(result);
      } catch (err) { console.warn('Comments error:', err); return '[]'; }
    };

    window.__kyoyuPostComment = async (trackId, content, parentId) => {
      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) return JSON.stringify({ error: 'not_logged_in' });
        const insertObj = { track_id: trackId, user_id: user.id, content };
        if (parentId) insertObj.parent_id = parentId;
        const { data, error } = await supabase
          .from('comments')
          .insert(insertObj)
          .select('id, content, created_at, parent_id')
          .single();
        if (error) return JSON.stringify({ error: error.message });
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();
        return JSON.stringify({
          id: data?.id || '',
          content: data?.content || content,
          created_at: data?.created_at || new Date().toISOString(),
          parent_id: data?.parent_id || '',
          username: profile?.display_name || 'You',
          avatar_url: profile?.avatar_url || '',
          is_mine: true,
          like_count: 0,
          user_liked: false,
          replies: [],
        });
      } catch (err) { return JSON.stringify({ error: String(err) }); }
    };

    window.__kyoyuDeleteComment = async (commentId) => {
      try {
        const { error } = await supabase
          .from('comments')
          .delete()
          .eq('id', commentId);
        return error ? 'error' : 'ok';
      } catch (e) { return 'error'; }
    };

    window.__kyoyuLikeComment = async (commentId) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return JSON.stringify({ error: 'not_logged_in' });
        const { error } = await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
        if (error && error.code === '23505') {
          // Already liked → unlike
          await supabase
            .from('comment_likes')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', user.id);
          return JSON.stringify({ liked: false });
        }
        return JSON.stringify({ liked: !error });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    };

    // ── Track Info bridge ── pre-fetch on track change, return from cache
    // In-memory cache for current session (keyed by lookup key)
    if (!window.__kyoyuInfoCache) window.__kyoyuInfoCache = {};

    const syncResolvedTrackMetaToBridge = (data, reqTitle, reqArtist) => {
      if (!data || typeof data !== 'object') return;
      const cur = stateRef.current.currentTrack;
      if (!cur) return;
      const curTitle = String(cur.title || cur.name || '').trim().toLowerCase();
      const curArtistRaw = String(cur.artistName || cur.artist || '').trim();
      const curArtist = curArtistRaw.toLowerCase();
      if (reqTitle && curTitle && curTitle !== String(reqTitle).trim().toLowerCase()) return;
      if (reqArtist && curArtist && !curArtist.includes(String(reqArtist).trim().toLowerCase()) && !String(reqArtist).trim().toLowerCase().includes(curArtist)) return;

      const normLbl = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, '');
      const artistNorm = normLbl(curArtistRaw);
      const artistCollabs = curArtistRaw.split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(normLbl).filter(Boolean);
      const isValidLabel = (cand) => {
        const clean = String(cand || '').trim();
        if (!clean || clean === '—' || clean === '-') return false;
        if (/^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?|track\s+radio|radio)$/i.test(clean)) return false;
        const cNorm = normLbl(clean);
        if (!cNorm) return false;
        if (artistNorm && cNorm === artistNorm) return false;
        if (artistCollabs.includes(cNorm)) return false;
        return true;
      };

      const resolvedAlb = cleanTrackOrReleaseTitle(String(data.album || '').replace(/\s*\(single\)\s*$/i, '').trim(), curArtistRaw);
      const curAlb = String(cur.releaseTitle || cur.albumTitle || cur.album || '').trim();
      const shouldUpdateAlb = resolvedAlb && !/^unknown/i.test(resolvedAlb) && (!curAlb || curAlb.toLowerCase() === curTitle);
      const rawResolvedLbl = String(data.labelName || data.label || '').replace(/\[.*?\]/g, '').replace(/\(sub-label.*?\)/i, '').split('—')[0].trim();
      const resolvedLbl = isValidLabel(rawResolvedLbl) ? rawResolvedLbl : '';
      const resolvedYr = data.year ? String(data.year) : '';
      const bcLink = Array.isArray(data.links) ? (data.links.find(l => l && typeof l.url === 'string' && l.url.includes('bandcamp.com'))?.url || '') : '';
      const bcOrigin = (() => {
        try { return bcLink ? new URL(bcLink).origin : ''; } catch { return ''; }
      })();

      const patch = {};
      if (shouldUpdateAlb) {
        cur.releaseTitle = resolvedAlb;
        patch.albumName = resolvedAlb;
      }
      const curLblValid = isValidLabel(cur.label);
      if (resolvedLbl && !curLblValid) {
        cur.label = resolvedLbl;
        patch.label = resolvedLbl;
      } else if (curLblValid) {
        data.label = String(cur.label).trim();
        data.labelName = String(cur.label).trim();
      } else if (!curLblValid && cur.label) {
        cur.label = '';
        patch.label = '';
      }
      if (bcOrigin && !cur.labelUrl) {
        cur.labelUrl = bcOrigin;
        patch.labelUrl = bcOrigin;
      }
      if (resolvedYr && !cur.year) {
        cur.year = resolvedYr;
        patch.year = resolvedYr;
      }
      if (Object.keys(patch).length > 0) {
        try { window.webkit?.messageHandlers?.player?.postMessage(patch); } catch (e) {}
      }
    };

    // Prefetch: called by Swift on track change — warms the cache
    window.__kyoyuPrefetchTrackInfo = async (trackId, title, artist, album, provider, label) => {
      try {
        const cur = stateRef.current.currentTrack || {};
        const knownLabel = String(label || cur.label || '').trim();
        const key = [artist, title, album].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
        if (!key) return;
        if (window.__kyoyuInfoCache[key] && window.__kyoyuInfoCache[key]._v === 19) {
          syncResolvedTrackMetaToBridge(window.__kyoyuInfoCache[key], title, artist);
          return;
        }
        const res = await fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'track-info', title, artist, album, provider, trackId, knownLabel })
        });
        if (res.ok) {
          const data = await res.json();
          window.__kyoyuInfoCache[key] = data;
          syncResolvedTrackMetaToBridge(data, title, artist);
        }
      } catch (e) { console.warn('Prefetch info error:', e); }
    };

    // Expose current track getter for native/web genre & artist sheets
    window.__kyoyuGetCurrentTrack = () => stateRef.current.currentTrack;

    // Expose share payload getter for native iOS share sheet
    window.__kyoyuGetShareInfo = () => {
      const cur = stateRef.current.currentTrack || {};
      const title = String(cur.title || cur.name || '').trim();
      const artist = String(cur.artistName || cur.artist || '').trim();
      const album = String(cur.releaseTitle || cur.albumTitle || cur.album || '').trim();
      let url = String(cur.providerUrl || cur.trackUrl || cur.url || cur.providerItemId || cur.origin?.url || '').trim();
      if (url.startsWith('resolve:')) url = '';
      if (!url && (cur.videoId || (cur.provider === 'youtube' && cur.providerItemId))) {
        url = `https://www.youtube.com/watch?v=${cur.videoId || cur.providerItemId}`;
      }
      if (!url && cur.spotifyId) {
        url = `https://open.spotify.com/track/${String(cur.spotifyId).replace(/^sp-/, '')}`;
      }
      if (!url && cur.tidalId) {
        url = `https://tidal.com/browse/track/${String(cur.tidalId).replace(/^td-/, '')}`;
      }
      return JSON.stringify({ title, artist, album, url });
    };

    // Get cached info: called when user opens info panel — returns instantly
    window.__kyoyuGetTrackInfo = async (trackId, title, artist, album, provider, label) => {
      try {
        const cur = stateRef.current.currentTrack || {};
        const curTitle = String(cur.title || cur.name || '').trim().toLowerCase();
        const curArtist = String(cur.artistName || cur.artist || '').trim().toLowerCase();
        const curAlbum = String(cur.releaseTitle || cur.albumTitle || cur.album || '').trim().toLowerCase();
        const reqTitle = String(title || '').trim().toLowerCase();
        const reqArtist = String(artist || '').trim().toLowerCase();
        const reqAlbum = String(album || '').trim().toLowerCase();
        const isCurrentPlayingMatch = Boolean(
          (trackId && cur.id && String(trackId) === String(cur.id)) ||
          (reqTitle && curTitle && reqTitle === curTitle && (!reqArtist || !curArtist || reqArtist === curArtist)) ||
          (reqAlbum && curAlbum && reqAlbum === curAlbum && (!reqArtist || !curArtist || reqArtist === curArtist))
        );
        const knownLabel = String(label || (isCurrentPlayingMatch ? cur.label : '') || '').trim();
        const key = [artist, title, album].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
        // Return from cache if available
        if (window.__kyoyuInfoCache[key] && window.__kyoyuInfoCache[key]._v === 19) {
          syncResolvedTrackMetaToBridge(window.__kyoyuInfoCache[key], title, artist);
          return JSON.stringify(window.__kyoyuInfoCache[key]);
        }
        // Cache miss — fetch synchronously (shouldn't happen often since prefetch runs on track change)
        const res = await fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'track-info', title, artist, album, provider, trackId, knownLabel })
        });
        if (res.ok) {
          const data = await res.json();
          window.__kyoyuInfoCache[key] = data;
          syncResolvedTrackMetaToBridge(data, title, artist);
          return JSON.stringify(data);
        }
        return JSON.stringify({ description: 'Could not fetch info.', genre: '', label: knownLabel, labelName: knownLabel, year: '', links: [] });
      } catch (err) {
        console.warn('Track info error:', err);
        return JSON.stringify({ description: 'Error loading info.', genre: '', label: '', year: '', links: [] });
      }
    };

    // Report info errors
    window.__kyoyuReportInfo = async (trackId, title, artist, message) => {
      try {
        // supabase imported at top
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 'not_logged_in';
        const lookupKey = [artist, title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
        const { error } = await supabase.from('info_reports').insert({
          lookup_key: lookupKey,
          track_id: trackId,
          title,
          artist,
          user_id: user.id,
          message,
        });
        if (error) { console.warn('Report error:', error); return 'error'; }
        return 'ok';
      } catch (e) { console.warn('Report error:', e); return 'error'; }
    };

    return () => {
      delete window.__kyoyuGetQueue;
      delete window.__kyoyuPlayQueueItem;
      delete window.__kyoyuRemoveFromQueue;
      delete window.__kyoyuGetComments;
      delete window.__kyoyuPostComment;
      delete window.__kyoyuGetTrackInfo;
      delete window.__kyoyuPrefetchTrackInfo;
      delete window.__kyoyuReportInfo;
    };
  }); // No deps — always re-bind so closures see latest state

  const AUTOPLAY_TIMEOUT_MS = 6000;

  /** 'Next' that ALWAYS ends in sound: queue → radio-style autoplay → replay current. */
  /** The YouTube iframe can't play this video (blocked / never starts): same song elsewhere, else the next track. */
  const ytRecoverRef = useRef('');
  async function recoverYouTubeFailure() {
    const cur = stateRef.current.currentTrack;
    if (!cur) return;
    const id = cur.id;
    if (ytRecoverRef.current === id) { playNextAutoplay(); return; }
    ytRecoverRef.current = id;
    const stillCurrent = () => stateRef.current.currentTrack?.id === id;
    let found = null;
    try { found = await findTrackSource({ artist: cur.artistName || cur.artist || '', title: cur.title || '' }, stillCurrent); } catch (e) {}
    if (!stillCurrent()) return;
    if (found && found.provider !== 'youtube') {
      playFoundSource(found, { id, title: cur.title, artistName: cur.artistName || cur.artist, releaseCover: cur.releaseCover, duration: cur.duration });
    } else {
      playNextAutoplay();
    }
  }

  const prefetchedAutoplayRef = useRef({ trackId: '', item: null });

  // Pre-compute prevArtwork & nextArtwork (including background autoplay prefetch) so native artwork swipe can morph old -> new live during finger drag
  useEffect(() => {
    const cur = state.currentTrack;
    if (!cur || cur.title === 'Loading...') return;
    let cancelled = false;

    const getCover = (t) => String(t?.releaseCover || t?.cover || t?.artworkUrl || t?.thumbnail || '').trim();
    const normStr = (s) => String(s || '').toLowerCase().trim();
    const curId = String(cur.id || '');
    const curTA = `${normStr(cur.title)}::${normStr(cur.artistName || cur.artist)}`;

    // 1. Determine previous track artwork
    let prevArt = '';
    try {
      const rawStack = localStorage.getItem('kyoyu-back-stack-v1');
      if (rawStack) {
        const stack = JSON.parse(rawStack);
        if (Array.isArray(stack)) {
          for (let i = stack.length - 1; i >= 0; i--) {
            const item = stack[i];
            if (!item) continue;
            const tid = String(item.id || '');
            const ita = `${normStr(item.title || item.name)}::${normStr(item.artistName || item.artist)}`;
            if ((curId && tid === curId) || (curTA !== '::' && ita === curTA)) continue;
            const c = getCover(item);
            if (c) { prevArt = c; break; }
          }
        }
      }
      if (!prevArt) {
        const rawHist = localStorage.getItem('kyoyu-play-history');
        if (rawHist) {
          const hist = JSON.parse(rawHist);
          if (Array.isArray(hist)) {
            const prevItem = hist.find(item => {
              if (!item) return false;
              const tid = String(item.id || '');
              const ita = `${normStr(item.title || item.name)}::${normStr(item.artistName || item.artist)}`;
              return !((curId && tid === curId) || (curTA !== '::' && ita === curTA));
            });
            if (prevItem) prevArt = getCover(prevItem);
          }
        }
      }
    } catch (e) {}

    // 2. Determine next track artwork from explicit queue or searchQueue
    let nextArt = '';
    const q = state.queue || [];
    if (q.length > 0) {
      const idx = q.findIndex(t => t.id === cur.id);
      if (idx >= 0 && idx < q.length - 1) {
        nextArt = getCover(q[idx + 1]);
      }
    }
    if (!nextArt) {
      const sq = searchQueueRef.current || [];
      const sIdx = searchQueueIdxRef.current;
      if (sq.length > 0 && sIdx >= 0 && sIdx < sq.length - 1) {
        nextArt = getCover(sq[sIdx + 1]);
      }
    }

    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        prevArtwork: prevArt,
        nextArtwork: nextArt,
      });
    } catch (e) {}

    // 3. If no explicit next track is queued, pre-resolve autoplay in the background so swipe-left morphs immediately
    if (!nextArt && prefetchedAutoplayRef.current.trackId !== curId) {
      (async () => {
        try {
          const replayProv = historyReplayInfo(cur).provider;
          const trueProvider = (replayProv && replayProv !== 'lookup') ? replayProv : (cur.provider || 'native');
          const res = await Promise.race([
            resolveAutoplay({ ...cur, provider: trueProvider }),
            new Promise(resolve => setTimeout(() => resolve(null), AUTOPLAY_TIMEOUT_MS)),
          ]);
          if (cancelled || stateRef.current.currentTrack?.id !== cur.id) return;
          const next = Array.isArray(res) ? res[0] : null;
          if (next) {
            prefetchedAutoplayRef.current = { trackId: curId, item: next };
            const resolvedNextArt = getCover(next);
            if (resolvedNextArt) {
              try {
                window.webkit?.messageHandlers?.player?.postMessage({
                  nextArtwork: resolvedNextArt,
                });
              } catch (e) {}
            }
          }
        } catch (e) {}
      })();
    }

    return () => { cancelled = true; };
  }, [state.currentTrack?.id, state.currentTrack?.title, state.queue.length]);

  async function playNextAutoplay() {
    const s = stateRef.current;          // always fresh (this can be called from long-lived listeners)
    const cur = s.currentTrack;
    if (!cur) return;

    // 1. An explicit queue (album / playlist / saved list) with a following track
    if (s.queue.length > 0) {
      const idx = s.queue.findIndex(t => t.id === cur.id);
      if (idx >= 0 && idx < s.queue.length - 1) {
        const nxt = s.queue[idx + 1];
        // A track whose stream URL was dropped (restored session) must be re-resolved, not just "selected"
        if (nxt && !(nxt.src || nxt.audioUrl || nxt.fileUrl)) { playSaved(nxt); return; }
        dispatch({ type: 'NEXT_TRACK' });
        return;
      }
    }

    // 2. Use pre-fetched autoplay candidate immediately if available for this track
    const prefetched = (prefetchedAutoplayRef.current.trackId === String(cur.id || ''))
      ? prefetchedAutoplayRef.current.item
      : null;
    if (prefetched) {
      prefetchedAutoplayRef.current = { trackId: '', item: null };
      const q = searchQueueRef.current;
      const i = searchQueueIdxRef.current;
      if (q.length > 0 && i >= 0) {
        searchQueueRef.current = [...q.slice(0, i + 1), prefetched];
        searchQueueIdxRef.current = i + 1;
      } else {
        searchQueueRef.current = [prefetched];
        searchQueueIdxRef.current = 0;
      }
      playSearchItem(prefetched);
      return;
    }

    // 3. Radio-style autoplay fallback if prefetch hasn't finished yet
    if (isResolvingAutoplayRef.current) return;
    isResolvingAutoplayRef.current = true;
    try {
      let next = null;
      try {
        const replayProv = historyReplayInfo(cur).provider;
        const trueProvider = (replayProv && replayProv !== 'lookup') ? replayProv : (cur.provider || 'native');
        const res = await Promise.race([
          resolveAutoplay({ ...cur, provider: trueProvider }),

          new Promise(resolve => setTimeout(() => resolve(null), AUTOPLAY_TIMEOUT_MS)),
        ]);
        next = Array.isArray(res) ? res[0] : null;
      } catch (e) { console.warn('[Player] autoplay resolve failed:', e); }

      // The user moved on while we were looking (picked another track) → don't hijack
      if (stateRef.current.currentTrack?.id !== cur.id) return;

      if (next) {
        // Extend the search queue so prev/next keep walking this chain of suggestions
        const q = searchQueueRef.current;
        const i = searchQueueIdxRef.current;
        if (q.length > 0 && i >= 0) {
          searchQueueRef.current = [...q.slice(0, i + 1), next];
          searchQueueIdxRef.current = i + 1;
        } else {
          searchQueueRef.current = [next];
          searchQueueIdxRef.current = 0;
        }
        playSearchItem(next);
      } else {
        // 4. Nothing found: never end in silence — replay the current track
        console.warn('[Player] autoplay found nothing, replaying current track');
        if (stateRef.current.restoredPending) resumeRestoredSession();
        else dispatch({ type: 'RESTART_CURRENT' });

      }
    } finally {
      isResolvingAutoplayRef.current = false;
    }
  }

  // ── Session persistence: the app follows the user ───────────────────────────
  // Survives WebView process kills / relaunches (localStorage lives in the persistent data store).
  const SESSION_KEY = 'kyoyu-session';
  const SESSION_MAX_AGE_MS = 14 * 24 * 3600 * 1000;
  const stripExpiring = (t) => {
    if (!t) return t;
    const out = { ...t };
    for (const k of ['src', 'audioUrl', 'fileUrl', 'url']) {
      if (typeof out[k] === 'string' && (EXPIRING_SRC.test(out[k]) || out[k].startsWith('resolve:') || out[k].startsWith('blob:'))) out[k] = '';
    }
    delete out._restart;
    return out;
  };
  const saveSession = useCallback(() => {
    try {
      const s = stateRef.current;
      if (!s.currentTrack) return;       // never wipe on startup (before restore); see stop-effect below
      if (s.restoredPending) return;     // nothing changed since restore

      const replay = historyReplayInfo(s.currentTrack);
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        track: { ...stripExpiring(s.currentTrack), replay },
        queue: (s.queue || []).slice(0, 60).map(t => ({ ...stripExpiring(t), replay: historyReplayInfo(t) })),
        progress: s.progress || 0,
        duration: s.duration || 0,
        savedAt: Date.now(),
      }));
    } catch (e) { /* storage full / unavailable */ }
  }, []);

  // Restore the last session (paused) once, inside the iOS app only
  useEffect(() => {
    if (!window.__kyoyuIsNativeApp || window.__kyoyuTabIndex !== 0) return;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw || stateRef.current.currentTrack) return;
      const sess = JSON.parse(raw);
      if (!sess?.track || Date.now() - (sess.savedAt || 0) > SESSION_MAX_AGE_MS) return;
      dispatch({ type: 'RESTORE_SESSION', track: sess.track, queue: sess.queue, progress: sess.progress, duration: sess.duration });
    } catch (e) { /* corrupt → ignore */ }
  }, []);

  // Save on track change, on pause/play, and every 2 s while playing (position)
  const hadTrackRef = useRef(false);
  useEffect(() => {
    if (state.currentTrack) { hadTrackRef.current = true; return; }
    if (hadTrackRef.current) { hadTrackRef.current = false; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  }, [!!state.currentTrack]);

  useEffect(() => { saveSession(); }, [state.currentTrack?.id, state.isPlaying, state.queue.length, saveSession]);
  useEffect(() => {
    if (!state.currentTrack) return;
    const t = setInterval(saveSession, 2000);
    return () => clearInterval(t);
  }, [!!state.currentTrack, saveSession]);

  /** First 'play' after a restore: re-resolve a fresh stream (old ones expire) and continue at the saved position. */
  function resumeRestoredSession() {
    const s = stateRef.current;
    const t = s.currentTrack;
    if (!t || !s.restoredPending) return false;
    pendingSeekRef.current = { id: t.id, pos: s.progress || 0 };
    playSaved(t);
    return true;
  }

  // Resumed non-AVPlayer providers (YouTube, Apple Music, Spotify): seek once they're really playing
  useEffect(() => {
    const ps = pendingSeekRef.current;
    if (!ps || state.restoredPending || state.provider === 'native') return;
    if (state.currentTrack?.id !== ps.id || !(state.duration > 0) || !state.isPlaying) return;
    pendingSeekRef.current = null;
    if (ps.pos > 1) window.__kyoyuPlayerCmd?.('seekTo', ps.pos);
  }, [state.duration, state.provider, state.isPlaying, state.restoredPending]); // eslint-disable-line

  // Swift → web: the audio engine's truth after the app returns to the foreground
  useEffect(() => {
    window.__kyoyuResync = ({ position, playing } = {}) => {
      const s = stateRef.current;
      if (!s.currentTrack || s.restoredPending) return;
      if (typeof playing === 'boolean' && playing !== s.isPlaying) dispatch({ type: 'SET_PLAYING', value: playing });
      if (typeof position === 'number' && isFinite(position)) dispatch({ type: 'SET_PROGRESS', value: position });
    };
    window.__kyoyuSaveSession = saveSession;
    return () => { delete window.__kyoyuResync; delete window.__kyoyuSaveSession; };
  }, [saveSession]);


  // Override the native onEnded
  return (
    <PlayerContext.Provider value={{
      state, dispatch, playTrack, playRelease, playYouTube, playSoundCloud,
      seekTo, setVolume, setAudioVolumeDirect, allTracks,
      setSearchQueue, playSearchItem, playNextSearch, playPrevSearch, playPreviousListened, isInSearchQueue, playNextAutoplay,
      resumeRestoredSession,
      recoverYouTubeFailure,
      playFromHistory, playSaved

    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() { return useContext(PlayerContext); }

