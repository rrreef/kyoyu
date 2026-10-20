import { createContext, useContext, useReducer, useRef, useEffect, useCallback } from 'react';
import { releases, djSets } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { resolveBandcamp, invalidateBandcampResolve } from '../lib/unifiedSearch';
import { findTrackSource } from '../lib/resolveTrack';
import { activePlaybackService, findStreamingMatch, callStreaming, refreshStreamingStatus, isStreamingAvailable, isStreamingProvider } from '../lib/streaming';
import { resolveAutoplay } from '../lib/autoplay-resolver';

const PlayerContext = createContext(null);

// ── History replay identity ──
// Stream URLs from these hosts are signed/expiring, so they can never be replayed later.
const EXPIRING_SRC = /bcbits\.com|sndcdn\.com|googlevideo\.com/i;

/** Work out how a played track can be replayed later (exact same provider + item). */
export function historyReplayInfo(t) {
  if (!t) return { provider: 'lookup' };
  if (t.replay?.provider) return t.replay;
  if (t.origin?.provider) return t.origin;
  const id = String(t.id || '');
  if (t.provider === 'youtube' && (t.videoId || t.providerItemId)) return { provider: 'youtube', videoId: t.videoId || t.providerItemId };
  if (/^yt-/.test(id)) return { provider: 'youtube', videoId: id.slice(3) };
  // Apple Music / Spotify / TIDAL items replay through their own engine (never a lookalike from YouTube)
  if (isStreamingProvider(t.provider) && (t.providerItemId || t.spotifyId || t.tidalId)) {
    return { provider: t.provider, itemId: String(t.providerItemId || t.spotifyId || t.tidalId).replace(/^(am|sp|td)-/, '') };
  }
  if (t.provider === 'soundcloud' || /^sc-\d+/.test(id)) {
    const scId = t.scTrackId || (id.match(/^sc-(\d+)/) || [])[1];
    if (scId) return { provider: 'soundcloud', scTrackId: String(scId), url: t.providerUrl || t.providerItemId || '' };
  }
  if (t.provider === 'bandcamp' && /^https?:\/\//.test(t.providerItemId || '')) return { provider: 'bandcamp', url: t.providerItemId };
  const src = t.src || t.fileUrl || t.audioUrl || '';
  if (src && !src.startsWith('resolve:') && !EXPIRING_SRC.test(src)) return { provider: 'native' };
  // No identity (old entries / unresolved placeholders): find it again by artist + title
  return { provider: 'lookup' };
}

/** Provider identity of a track, so a saved copy (like, playlist, download) replays the exact same source. */
export function trackIdentity(t) {
  if (!t) return {};
  const out = {};
  for (const k of ['provider', 'providerItemId', 'providerUrl', 'scTrackId', 'spotifyId', 'appleMusicId', 'tidalId', 'videoId', 'origin']) {
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

// Actions that must NOT clear a restored (paused, not-yet-loaded) session
const KEEP_RESTORED = new Set(['SET_PROGRESS', 'SET_DURATION', 'SET_VOLUME', 'SET_QUEUE', 'TOGGLE_SHUFFLE', 'CYCLE_REPEAT', 'RESTORE_SESSION', 'NATIVE_ERROR']);
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
    case 'PLAY_TRACK':
      // We ALWAYS set provider to 'native' because PLAY_TRACK handles actual mp3 streams.
      // (YouTube has its own PLAY_YOUTUBE action).
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: 0,
               provider: 'native', providerItemId: null, providerUrl: null };
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
    // Skip native audio loading for external providers
    if (state.provider !== 'native') return;

    
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
      } catch(e) {}
      return;
    }

    // Increment play ID to cancel any pending play from previous track
    const myPlayId = ++playIdRef.current;

    // ── Send URL directly to native AVPlayer (iOS) ──
    // Don't rely on the play() JS override to read currentSrc — it's racy.
    // We know the exact URL from the track object.
    try {
      const mh = window.webkit?.messageHandlers;
      if (mh?.audioFallback) {
        if (state.currentTrack?.provider === 'youtube') {
          // If switching to YouTube, explicitly kill the native AVPlayer so old audio stops!
          mh.audioFallback.postMessage({ url: '' });
        } else {
          if (window.__kyoyuTrack) window.__kyoyuTrack.lastSentUrl = src;
          // Resumed session: start exactly where the user left off
          const ps = pendingSeekRef.current;
          let seekTo = 0;
          if (ps && ps.id === state.currentTrack.id && ps.pos > 1) { seekTo = ps.pos; pendingSeekRef.current = null; }
          mh.audioFallback.postMessage(seekTo > 0 ? { url: src, seekTo } : { url: src });
        }

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
      if (dbDuration > 0) dispatch({ type:'SET_DURATION', value: dbDuration });
    }

    // Load web audio (muted) for scrubber/duration UI ONLY if it's not a native provider
    // Native providers (iOS) handle their own playback. Assigning native streams to the web audio tag
    // causes CORS errors or 0-duration immediate 'ended' events that cause rapid phantom skipping!
    const isNativeProvider = state.currentTrack.provider === 'native' || state.currentTrack.provider === 'bandcamp' || state.currentTrack.provider === 'soundcloud';
    const isNativeIOS = !!window.webkit?.messageHandlers?.audioFallback;
    
    if (isNativeIOS && isNativeProvider) {
      audio.removeAttribute('src');
      audio.load();
    } else {
      audio.src = src;
      audio.load();
    }

    // Play muted web audio when ready (for scrubber tracking)
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
  }, [state.currentTrack?.id, state.currentTrack?._restart, state.restoredPending, state.currentTrack?.src || state.currentTrack?.fileUrl || state.currentTrack?.audioUrl || '']); // eslint-disable-line


  // ── Play / pause sync ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.restoredPending) return;
    // External providers handle their own play/pause
    if (state.provider !== 'native') return;

    if (state.isPlaying) {
      audio.play().catch(() => {});
      // On native iOS, also directly tell AVPlayer (the web audio path is unreliable)
      try {
        const mh = window.webkit?.messageHandlers?.audioFallback;
        if (mh) mh.postMessage('resume');
      } catch(e) {}
    } else {
      audio.pause();
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
    const normTrack = {
      ...track,
      src: track.src || track.fileUrl || track.audioUrl || '',
      artistName: track.artistName || track.artist || '',
      releaseCover: track.releaseCover || track.cover || '',
    };
    dispatch({ type:'PLAY_TRACK', track: normTrack }); try { window.webkit.messageHandlers.player.postMessage({ visible: true, playing: true, title: track.title || track.name || '', artwork: track.releaseCover || track.cover || track.artworkUrl || '' }); } catch(e){} 
    const normQueue = queue.map(t => ({
      ...t,
      src: t.src || t.fileUrl || t.audioUrl || '',
      artistName: t.artistName || t.artist || '',
      releaseCover: t.releaseCover || t.cover || '',
    }));
    if (normQueue.length) dispatch({ type:'SET_QUEUE', queue: normQueue });
    // Note: actual audio loading happens in the useEffect above (triggered by PLAY_TRACK)
  }

  function playRelease(release) {
    if (!release?.tracks?.length) return;
    const tracks = release.tracks.map(t => ({
      ...t,
      releaseId:    release.id,
      releaseCover: t.cover || release.cover,
      releaseTitle: release.title,
      artistName:   t.artist || release.artist,
      // Normalise audio source: public tracks use audioUrl (R2)
      src:          t.src || t.fileUrl || t.audioUrl || '',
    }));
    playTrack(tracks[0], tracks);
  }

  const playYouTubeCounterRef = useRef(0);
  function playYouTube(videoId, metadata = {}, opts = {}) {
    // Playlist ("PL…") / channel ("UC…") ids are not videos and would load forever
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) { console.warn('[Player] ignoring invalid YouTube video id', videoId); return; }
    const myCounter = ++playYouTubeCounterRef.current;
    const title = metadata.title || 'YouTube Video';
    const artistName = metadata.channelTitle || metadata.artist || '';
    const releaseCover = metadata.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const providerUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const origin = { provider: 'youtube', videoId };

    // Fallback engine: the YouTube iframe (foreground only on iOS, but works when the stream can't be resolved)
    const startIframe = () => {
      if (myCounter !== playYouTubeCounterRef.current) return;
      const track = {
        id: `yt-${videoId}`, title, artistName, releaseCover, duration: metadata.duration || 0,
        src: '', provider: 'youtube', providerItemId: videoId,
      };
      dispatch({ type: 'PLAY_YOUTUBE', videoId, track }); try { window.webkit.messageHandlers.player.postMessage({ visible: true, playing: true, title: track.title || track.name || '', artwork: track.releaseCover || track.cover || track.artworkUrl || '' }); } catch(e){}
    };

    // iOS app: play the YouTube audio stream with AVPlayer — exactly like SoundCloud / Bandcamp
    // (background playback, lock screen, Dynamic Island, no iframe). Resolved on the device.
    if (opts.forceIframe || !isStreamingAvailable()) { startIframe(); return; }

    nativeRetryRef.current = '';
    showPlaceholder({ id: `yt-${videoId}`, title, artistName, releaseCover, duration: metadata.duration || 0, videoId, providerUrl, origin });
    (async () => {
      let res = null;
      try { res = await callStreaming('ytResolve', { videoId }, 15000); } catch (e) { res = null; window.__kyoyuYtError = e?.message || String(e); }
      if (myCounter !== playYouTubeCounterRef.current) return;
      if (!res?.url) { startIframe(); return; }
      playTrack({
        id: `yt-${videoId}`, title, artistName, releaseCover,
        duration: res.duration || metadata.duration || 0,
        src: res.url, videoId, providerUrl, origin,
      });
    })();
  }

  const playSoundCloudCounterRef = useRef(0);
  async function playSoundCloud(trackUrl, metadata = {}) {
    playSoundCloudCounterRef.current += 1;
    const myCounter = playSoundCloudCounterRef.current;
    // Extract numeric track ID from metadata or the item id (e.g. "sc-88335161")
    let trackId = metadata.trackId;
    if (!trackId && metadata.id) {
      const m = String(metadata.id).match(/^sc-(\d+)$/);
      if (m) trackId = m[1];
    }
    if (!trackId && metadata.scTrackId) trackId = metadata.scTrackId;

    if (!trackId) {
      console.warn('[Player] SoundCloud: no trackId available, cannot resolve stream');
      return;
    }

    // Show the track in the player UI immediately while resolving. This is a plain native placeholder
    // (provider stays 'native', src ''), exactly like Bandcamp: mounting the SoundCloud widget iframe here
    // flashed a white full-screen window behind the sheet and is not needed (we play the stream via AVPlayer).
    const placeholderTrack = {
      id: `sc-${trackId}`,
      title: metadata.title || 'SoundCloud Track',
      artistName: metadata.artistName || metadata.artist || '',
      releaseCover: metadata.artworkUrl || '',
      duration: metadata.duration || 0,
      src: '',
      provider: 'soundcloud',
      providerUrl: trackUrl,
      providerItemId: trackUrl,
      scTrackId: String(trackId),
      origin: { provider: 'soundcloud', scTrackId: String(trackId), url: trackUrl || '' },
    };
    showPlaceholder(placeholderTrack);

    // Resolve the actual stream URL from our serverless API
    try {
      const res = await fetch('/api/soundcloud-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolveTrackId: trackId }),
      });

      if (!res.ok) {
        console.warn('[Player] SoundCloud stream resolve failed:', res.status);
        dispatch({ type: 'SET_PLAYING', value: false });
        return;
      }

      const data = await res.json();
      if (myCounter !== playSoundCloudCounterRef.current) return;
      if (!data.streamUrl) {
        console.warn('[Player] SoundCloud: no stream URL returned');
        dispatch({ type: 'SET_PLAYING', value: false });
        return;
      }

      // Play the resolved stream as a native track — dispatches PLAY_TRACK
      // which changes provider to 'native' and triggers the audio useEffect
      const resolvedTrack = {
        id: `sc-${trackId}`,
        _restart: Date.now(), // re-fires the audio useEffect (same id as the placeholder)
        scTrackId: String(trackId),
        provider: 'soundcloud',
        providerItemId: trackUrl,
        origin: { provider: 'soundcloud', scTrackId: String(trackId), url: trackUrl || '' },
        title: data.title || metadata.title || 'SoundCloud Track',
        artistName: data.artistName || metadata.artistName || metadata.artist || '',
        releaseCover: data.artworkUrl || metadata.artworkUrl || '',
        duration: data.duration || metadata.duration || 0,
        src: data.streamUrl,
        providerUrl: trackUrl,
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
    if (item.provider === 'youtube') {
      let vid = item.providerItemId || item.videoId;
      if (!vid && item.id && item.id.startsWith('yt-')) vid = item.id.replace('yt-', '');
      if (item.url && !vid) {
        const m = item.url.match(/(?:v=|youtu\.be\/|embed\/)([^&?]+)/);
        if (m) vid = m[1];
      }
      playYouTube(vid, {
        title: item.title,
        channelTitle: item.artistName,
        thumbnail: item.artworkUrl,
        duration: item.duration,
      });
    } else if (item.provider === 'soundcloud') {
      // Resolve stream URL via API and play natively (same as native tracks)
      playSoundCloud(item.providerItemId || item.permalinkUrl || item.url, {
        trackId: item.scTrackId || item.trackId || (item.id && item.id.replace('sc-', '')),
        title: item.title,
        artistName: item.artistName,
        artworkUrl: item.artworkUrl,
        duration: item.duration,
      });
    } else if (item.provider === 'bandcamp') {
      const bcUrl = item.providerItemId || item.trackUrl || item.url;
      const meta = {
        id: item.id, title: item.title || '', artistName: item.artistName || '',
        releaseCover: item.artworkUrl || '', url: bcUrl, duration: item.duration || 0,
      };
      showPlaceholder({ ...meta, provider: 'bandcamp', providerItemId: meta.url, providerUrl: item.providerUrl || meta.url });
      const isCurrent = () => myCounter === playSearchItemCounterRef.current && stateRef.current.currentTrack?.id === item.id;
      await playBandcampOrFallback(meta, isCurrent);
    } else if (item.provider === 'spotify' || item.provider === 'applemusic' || item.provider === 'tidal') {
      await playStreamingItem(item, myCounter);
    } else {
      // native track
      playTrack(item);
    }
  }

  /** Apple Music / Spotify / TIDAL result → their native engine; if that's unavailable, the same song elsewhere. */
  async function playStreamingItem(item, myCounter) {
    const service = item.provider;
    const itemId = String(item.providerItemId || item.spotifyId || item.tidalId || item.trackId || '').replace(/^(am|sp|td)-/, '');
    const meta = {
      id: item.id || `${service}-${itemId}`, title: item.title || '', artistName: item.artistName || item.artist || '',
      releaseCover: item.artworkUrl || item.releaseCover || '', duration: item.duration || 0,
      releaseTitle: item.albumName || item.releaseTitle || '',
    };
    const stillCurrent = () => myCounter === playSearchItemCounterRef.current;
    if (itemId && isStreamingAvailable()) {
      const track = {
        ...meta,
        src: '',
        provider: service,
        providerItemId: itemId,
        providerUrl: item.url || '',
        ...(service === 'spotify' ? { spotifyId: itemId } : {}),
        ...(service === 'applemusic' ? { appleMusicId: itemId } : {}),
        ...(service === 'tidal' ? { tidalId: itemId } : {}),
      };
      dispatch({ type: 'PLAY_STREAMING', service, itemId, url: item.url, track });
      try { window.webkit.messageHandlers.player.postMessage({ visible: true, playing: true, title: track.title, artwork: track.releaseCover || '' }); } catch (e) {}
      // Spotify's App Remote is flaky right after a cold start / app switch: give its own engine a few tries
      // before even thinking about another source.
      let lastError = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!stillCurrent()) return;
        try {
          await callStreaming('play', { service, itemId });
          return;
        } catch (err) {
          lastError = err?.message || String(err);
          console.warn(`[Player] ${service} playback failed (attempt ${attempt + 1}):`, lastError);
          if (/subscription|not connected|not configured|not installed/i.test(lastError)) break;   // retrying can't fix these
          if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
        }
      }
      window.__kyoyuStreamError = lastError;
    }
    if (!stillCurrent()) return;
    if (!isStreamingAvailable()) {
      // Website (no native bridge): there is no Spotify / Apple Music / TIDAL engine, so play the same song elsewhere
      showPlaceholder(meta);
      const found = await findTrackSource({ artist: meta.artistName, title: meta.title }, stillCurrent);
      if (!stillCurrent()) return;
      if (found) playFoundSource(found, meta);
      else dispatch({ type: 'SET_PLAYING', value: false });
      return;
    }
    // The user picked a Spotify / Apple Music / TIDAL title: only that provider may play it. Never swap in a
    // Bandcamp/SoundCloud/YouTube copy under it — show why it failed instead.
    dispatch({ type: 'SET_PLAYING', value: false });
    const label = service === 'spotify' ? 'Spotify' : service === 'tidal' ? 'TIDAL' : 'Apple Music';
    const why = window.__kyoyuStreamError || (isStreamingAvailable() ? 'unknown error' : `${label} is only available in the Kyoyu iOS app`);
    const hint = service === 'spotify'
      ? 'Check that Spotify is connected in Settings (Spotify Premium + the Spotify app are required).'
      : service === 'tidal'
        ? 'Check that TIDAL is connected in Settings.'
        : /subscription/i.test(why)
          ? 'Open Settings › Streaming Services › Apple Music and tap “Get Apple Music”. The subscription must be on the Apple ID signed in on this device.'
          : 'Check that Apple Music is connected in Settings.';
    try { window.webkit.messageHandlers.player.postMessage({ alertTitle: `${label} could not play this track`, alert: `${why}\n\n${hint}` }); } catch (e) {}
  }

  // ── Shared helpers for resolving plays ──

  /** Show a track in the player immediately (no stream yet). */
  function showPlaceholder(meta) {
    const track = { ...meta, src: '', title: meta.title || 'Loading...' };
    dispatch({ type: 'PLAY_TRACK', track });
    try { window.webkit.messageHandlers.player.postMessage({ visible: true, playing: true, title: track.title, artwork: track.releaseCover || '' }); } catch(e){}
    // Keep the ref in sync right away: a cached resolve can finish before React re-renders
    stateRef.current = { ...stateRef.current, currentTrack: track };
  }

  /** Play a source found by findTrackSource, keeping the visible metadata of `meta`. */
  function playFoundSource(found, meta) {
    const title = meta.title || '';
    const artist = meta.artistName || meta.artist || '';
    const cover = meta.releaseCover || meta.cover || meta.artworkUrl || '';
    if (found.provider === 'youtube') {
      playYouTube(found.videoId, { title, artist, thumbnail: cover, duration: meta.duration });
      return;
    }
    const isBc = found.provider === 'bandcamp';
    playTrack({
      id: meta.id || (found.scTrackId ? `sc-${found.scTrackId}` : ''), title, artistName: artist, releaseCover: cover, src: found.src,
      releaseTitle: meta.releaseTitle || '',
      duration: found.duration || meta.duration || 0, providerUrl: found.providerItemId,
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
      playTrack({
        id: meta.id,
        title: meta.title || resolved.title,
        artistName: meta.artistName || resolved.artist || '',
        releaseCover: meta.releaseCover || resolved.artworkUrl || '',
        releaseTitle: meta.releaseTitle || '',
        src: resolved.streamUrl,
        duration: resolved.duration || meta.duration || 0,
        provider: 'bandcamp',
        providerItemId: meta.url,
        providerUrl: meta.url,
        origin: { provider: 'bandcamp', url: meta.url },
      });
      return;
    }
    console.warn('[Player] Bandcamp stream unavailable, looking for the same song elsewhere:', meta.url);
    const found = await findTrackSource({ artist: meta.artistName || '', title: meta.title || '' }, isCurrent);
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
    // A saved-item tap is a standalone play, not part of a search-results queue
    if (!opts.keepSearchQueue) {
      searchQueueRef.current = [];
      searchQueueIdxRef.current = -1;
    }
    if (Array.isArray(queue) && queue.length) dispatch({ type: 'SET_QUEUE', queue });

    const r = historyReplayInfo(item);
    const title = item.title || item.name || '';
    const artist = item.artist || item.artistName || '';
    const cover = item.cover || item.releaseCover || item.artworkUrl || '';
    const id = item.id || `saved-${artist}-${title}`;
    const meta = { id, title, artistName: artist, releaseCover: cover, duration: item.duration || 0, releaseTitle: item.releaseTitle || item.album || '' };
    const isCurrent = () => myCounter === savedPlayCounterRef.current && stateRef.current.currentTrack?.id === id;

    if (r.provider === 'youtube') {
      playYouTube(r.videoId, { title, artist, thumbnail: cover, duration: item.duration });
    } else if (r.provider === 'soundcloud') {
      playSoundCloud(r.url || '', { trackId: r.scTrackId, title, artistName: artist, artworkUrl: cover, duration: item.duration });
    } else if (r.provider === 'bandcamp') {
      showPlaceholder({ ...meta, provider: 'bandcamp', providerItemId: r.url, providerUrl: r.url, replay: r });
      await playBandcampOrFallback({ ...meta, url: r.url }, isCurrent);
    } else if (isStreamingProvider(r.provider)) {
      if (!opts.keepSearchQueue) {
        searchQueueRef.current = [];
        searchQueueIdxRef.current = -1;
      }
      await playStreamingItem(
        { id, provider: r.provider, providerItemId: r.itemId, title, artistName: artist, artworkUrl: cover, duration: item.duration || 0, releaseTitle: meta.releaseTitle, url: item.providerUrl || item.url || '', strict: true },
        playSearchItemCounterRef.current += 1,
      );
    } else if (r.provider === 'native') {
      playTrack({ ...item, id, artistName: artist, releaseCover: cover });
    } else {
      // No identity saved (older entries): find the song again by artist + title
      showPlaceholder({ ...meta, replay: r });
      const found = await findTrackSource({ artist, title }, isCurrent);
      if (!isCurrent()) return;
      if (found) playFoundSource(found, meta);
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
      const q = state.queue || [];
      const searchQ = searchQueueRef.current || [];
      let activeQueue = q.length > 0 ? q : searchQ;
      
      // Ensure the currently playing track is always included in the queue list
      const cur = stateRef.current.currentTrack || state.currentTrack;
      if (cur) {
        const hasCurrent = activeQueue.some(t => String(t.id || '') === String(cur.id || ''));
        if (!hasCurrent) {
          activeQueue = [cur, ...activeQueue];
        }
      }

      return JSON.stringify(activeQueue.map(t => ({
        id: String(t.id || ''),
        title: String(t.title || t.name || 'Unknown'),
        artist: t.artistName || t.artist || '',
        cover: t.releaseCover || t.cover || t.artworkUrl || '',
        url: t.src || t.audioUrl || t.fileUrl || '',
      })));
    };

    window.__kyoyuPlayQueueItem = (index) => {
      const q = state.queue || [];
      const searchQ = searchQueueRef.current || [];
      if (q.length > 0 && index >= 0 && index < q.length) {
        dispatch({ type: 'PLAY_TRACK', track: { ...q[index] } });
      } else if (searchQ.length > 0 && index >= 0 && index < searchQ.length) {
        searchQueueIdxRef.current = index;
        playSearchItem(searchQ[index]);
      }
    };

    window.__kyoyuRemoveFromQueue = (index) => {
      const q = [...(state.queue || [])];
      if (index >= 0 && index < q.length) {
        q.splice(index, 1);
        dispatch({ type: 'SET_QUEUE', queue: q });
      }
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

    // Prefetch: called by Swift on track change — warms the cache
    window.__kyoyuPrefetchTrackInfo = async (trackId, title, artist, album, provider) => {
      try {
        const key = [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
        if (!key || window.__kyoyuInfoCache[key]) return; // Already cached
        const res = await fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'track-info', title, artist, album, provider, trackId })
        });
        if (res.ok) {
          const data = await res.json();
          window.__kyoyuInfoCache[key] = data;
        }
      } catch (e) { console.warn('Prefetch info error:', e); }
    };

    // Expose current track getter for native/web genre & artist sheets
    window.__kyoyuGetCurrentTrack = () => stateRef.current.currentTrack;

    // Get cached info: called when user opens info panel — returns instantly
    window.__kyoyuGetTrackInfo = async (trackId, title, artist, album, provider) => {
      try {
        const key = [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
        // Return from cache if available
        if (window.__kyoyuInfoCache[key]) {
          return JSON.stringify(window.__kyoyuInfoCache[key]);
        }
        // Cache miss — fetch synchronously (shouldn't happen often since prefetch runs on track change)
        const res = await fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'track-info', title, artist, album, provider, trackId })
        });
        if (res.ok) {
          const data = await res.json();
          window.__kyoyuInfoCache[key] = data;
          return JSON.stringify(data);
        }
        return JSON.stringify({ description: 'Could not fetch info.', genre: '', label: '', year: '', links: [] });
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

    // 2. Radio-style autoplay. The current track keeps playing while we look, so a slow
    //    network never means silence.
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
        // 3. Nothing found: never end in silence — replay the current track
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

