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
  const audioRef = useRef(null);

  // Create audio element once
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.volume = 0.8;
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTime     = () => dispatch({ type:'SET_PROGRESS', value: audio.currentTime });
    const onMeta     = () => dispatch({ type:'SET_DURATION', value: audio.duration || 0 });
    const onPlay     = () => dispatch({ type:'SET_PLAYING',  value: true  });
    const onPause    = () => dispatch({ type:'SET_PLAYING',  value: false });
    const onEnded    = () => dispatch({ type:'NEXT_TRACK' });

    audio.addEventListener('timeupdate',      onTime);
    audio.addEventListener('loadedmetadata',  onMeta);
    audio.addEventListener('durationchange',  onMeta);
    audio.addEventListener('play',            onPlay);
    audio.addEventListener('pause',           onPause);
    audio.addEventListener('ended',           onEnded);

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

  // When currentTrack changes → load + play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    const src = state.currentTrack.src || state.currentTrack.fileUrl || '';
    if (!src) return;
    audio.src = src;
    audio.load();
    audio.play().catch(() => {});
  }, [state.currentTrack?.id]); // eslint-disable-line

  // When isPlaying toggles → play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.isPlaying) { audio.play().catch(() => {}); }
    else { audio.pause(); }
  }, [state.isPlaying]); // eslint-disable-line

  // Stable seek — safe to use in drag handlers
  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(seconds)) return;
    const t = Math.max(0, Math.min(seconds, audio.duration || 0));
    audio.currentTime = t;
    dispatch({ type:'SET_PROGRESS', value: t });
  }, []);

  // Set audio.volume immediately (no React dispatch) — for live drag
  const setAudioVolumeDirect = useCallback((v) => {
    const audio = audioRef.current;
    if (audio) audio.volume = Math.max(0, Math.min(1, v));
  }, []);

  // Full volume setter — sets audio + updates React state — call on drag release
  const setVolume = useCallback((v) => {
    const audio = audioRef.current;
    const vol = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = vol;
    dispatch({ type:'SET_VOLUME', value: vol });
  }, []);


  function playTrack(track, queue = []) {
    dispatch({ type:'PLAY_TRACK', track });
    if (queue.length) dispatch({ type:'SET_QUEUE', queue });
    const audio = audioRef.current;
    if (!audio) return;
    const src = track.src || track.fileUrl || '';
    if (!src) return;
    audio.src = src;
    audio.load();
    audio.play().catch(() => {});
  }

  function playRelease(release) {
    if (!release?.tracks?.length) return;
    const tracks = release.tracks.map(t => ({
      ...t, releaseId: release.id, releaseCover: release.cover,
      releaseTitle: release.title, artistName: release.artist,
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
