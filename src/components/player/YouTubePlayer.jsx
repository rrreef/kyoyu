import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import './YouTubePlayer.css';

// Module-level variables for API loading state
let apiLoadPromise = null;
let isApiReady = false;

const loadYouTubeApi = () => {
  if (isApiReady) {
    return Promise.resolve(window.YT);
  }
  
  if (apiLoadPromise) {
    return apiLoadPromise;
  }

  apiLoadPromise = new Promise((resolve, reject) => {
    // If the API script is already on the page but not ready
    if (window.YT && window.YT.Player) {
      isApiReady = true;
      resolve(window.YT);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    
    // The API calls this globally when ready
    window.onYouTubeIframeAPIReady = () => {
      isApiReady = true;
      resolve(window.YT);
    };

    script.onerror = (err) => {
      reject(new Error('Failed to load YouTube IFrame API'));
    };

    document.head.appendChild(script);
  });

  return apiLoadPromise;
};

const YouTubePlayer = forwardRef(({ 
  videoId, 
  isPlaying, 
  volume, 
  onStateChange, 
  onReady, 
  onEnded,
  onError,
  audioOnly = false 
}, ref) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState(null);
  const progressIntervalRef = useRef(null);
  // Always-fresh values for callbacks created once inside the YT API closure
  const readyRef = useRef(false);
  const videoIdRef = useRef(videoId);
  const isPlayingRef = useRef(isPlaying);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  const watchdogRef = useRef(null);
  const attemptsRef = useRef(0);
  videoIdRef.current = videoId;
  isPlayingRef.current = isPlaying;
  onEndedRef.current = onEnded;
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;

  // A video that never reaches PLAYING/BUFFERING gets re-requested (up to 3x) before we give up.
  const armWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      const p = playerRef.current;
      const YT = window.YT;
      if (!p || !readyRef.current || !isPlayingRef.current || typeof p.getPlayerState !== 'function') return;
      const st = p.getPlayerState();
      if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING || st === YT.PlayerState.ENDED) { attemptsRef.current = 0; return; }
      attemptsRef.current += 1;
      if (attemptsRef.current > 3) {
        attemptsRef.current = 0;
        if (onErrorRef.current) onErrorRef.current(-1);
        return;
      }
      try { p.loadVideoById(videoIdRef.current); } catch (e) {}
      armWatchdog();
    }, 3000);
  }, []);

  // Progress polling
  const startProgressInterval = useCallback(() => {
    stopProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        if (onStateChange) {
          const progress = playerRef.current.getCurrentTime() || 0;
          const duration = playerRef.current.getDuration() || 0;
          onStateChange({ isPlaying: true, progress, duration });
        }
      }
    }, 500);
  }, [onStateChange]);

  const stopProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Initialize Player
  useEffect(() => {
    let isMounted = true;

    const initialVideoId = videoIdRef.current;
    const initPlayer = async () => {
      try {
        const YT = await loadYouTubeApi();
        if (!isMounted || !containerRef.current) return;

        playerRef.current = new YT.Player(containerRef.current, {
          width: '100%',
          height: '100%',
          videoId: videoIdRef.current,
          playerVars: {
            autoplay: 1,
            controls: audioOnly ? 0 : 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (volume !== undefined) {
                event.target.setVolume(volume * 100);
              }
              try {
                const iframe = event.target.getIframe();
                if (iframe) {
                  iframe.setAttribute('allow', 'autoplay; picture-in-picture; encrypted-media');
                  iframe.setAttribute('allowfullscreen', '');
                }
              } catch(e) {}
              readyRef.current = true;
              if (onReady) onReady();
              // The video may have changed while the player was still booting
              if (videoIdRef.current && videoIdRef.current !== initialVideoId) {
                if (isPlayingRef.current) event.target.loadVideoById(videoIdRef.current);
                else event.target.cueVideoById(videoIdRef.current);
              } else if (isPlayingRef.current) {
                event.target.playVideo();
              }
              if (isPlayingRef.current) armWatchdog();
            },
            onStateChange: (event) => {
              const currentIsPlaying = event.data === YT.PlayerState.PLAYING;
              
              if (currentIsPlaying) {
                startProgressInterval();
              } else {
                stopProgressInterval();
              }

              if (event.data === YT.PlayerState.PLAYING) attemptsRef.current = 0;

              if (event.data === YT.PlayerState.ENDED) {
                if (onEndedRef.current) onEndedRef.current();
              }

              if (onStateChangeRef.current) {
                const progress = event.target.getCurrentTime() || 0;
                const duration = event.target.getDuration() || 0;
                onStateChangeRef.current({ isPlaying: currentIsPlaying, progress, duration });
              }
            },
            onError: (event) => {
              console.error('YouTube Player Error:', event.data);
              // Unavailable / embedding disabled: let the parent skip to something playable
              if (onErrorRef.current) onErrorRef.current(event.data);
              else setError('Error loading video.');
            }
          }
        });
      } catch (err) {
        console.error(err);
        if (isMounted) setError('Failed to initialize player');
      }
    };

    initPlayer();

    return () => {
      isMounted = false;
      readyRef.current = false;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      stopProgressInterval();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Handle Video ID changes
  useEffect(() => {
    // Before the player is ready, onReady picks up the latest videoId itself
    if (playerRef.current && readyRef.current && videoId) {
      attemptsRef.current = 0;
      if (isPlaying && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById(videoId);
        armWatchdog();
      } else if (!isPlaying && typeof playerRef.current.cueVideoById === 'function') {
        playerRef.current.cueVideoById(videoId);
      }
    }
  }, [videoId]); // Omit isPlaying to prevent reloading video on play/pause

  // Handle isPlaying changes
  useEffect(() => {
    let retryInterval = null;
    
    const tryPlay = () => {
      if (playerRef.current && readyRef.current && typeof playerRef.current.getPlayerState === 'function') {
        const YT = window.YT;
        const state = playerRef.current.getPlayerState();
        // Never restart a finished video (ENDED): the parent is already moving to the next track
        if (isPlaying && state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING && state !== YT.PlayerState.ENDED) {
          playerRef.current.playVideo();
        } else if (!isPlaying && state === YT.PlayerState.PLAYING) {
          playerRef.current.pauseVideo();
        }
      }
    };

    tryPlay();
    
    // WebKit often pauses videos when returning to the foreground
    // This interval instantly catches that pause and forcefully resumes playback in 100ms.
    if (isPlaying) {
      retryInterval = setInterval(tryPlay, 100);
    }
    
    return () => {
      if (retryInterval) clearInterval(retryInterval);
    };
  }, [isPlaying]);

  // Handle Volume changes
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function' && volume !== undefined) {
      playerRef.current.setVolume(volume * 100);
    }
  }, [volume]);

  // Expose play/pause/seekTo for direct control
  useImperativeHandle(ref, () => ({
    play: () => {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    },
    pause: () => {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        playerRef.current.pauseVideo();
      }
    },
    isReady: () => !!(playerRef.current && typeof playerRef.current.getPlayerState === 'function'),
    seekTo: (seconds) => {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(seconds, true);
        if (onStateChange) {
           const duration = playerRef.current.getDuration() || 0;
           onStateChange({
              isPlaying: isPlaying,
              progress: seconds,
              duration: duration
           });
        }
      }
    }
  }));

  return (
    <div className="youtube-player-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {error ? (
        <div className="youtube-player-error">{error}</div>
      ) : (
        <div ref={containerRef} style={audioOnly
          ? { width: '100%', height: '100%', filter: 'brightness(0)', mixBlendMode: 'screen' } // hidden iOS player: fully rendered but invisible
          : { width: '100%', height: '100%' }}></div>
      )}
    </div>
  );
});

export default YouTubePlayer;
