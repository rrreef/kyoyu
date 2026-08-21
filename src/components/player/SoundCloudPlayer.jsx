import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

// Module-level: load SC Widget API once
let widgetApiPromise = null;
let isWidgetApiReady = false;

const loadWidgetApi = () => {
  if (isWidgetApiReady) return Promise.resolve();
  if (widgetApiPromise) return widgetApiPromise;

  widgetApiPromise = new Promise((resolve, reject) => {
    if (window.SC && window.SC.Widget) {
      isWidgetApiReady = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.onload = () => {
      isWidgetApiReady = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load SoundCloud Widget API'));
    document.head.appendChild(script);
  });

  return widgetApiPromise;
};

const SoundCloudPlayer = forwardRef(({
  trackUrl,
  isPlaying,
  volume,
  onStateChange,
  onReady,
  onEnded,
  audioOnly = false,
}, ref) => {
  const iframeRef = useRef(null);
  const widgetRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const isReadyRef = useRef(false);

  const startProgressInterval = useCallback(() => {
    stopProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      if (widgetRef.current && isReadyRef.current) {
        widgetRef.current.getPosition(pos => {
          widgetRef.current.getDuration(dur => {
            if (onStateChange) {
              onStateChange({
                isPlaying: true,
                progress: (pos || 0) / 1000, // ms → seconds
                duration: (dur || 0) / 1000,
              });
            }
          });
        });
      }
    }, 500);
  }, [onStateChange]);

  const stopProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Initialize widget
  useEffect(() => {
    let isMounted = true;

    const initWidget = async () => {
      try {
        await loadWidgetApi();
        if (!isMounted || !iframeRef.current) return;

        const widget = window.SC.Widget(iframeRef.current);
        widgetRef.current = widget;

        widget.bind(window.SC.Widget.Events.READY, () => {
          if (!isMounted) return;
          isReadyRef.current = true;
          if (volume !== undefined) {
            widget.setVolume(volume * 100);
          }
          if (onReady) onReady();
          if (isPlaying) {
            widget.play();
          }
        });

        widget.bind(window.SC.Widget.Events.PLAY, () => {
          startProgressInterval();
        });

        widget.bind(window.SC.Widget.Events.PAUSE, () => {
          stopProgressInterval();
        });

        widget.bind(window.SC.Widget.Events.FINISH, () => {
          stopProgressInterval();
          if (onEnded) onEnded();
        });

        widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
          if (onStateChange && e) {
            onStateChange({
              isPlaying: true,
              progress: (e.currentPosition || 0) / 1000,
              duration: 0, // Will be filled by interval
            });
          }
        });

      } catch (err) {
        console.error('SoundCloud Widget init failed:', err);
      }
    };

    initWidget();

    return () => {
      isMounted = false;
      stopProgressInterval();
      isReadyRef.current = false;
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle trackUrl changes — load new track
  useEffect(() => {
    if (widgetRef.current && isReadyRef.current && trackUrl) {
      widgetRef.current.load(trackUrl, {
        auto_play: isPlaying,
        show_artwork: !audioOnly,
        show_user: false,
        buying: false,
        sharing: false,
        download: false,
        show_playcount: false,
        show_comments: false,
        callback: () => {
          if (volume !== undefined) {
            widgetRef.current.setVolume(volume * 100);
          }
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackUrl]);

  // Handle isPlaying changes
  useEffect(() => {
    if (widgetRef.current && isReadyRef.current) {
      if (isPlaying) {
        widgetRef.current.play();
      } else {
        widgetRef.current.pause();
      }
    } else if (isPlaying) {
      // Widget not ready yet — retry after short delay
      const retryTimer = setTimeout(() => {
        if (widgetRef.current && isReadyRef.current) {
          widgetRef.current.play();
        }
      }, 500);
      return () => clearTimeout(retryTimer);
    }
  }, [isPlaying]);

  // Handle volume changes
  useEffect(() => {
    if (widgetRef.current && isReadyRef.current && volume !== undefined) {
      widgetRef.current.setVolume(volume * 100);
    }
  }, [volume]);

  // Expose seekTo
  useImperativeHandle(ref, () => ({
    seekTo: (seconds) => {
      if (widgetRef.current && isReadyRef.current) {
        widgetRef.current.seekTo(seconds * 1000); // seconds → ms
        if (onStateChange) {
          onStateChange({ isPlaying, progress: seconds, duration: 0 });
        }
      }
    },
  }));

  const iframeSrc = trackUrl
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&color=%23FF5500&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`
    : '';

  const iframeStyle = audioOnly
    ? { width: 1, height: 1, border: 'none', opacity: 0, pointerEvents: 'none' }
    : { width: '100%', height: '100%', border: 'none' };

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      style={iframeStyle}
      allow="autoplay"
      loading="lazy"
      title="SoundCloud Player"
    />
  );
});

export default SoundCloudPlayer;
