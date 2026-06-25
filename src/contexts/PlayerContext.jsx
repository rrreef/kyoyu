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
      return { ...state, currentTrack: state.queue[(idx+1)%state.queue.length], progress:0, duration:0, isPlaying:true };
    }
    case 'PREV_TRACK': {
      if (!state.queue.length) return state;
      if (state.progress > 3) return { ...state, progress:0 };
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      return { ...state, currentTrack: state.queue[(idx-1+state.queue.length)%state.queue.length], progress:0, duration:0, isPlaying:true };
    }
    default: return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef    = useRef(null);
  const gainRef     = useRef(null);   // Web Audio API GainNode — controls volume on iOS
  const ctxRef      = useRef(null);   // AudioContext
  const sourceReady = useRef(false);  // createMediaElementSource called only once

  // ── Create audio element on mount ──
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTime  = () => dispatch({ type:'SET_PROGRESS', value: audio.currentTime });
    const onMeta  = () => dispatch({ type:'SET_DURATION', value: audio.duration || 0 });
    const onPlay  = () => dispatch({ type:'SET_PLAYING',  value: true  });
    const onPause = () => dispatch({ type:'SET_PLAYING',  value: false });
    const onEnded = () => dispatch({ type:'NEXT_TRACK' });

    audio.addEventListener('timeupdate',     onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate',     onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
    };
  }, []);

  // ── Wire Web Audio API gain node (call once after first user gesture) ──
  // On iOS, AudioContext must be created / resumed inside a user gesture.
  // We call this from playTrack (which is always user-initiated).
  function ensureGain() {
    const audio = audioRef.current;
    if (!audio || sourceReady.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx  = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      const src  = ctx.createMediaElementSource(audio);
      src.connect(gain);
      gain.connect(ctx.destination);
      ctxRef.current  = ctx;
      gainRef.current = gain;
      sourceReady.current = true;
      // Resume immediately — must happen inside user gesture
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        // Retry resume after a short delay (belt & suspenders)
        setTimeout(() => {
          if (ctx.state !== 'running') ctx.resume().catch(() => {});
        }, 100);
        setTimeout(() => {
          if (ctx.state !== 'running') ctx.resume().catch(() => {});
        }, 500);
      }
    } catch(e) {
      // Web Audio not available — fall back to audio.volume
    }
  }

  // ── Watchdog: ensure AudioContext is running during playback ──
  useEffect(() => {
    if (!state.isPlaying) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    // If context is suspended while we're supposed to be playing, resume it
    const check = setInterval(() => {
      if (ctx.state !== 'running' && state.isPlaying) {
        ctx.resume().catch(() => {});
      }
    }, 1000);
    // Also resume right now
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return () => clearInterval(check);
  }, [state.isPlaying]);

  // ── Track change → load + play ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    const src = state.currentTrack.src || state.currentTrack.fileUrl || state.currentTrack.audioUrl || '';
    if (!src) return;
    audio.src = src;
    audio.load();
    // Resume AudioContext if needed (iOS suspends it)
    ctxRef.current?.resume().catch(() => {});
    audio.play().catch(() => {});
  }, [state.currentTrack?.id]); // eslint-disable-line

  // ── Play / pause sync ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.isPlaying) {
      ctxRef.current?.resume().catch(() => {});
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state.isPlaying]); // eslint-disable-line

  // ── Sync in-app slider when hardware volume buttons are pressed ──
  // Swift observes AVAudioSession.outputVolume via KVO and calls this.
  useEffect(() => {
    window.__kyoyuSystemVolumeChanged = (v) => {
      const vol = Math.max(0, Math.min(1, Number(v)));
      if (gainRef.current) gainRef.current.gain.value = vol;
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

  // Called on every drag frame — sets gain directly, no dispatch
  const setAudioVolumeDirect = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    if (gainRef.current) {
      gainRef.current.gain.value = vol;
    } else if (audioRef.current) {
      audioRef.current.volume = vol;   // fallback (non-iOS)
    }
  }, []);

  // Called on drag release — sets gain + syncs React state
  const setVolume = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    if (gainRef.current) {
      gainRef.current.gain.value = vol;
    } else if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    dispatch({ type:'SET_VOLUME', value: vol });
  }, []);

  function playTrack(track, queue = []) {
    ensureGain();   // create Web Audio graph on first play (user gesture)
    // Normalise track shape — public tracks use audioUrl (R2), uploads use fileUrl/src
    const normTrack = {
      ...track,
      src: track.src || track.fileUrl || track.audioUrl || '',
      artistName: track.artistName || track.artist || '',
    };
    dispatch({ type:'PLAY_TRACK', track: normTrack });
    const normQueue = queue.map(t => ({
      ...t,
      src: t.src || t.fileUrl || t.audioUrl || '',
      artistName: t.artistName || t.artist || '',
    }));
    if (normQueue.length) dispatch({ type:'SET_QUEUE', queue: normQueue });
    const audio = audioRef.current;
    if (!audio) return;
    const src = normTrack.src;
    if (!src) return;
    audio.src = src;
    audio.load();
    ctxRef.current?.resume().catch(() => {});
    audio.play().catch(() => {});
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
