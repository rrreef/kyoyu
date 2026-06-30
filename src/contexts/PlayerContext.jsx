import { createContext, useContext, useReducer, useRef, useEffect, useCallback } from 'react';
import { releases, djSets } from '../data/mockData';

const PlayerContext = createContext(null);

const allTracks = [
  ...releases.flatMap(r => r.tracks.map(t => ({ ...t, releaseId: r.id, releaseCover: r.cover, releaseTitle: r.title, artistName: r.artist }))),
  ...djSets.map(s => ({ id: s.id, title: s.title, releaseCover: s.cover, releaseTitle: s.title, artistName: s.artist })),
];

const initialState = {
  currentTrack: null, queue: [], isPlaying: false, volume: 0.8,
  progress: 0, duration: 0, isMuted: false, isShuffled: false, repeatMode: 'none',
};

function playerReducer(state, action) {
  switch (action.type) {
    case 'PLAY_TRACK':   return { ...state, currentTrack: action.track, isPlaying: true, progress: 0, duration: 0 };
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
    case 'NEXT_TRACK': {
      if (!state.queue.length) return state;
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      if (idx < 0) return state;
      // At the last track — do nothing
      if (idx >= state.queue.length - 1) return state;
      return { ...state, currentTrack: { ...state.queue[idx + 1] }, progress:0, duration:0, isPlaying:true };
    }
    case 'PREV_TRACK': {
      if (!state.queue.length) return state;
      if (state.progress > 3) {
        // Restart current track
        return { ...state, currentTrack: { ...state.currentTrack, _restart: Date.now() }, progress:0 };
      }
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      if (idx < 0) return state;
      // At the first track — do nothing
      if (idx <= 0) return state;
      return { ...state, currentTrack: { ...state.queue[idx - 1] }, progress:0, duration:0, isPlaying:true };
    }
    default: return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(null);
  const playIdRef = useRef(0); // increments on each track change to cancel stale plays

  // ── Create audio element on mount ──
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.volume = 0.8;
    // Append to DOM (hidden) — WKWebView needs this for reliable playback
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioRef.current = audio;

    const onTime  = () => dispatch({ type:'SET_PROGRESS', value: audio.currentTime });
    const onMeta  = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) dispatch({ type:'SET_DURATION', value: d });
    };
    const onPlay  = () => dispatch({ type:'SET_PLAYING',  value: true  });
    const onPause = () => dispatch({ type:'SET_PLAYING',  value: false });
    const onEnded = () => dispatch({ type:'NEXT_TRACK' });
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

  // ── Track change → stop old, load new, play when ready ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    const src = state.currentTrack.src || state.currentTrack.fileUrl || state.currentTrack.audioUrl || '';
    if (!src) return;

    // Increment play ID to cancel any pending play from previous track
    const myPlayId = ++playIdRef.current;

    // Stop current playback cleanly before switching
    audio.pause();
    audio.currentTime = 0;

    // ── Send URL directly to native AVPlayer (iOS) ──
    // Don't rely on the play() JS override to read currentSrc — it's racy.
    // We know the exact URL from the track object.
    try {
      const mh = window.webkit?.messageHandlers;
      if (mh?.audioFallback) {
        // Update lastSentUrl so the play() override doesn't re-send a stale URL
        if (window.__kyoyuTrack) window.__kyoyuTrack.lastSentUrl = src;
        mh.audioFallback.postMessage({ url: src });
      }
      if (mh?.audioSession) mh.audioSession.postMessage('play');
    } catch (e) { /* not in WKWebView */ }

    // Set pre-computed duration from DB if available (show instantly)
    if (state.currentTrack.duration) {
      const parts = String(state.currentTrack.duration).split(':');
      if (parts.length === 2) {
        const dbDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        if (dbDuration > 0) dispatch({ type:'SET_DURATION', value: dbDuration });
      }
    }

    // Load web audio (muted) for scrubber/duration UI
    audio.src = src;
    audio.load();

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
  }, [state.currentTrack?.id, state.currentTrack?._restart]); // eslint-disable-line

  // ── Play / pause sync ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state.isPlaying]); // eslint-disable-line

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
    const audio = audioRef.current;
    if (!audio || !isFinite(seconds)) return;
    const t = Math.max(0, Math.min(seconds, audio.duration || 0));
    audio.currentTime = t;
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
    dispatch({ type:'PLAY_TRACK', track: normTrack });
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

  return (
    <PlayerContext.Provider value={{ state, dispatch, playTrack, playRelease, seekTo, setVolume, setAudioVolumeDirect, allTracks }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() { return useContext(PlayerContext); }

