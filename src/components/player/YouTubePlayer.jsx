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
  audioOnly = false 
}, ref) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState(null);
  const progressIntervalRef = useRef(null);

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

  const log = (m) => {
    window.__kyoyuYTLogs = window.__kyoyuYTLogs || [];
    window.__kyoyuYTLogs.push(m);
    if (window.__kyoyuYTLogs.length > 5) window.__kyoyuYTLogs.shift();
  };

  // Initialize Player
  useEffect(() => {
    let isMounted = true;
    log('initPlayer called');

    const initPlayer = async () => {
      try {
        log('loading api...');
        const YT = await loadYouTubeApi();
        log('api loaded! ' + !!containerRef.current);
        if (!isMounted || !containerRef.current) return;

        playerRef.current = new YT.Player(containerRef.current, {
          width: '100%',
          height: '100%',
          videoId: videoId,
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
              log('onReady fired!');
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
              if (onReady) onReady();
              if (isPlaying) {
                event.target.playVideo();
                log('called playVideo()');
              }
            },
            onStateChange: (event) => {
              log('stateChange: ' + event.data);
              const currentIsPlaying = event.data === YT.PlayerState.PLAYING;
              
              if (currentIsPlaying) {
                startProgressInterval();
              } else {
                stopProgressInterval();
              }

              if (event.data === YT.PlayerState.ENDED) {
                if (onEnded) onEnded();
              }

              if (onStateChange) {
                const progress = event.target.getCurrentTime() || 0;
                const duration = event.target.getDuration() || 0;
                onStateChange({ isPlaying: currentIsPlaying, progress, duration });
              }
            },
            onError: (event) => {
              log('ERROR: ' + event.data);
              console.error('YouTube Player Error:', event.data);
              setError('Error loading video.');
            }
          }
        });
        log('Player constructed for ' + videoId);
      } catch (err) {
        log('CATCH ERR: ' + err.message);
        console.error(err);
        if (isMounted) setError('Failed to initialize player');
      }
    };

    initPlayer();

    return () => {
      isMounted = false;
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
    if (playerRef.current && videoId) {
      // If the player is ready and we get a new videoId
      if (isPlaying && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById(videoId);
      } else if (!isPlaying && typeof playerRef.current.cueVideoById === 'function') {
        playerRef.current.cueVideoById(videoId);
      }
    }
  }, [videoId]); // Omit isPlaying to prevent reloading video on play/pause

  // Handle isPlaying changes
  useEffect(() => {
    let retryInterval = null;
    
    const tryPlay = () => {
      if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
        const YT = window.YT;
        const state = playerRef.current.getPlayerState();
        if (isPlaying && state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
          playerRef.current.playVideo();
        } else if (!isPlaying && state === YT.PlayerState.PLAYING) {
          playerRef.current.pauseVideo();
        }
      }
    };

    tryPlay();
    
    // WebKit often pauses videos when returning to the foreground (but no longer when backgrounding thanks to opacity: 1!)
    // This interval instantly catches that pause and forcefully resumes playback, completely solving the "stuck on foreground" issue.
    if (isPlaying) {
      retryInterval = setInterval(tryPlay, 500);
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
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
      )}
      {/* Camouflage overlay: Perfectly matches the app's dynamic background (dark or white theme)
          to hide the video from the user while keeping it fully opaque and visible to WebKit! */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-primary)', zIndex: 10, pointerEvents: 'none' }}></div>
    </div>
  );
});

export default YouTubePlayer;
