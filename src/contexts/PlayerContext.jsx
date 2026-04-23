import { createContext, useContext, useReducer, useRef, useEffect } from 'react';
import { releases, djSets } from '../data/mockData';

const PlayerContext = createContext(null);

const allTracks = [
  ...releases.flatMap(r => r.tracks.map(t => ({ ...t, releaseId: r.id, releaseCover: r.cover, releaseTitle: r.title, artistName: r.artist }))),
  ...djSets.map(s => ({ id: s.id, title: s.title, duration: s.duration, releaseCover: s.cover, releaseTitle: s.title, artistName: s.artist })),
];

const initialState = {
  currentTrack: null,
  queue: [],
  isPlaying: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  isMuted: false,
  isShuffled: false,
  repeatMode: 'none', // 'none' | 'one' | 'all'
};

function playerReducer(state, action) {
  switch (action.type) {
    case 'PLAY_TRACK':
      return { ...state, currentTrack: action.track, isPlaying: true, progress: 0 };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.value };
    case 'SET_VOLUME':
      return { ...state, volume: action.value, isMuted: action.value === 0 };
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'SET_PROGRESS':
      return { ...state, progress: action.value };
    case 'SET_DURATION':
      return { ...state, duration: action.value };
    case 'SET_QUEUE':
      return { ...state, queue: action.queue };
    case 'TOGGLE_SHUFFLE':
      return { ...state, isShuffled: !state.isShuffled };
    case 'CYCLE_REPEAT':
      const modes = ['none', 'all', 'one'];
      const next = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
      return { ...state, repeatMode: next };
    case 'NEXT_TRACK': {
      if (!state.queue.length) return state;
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      const nextIdx = (idx + 1) % state.queue.length;
      return { ...state, currentTrack: state.queue[nextIdx], progress: 0, isPlaying: true };
    }
    case 'PREV_TRACK': {
      if (!state.queue.length) return state;
      if (state.progress > 3) return { ...state, progress: 0 };
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      const prevIdx = (idx - 1 + state.queue.length) % state.queue.length;
      return { ...state, currentTrack: state.queue[prevIdx], progress: 0, isPlaying: true };
    }
    default:
      return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Simulate progress increment
  useEffect(() => {
    if (!state.isPlaying) return;
    const interval = setInterval(() => {
      dispatch({ type: 'SET_PROGRESS', value: Math.min((state.progress || 0) + 1, 360) });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isPlaying, state.progress]);

  function playTrack(track, queue = []) {
    dispatch({ type: 'PLAY_TRACK', track });
    if (queue.length) dispatch({ type: 'SET_QUEUE', queue });
    dispatch({ type: 'SET_DURATION', value: 240 });
  }

  function playRelease(release) {
    const tracks = release.tracks.map(t => ({
      ...t,
      releaseId: release.id,
      releaseCover: release.cover,
      releaseTitle: release.title,
      artistName: release.artist,
    }));
    playTrack(tracks[0], tracks);
  }

  return (
    <PlayerContext.Provider value={{ state, dispatch, playTrack, playRelease, allTracks }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
