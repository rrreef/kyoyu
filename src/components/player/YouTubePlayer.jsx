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

  // Initialize Player
  useEffect(() => {
    let isMounted = true;

    const initPlayer = async () => {
      try {
        const YT = await loadYouTubeApi();
        if (!isMounted || !containerRef.current) return;

        playerRef.current = new YT.Player(containerRef.current, {
          width: audioOnly ? 1 : '100%',
          height: audioOnly ? 1 : '100%',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
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
              if (onReady) onReady();
              // If it should be playing right away
              if (isPlaying) {
                event.target.playVideo();
              }
            },
            onStateChange: (event) => {
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
              console.error('YouTube Player Error:', event.data);
              setError('Error loading video.');
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
    if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
      const YT = window.YT;
      const state = playerRef.current.getPlayerState();
      
      if (isPlaying && state !== YT.PlayerState.PLAYING) {
        playerRef.current.playVideo();
      } else if (!isPlaying && state === YT.PlayerState.PLAYING) {
        playerRef.current.pauseVideo();
      }
    } else if (isPlaying) {
      // Player not ready yet — retry after short delay
      const retryTimer = setTimeout(() => {
        if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      }, 500);
      return () => clearTimeout(retryTimer);
    }
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
        
        // Optimistically report state
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
    <div className="youtube-player-container">
      {error ? (
        <div className="youtube-player-error">{error}</div>
      ) : (
        <div ref={containerRef}></div>
      )}
    </div>
  );
});

export default YouTubePlayer;
