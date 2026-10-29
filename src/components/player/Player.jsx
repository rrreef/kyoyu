import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { usePlayer, historyReplayInfo } from '../../contexts/PlayerContext';
import YouTubePlayer from './YouTubePlayer';
import SoundCloudPlayer from './SoundCloudPlayer';
import { callStreaming, isStreamingProvider, onStreamingEvent, cleanTrackOrReleaseTitle, splitCleanMetadata } from '../../lib/streaming';
import { classifyTrackGenre } from '../../lib/genreIntelligence';
import { analyzeAudioUrlWithEssentiaDSP, clearEssentiaAudioCache } from '../../lib/webAudioEssentiaAnalyzer';
import { openRichGenreSheet, refreshGenreSheetTracks, openRichSceneSheet, openRichArtistSheet, openRichLabelSheet, playGenreTrack } from '../ui/AlbumSheet';
import { Play, Pause, Rewind, FastForward, Music2, Star, MoreHorizontal,
         Airplay, AlignJustify, MessageSquare, Shuffle, Repeat, Infinity, X, RefreshCw } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor((s||0)/60), sec = Math.floor((s||0)%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function postNative(p) { try { window.webkit.messageHandlers.player.postMessage(p); } catch(e){} }
// Which service the audio REALLY comes from (shown as the badge on the artwork in the native sheet)
function badgeProviderOf(provider, track) {
  if (provider === 'youtube' || isStreamingProvider(provider)) return provider;
  if (!track) return 'native';
  const r = historyReplayInfo(track).provider;
  const src = (r && r !== 'lookup') ? r : (track.provider || 'native');
  if (src === 'native' && /googlevideo\.com/i.test(track.src || '')) return 'youtube';
  if (src === 'native' && /sndcdn\.com/i.test(track.src || '')) return 'soundcloud';
  if (src === 'native' && /bcbits\.com/i.test(track.src || '')) return 'bandcamp';
  return src;
}
const isNative = () => { try { return !!window.__kyoyuIsNativeApp || !!window.webkit?.messageHandlers?.player; } catch(e){ return false; } };

/* ── Dominant colour extraction (canvas-based, cached per URL) ── */
const _fpColorCache = new Map();
function extractColor(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    if (_fpColorCache.has(url)) return resolve(_fpColorCache.get(url));
    const img = new Image();
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const S = 80, cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, S, S);
        const { data } = ctx.getImageData(0, 0, S, S);
        const counts = {};
        for (let i = 0; i < data.length; i += 4) {
          if (data[i+3] < 100) continue;
          const r = Math.round(data[i]   / 32)*32;
          const g = Math.round(data[i+1] / 32)*32;
          const b = Math.round(data[i+2] / 32)*32;
          const k = `${r},${g},${b}`;
          counts[k] = (counts[k]||0)+1;
        }
        let max=0, best=null;
        for (const [k,n] of Object.entries(counts)) { if(n>max){max=n;best=k;} }
        // Avoid near-black/near-white (boring)
        if (best) {
          const [r,g,b] = best.split(',').map(Number);
          const lum = 0.299*r + 0.587*g + 0.114*b;
          if (lum < 20) best = null;  // too dark
        }
        if (best) _fpColorCache.set(url, best);
        resolve(best);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Shared flag: true while any scrubber/volume drag is active.
// Checked by FullPlayer's swipe-collapse handler to avoid collapsing on scrub release.
const scrubState = { dragging: false };

/* ── Custom drag hook ──────────────────────────────────────────
   Attaches touchstart to a hit div; touchmove/touchend on document
   so WKWebView's native scroll layer cannot intercept them.
   All visual updates are direct DOM writes — zero React re-renders.
────────────────────────────────────────────────────────────── */
function useScrub(hitRef, fillRef, thumbRef, onMovePct, onEndPct) {
  // Keep callbacks in refs so effect deps never change
  const moveRef = useRef(onMovePct);
  const endRef  = useRef(onEndPct);
  useEffect(() => { moveRef.current = onMovePct; }, [onMovePct]);
  useEffect(() => { endRef.current  = onEndPct;  }, [onEndPct]);

  useEffect(() => {
    const hit = hitRef.current; if (!hit) return;

    function pct(clientX) {
      const r = hitRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    }
    function set(p) {
      if (fillRef.current)  fillRef.current.style.width = `${p*100}%`;
      if (thumbRef.current) thumbRef.current.style.left  = `${p*100}%`;
    }

    /* touch */
    function tMove(e) { e.preventDefault(); const p = pct(e.touches[0].clientX); set(p); moveRef.current(p); }
    function tEnd(e)  {
      scrubState.dragging = false;
      document.removeEventListener('touchmove', tMove);
      const p = pct(e.changedTouches[0].clientX); set(p); endRef.current(p);
    }
    function tStart(e) {
      e.stopPropagation();
      scrubState.dragging = true;
      const p = pct(e.touches[0].clientX); set(p); moveRef.current(p);
      document.addEventListener('touchmove', tMove, { passive: false });
      document.addEventListener('touchend',  tEnd,  { once: true, passive: true });
    }

    /* mouse (desktop / simulator) */
    function mMove(e) { const p = pct(e.clientX); set(p); moveRef.current(p); }
    function mUp(e)   {
      scrubState.dragging = false;
      document.removeEventListener('mousemove', mMove);
      const p = pct(e.clientX); set(p); endRef.current(p);
    }
    function mDown(e) {
      e.stopPropagation();
      scrubState.dragging = true;
      const p = pct(e.clientX); set(p); moveRef.current(p);
      document.addEventListener('mousemove', mMove);
      document.addEventListener('mouseup',   mUp, { once: true });
    }

    hit.addEventListener('touchstart', tStart, { passive: true });
    hit.addEventListener('mousedown',  mDown);
    return () => {
      hit.removeEventListener('touchstart', tStart);
      hit.removeEventListener('mousedown',  mDown);
      document.removeEventListener('touchmove', tMove);
      document.removeEventListener('mousemove', mMove);
    };
  }, []); // eslint-disable-line — intentionally runs once; callbacks via refs
}

/* ── Progress scrubber ── */
const Scrubber = memo(function Scrubber({ progress, duration, onSeek, buffering }) {
  const hitRef   = useRef(null);
  const fillRef  = useRef(null);
  const thumbRef = useRef(null);
  const active   = useRef(false);

  const durRef  = useRef(duration);
  useEffect(() => { durRef.current = duration; }, [duration]);

  useScrub(
    hitRef, fillRef, thumbRef,
    () => { active.current = true; },
    pct => { active.current = false; onSeek(pct * (durRef.current || 0)); }
  );

  // Sync from audio only when user is not dragging
  useEffect(() => {
    if (active.current) return;
    const p = duration ? (progress / duration) * 100 : 0;
    if (fillRef.current)  fillRef.current.style.width = `${p}%`;
    if (thumbRef.current) thumbRef.current.style.left  = `${p}%`;
  }, [progress, duration]);

  const p = duration ? (progress / duration) * 100 : 0;
  return (
    <div className="fp-scrub">
      <div ref={fillRef}  className="fp-scrub-fill"  style={{ width:`${p}%` }}/>
      {buffering && (
        <div className="fp-scrub-loading" style={{ left:`${p}%`, width:`${100-p}%` }}/>
      )}
      <div ref={thumbRef} className="fp-scrub-thumb" style={{ left:`${p}%`  }}/>
      <div ref={hitRef}   className="fp-scrub-hit"/>
    </div>
  );
});


/* ── Transport + scrubbers — TOP-LEVEL so React never unmounts them ──
   (defining this inside FullPlayer would recreate the function reference
    on every progress tick, causing React to unmount/remount Scrubber
    and tear down its event listeners each second)                    ── */
const PlayerControls = memo(function PlayerControls({
  progress, duration, isPlaying, dispatch, onSeek, onNext, onPrev, showQueue, setShowQueue, buffering, bpm, musicalKey, isReanalyzing, onReanalyze,
  showBpmFader, setShowBpmFader, baseBpm, activeBpm, onChangeBpmSpeed, onResetBpmSpeed
}) {
  const rem = Math.max(0, (duration||0) - (progress||0));
  const liveBpmNumber = (activeBpm > 0 && baseBpm > 0) ? activeBpm : (parseFloat(String(bpm || '').replace(/[^0-9.]/g, '')) || 0);
  const isPitched = baseBpm > 0 && activeBpm >= 0 && Math.abs(activeBpm - baseBpm) >= 0.05;
  // Original BPM under timeline never changes when speed is adjusted
  const formattedBpm = bpm ? (/bpm/i.test(bpm) ? bpm : `${bpm} BPM`) : '';
  const holdTimerRef = useRef(null);
  const holdFiredRef = useRef(false);
  const faderCardHoldTimerRef = useRef(null);
  const faderCardStartPosRef = useRef(null);
  const isDraggingFaderRef = useRef(false);

  const [bpmFaderRange, setBpmFaderRange] = useState(() => localStorage.getItem('kyoyu-bpm-fader-range') || '50-250');
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [bpmInputValue, setBpmInputValue] = useState('');
  const bpmInputRef = useRef(null);

  useEffect(() => {
    const onRangeChange = (e) => {
      const next = e?.detail || localStorage.getItem('kyoyu-bpm-fader-range') || '50-250';
      setBpmFaderRange(next);
    };
    window.addEventListener('kyoyu-bpm-fader-range-change', onRangeChange);
    window.addEventListener('storage', onRangeChange);
    return () => {
      window.removeEventListener('kyoyu-bpm-fader-range-change', onRangeChange);
      window.removeEventListener('storage', onRangeChange);
    };
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearFaderCardHoldTimer = useCallback(() => {
    if (faderCardHoldTimerRef.current) {
      clearTimeout(faderCardHoldTimerRef.current);
      faderCardHoldTimerRef.current = null;
    }
    faderCardStartPosRef.current = null;
  }, []);

  const startHoldTimer = useCallback(() => {
    clearHoldTimer();
    holdFiredRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      holdFiredRef.current = true;
      if (onReanalyze && !isReanalyzing) onReanalyze();
    }, 2210);
  }, [clearHoldTimer, onReanalyze, isReanalyzing]);

  useEffect(() => () => {
    clearHoldTimer();
    clearFaderCardHoldTimer();
  }, [clearHoldTimer, clearFaderCardHoldTimer]);

  const [minBpm, maxBpm] = useMemo(() => {
    if (bpmFaderRange === '0-300') return [0, 300];
    if (bpmFaderRange === '100-150') return [100, 150];
    return [50, 250];
  }, [bpmFaderRange]);

  const displayedFaderBpm = Math.max(minBpm, Math.min(maxBpm, (activeBpm > 0 || activeBpm === 0 && isPitched) ? activeBpm : baseBpm));
  const pctDiff = baseBpm > 0 ? (((displayedFaderBpm - baseBpm) / baseBpm) * 100) : 0;

  const commitBpmInput = useCallback(() => {
    const cleaned = String(bpmInputValue || '').replace(',', '.').replace(/[^0-9.]/g, '').trim();
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      const clamped = Math.max(minBpm, Math.min(maxBpm, Number(parsed.toFixed(1))));
      if (onChangeBpmSpeed) onChangeBpmSpeed(clamped);
    }
    setIsEditingBpm(false);
  }, [bpmInputValue, minBpm, maxBpm, onChangeBpmSpeed]);

  return (
    <>
      <div className="fp-scrub-wrap">
        <Scrubber progress={progress} duration={duration} onSeek={onSeek} buffering={buffering}/>
        <div className="fp-times">
          <span>{fmt(progress)}</span>
          {(isReanalyzing || formattedBpm || musicalKey) && (
            <span
              className="fp-bpm-key-tap"
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10, opacity: isReanalyzing ? 0.85 : 0.78, fontWeight: 600, userSelect: 'none', WebkitUserSelect: 'none' }}
              title="Tap BPM for speed fader · Hold > 2.2s on BPM or Key to re-analyze"
              onClick={(e) => e.stopPropagation()}
            >
              {isReanalyzing ? (
                <span>Re-analyzing…</span>
              ) : (
                <>
                  {formattedBpm && (
                    <span
                      style={{
                        padding: showBpmFader || isPitched ? '1px 7px' : '0',
                        borderRadius: 999,
                        background: showBpmFader || isPitched ? 'rgba(255,255,255,0.16)' : 'transparent',
                        transition: 'background 0.18s ease',
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startHoldTimer();
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        const didFireHold = holdFiredRef.current;
                        clearHoldTimer();
                        if (!didFireHold && setShowBpmFader && liveBpmNumber > 0) {
                          setShowBpmFader(v => !v);
                        }
                      }}
                      onPointerLeave={clearHoldTimer}
                      onPointerCancel={clearHoldTimer}
                    >
                      {formattedBpm}
                    </span>
                  )}
                  {musicalKey && (
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startHoldTimer();
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        clearHoldTimer();
                      }}
                      onPointerLeave={clearHoldTimer}
                      onPointerCancel={clearHoldTimer}
                    >
                      {musicalKey}
                    </span>
                  )}
                </>
              )}
            </span>
          )}
          <span>-{fmt(rem)}</span>
        </div>
      </div>
      <div className="fp-ctrls">
        <button className="fp-ctrl" onClick={onPrev}><Rewind size={36} fill="currentColor" strokeWidth={0}/></button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying ? <Pause size={48} fill="currentColor" strokeWidth={0}/> : <Play size={48} fill="currentColor" strokeWidth={0} style={{marginLeft:3}}/>}
        </button>
        <button className="fp-ctrl" onClick={onNext}><FastForward size={36} fill="currentColor" strokeWidth={0}/></button>
      </div>
      {showBpmFader && baseBpm > 0 ? (
        <div
          className="fp-bpm-fader-card glass"
          style={{
            marginTop: 8,
            padding: '12px 16px',
            borderRadius: 28,
            border: '0.5px solid rgba(255,255,255,0.16)',
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            if (isDraggingFaderRef.current) return;
            clearFaderCardHoldTimer();
            faderCardStartPosRef.current = { x: e.clientX, y: e.clientY };
            faderCardHoldTimerRef.current = setTimeout(() => {
              faderCardHoldTimerRef.current = null;
              if (!isDraggingFaderRef.current && setShowBpmFader) {
                setIsEditingBpm(false);
                setShowBpmFader(false);
              }
            }, 2210);
          }}
          onPointerMove={(e) => {
            if (!faderCardStartPosRef.current) return;
            const dx = e.clientX - faderCardStartPosRef.current.x;
            const dy = e.clientY - faderCardStartPosRef.current.y;
            if (Math.hypot(dx, dy) > 18) {
              clearFaderCardHoldTimer();
            }
          }}
          onPointerUp={clearFaderCardHoldTimer}
          onPointerLeave={clearFaderCardHoldTimer}
          onPointerCancel={clearFaderCardHoldTimer}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isEditingBpm ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitBpmInput();
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}
                >
                  <input
                    ref={bpmInputRef}
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={bpmInputValue}
                    onChange={(e) => setBpmInputValue(e.target.value)}
                    onBlur={commitBpmInput}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      width: 64,
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.28)',
                      background: 'rgba(255,255,255,0.14)',
                      color: 'inherit',
                      fontSize: 14,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      outline: 'none',
                    }}
                  />
                  <span
                    onClick={commitBpmInput}
                    style={{ fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    BPM
                  </span>
                </form>
              ) : (
                <span
                  onClick={() => {
                    clearFaderCardHoldTimer();
                    const cur = displayedFaderBpm;
                    setBpmInputValue(Math.abs(cur - Math.round(cur)) < 0.05 ? String(Math.round(cur)) : cur.toFixed(1));
                    setIsEditingBpm(true);
                    setTimeout(() => bpmInputRef.current?.focus(), 30);
                  }}
                  style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', padding: '2px 4px', borderRadius: 8 }}
                  title="Tap to enter specific BPM"
                >
                  {Math.abs(displayedFaderBpm - Math.round(displayedFaderBpm)) < 0.05 && !isPitched
                    ? `${Math.round(displayedFaderBpm)} BPM`
                    : `${displayedFaderBpm.toFixed(1)} BPM`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                onClick={() => {
                  if (isEditingBpm) {
                    commitBpmInput();
                  } else if (isPitched && onResetBpmSpeed) {
                    onResetBpmSpeed();
                  }
                }}
                style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', fontVariantNumeric: 'tabular-nums', cursor: isPitched ? 'pointer' : 'default' }}
              >
                {pctDiff >= 0 ? `+${pctDiff.toFixed(2)}%` : `${pctDiff.toFixed(2)}%`}
              </span>
              {isPitched && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingBpm(false);
                    if (onResetBpmSpeed) onResetBpmSpeed();
                  }}
                  style={{ border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.16)', color: 'inherit', cursor: 'pointer' }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="range"
              min={minBpm}
              max={maxBpm}
              step={0.1}
              value={displayedFaderBpm}
              onPointerDown={() => {
                isDraggingFaderRef.current = true;
                clearFaderCardHoldTimer();
              }}
              onPointerUp={() => {
                isDraggingFaderRef.current = false;
              }}
              onPointerCancel={() => {
                isDraggingFaderRef.current = false;
              }}
              onChange={(e) => {
                clearFaderCardHoldTimer();
                const nextVal = parseFloat(e.target.value);
                if (!isNaN(nextVal) && onChangeBpmSpeed) {
                  if (Math.abs(nextVal - baseBpm) < 0.35) {
                    onResetBpmSpeed && onResetBpmSpeed();
                  } else {
                    onChangeBpmSpeed(nextVal);
                  }
                }
              }}
              style={{ flex: 1, accentColor: '#fff', cursor: 'pointer' }}
            />
          </div>
        </div>
      ) : (
        <div className="fp-actions">
          <button className="fp-action-btn"><MessageSquare size={22}/></button>
          <button className="fp-action-btn"><Airplay size={22}/></button>
          <button className={`fp-action-btn${showQueue?' fp-action-btn--on':''}`} onClick={()=>setShowQueue(q=>!q)}>
            <AlignJustify size={22}/>
          </button>
        </div>
      )}
    </>
  );
});

/* ── Mini bar ── */
function MiniBar({ track, isPlaying, onExpand, dispatch, onNext }) {
  const ref = useRef(null); const startY = useRef(0);
  useEffect(() => {
    const el=ref.current; if(!el) return;
    const s=e=>{ startY.current=e.touches[0].clientY; };
    const e2=e=>{ if(startY.current-e.changedTouches[0].clientY>30) onExpand(); };
    el.addEventListener('touchstart',s,{passive:true}); el.addEventListener('touchend',e2,{passive:true});
    return ()=>{ el.removeEventListener('touchstart',s); el.removeEventListener('touchend',e2); };
  },[onExpand]);
  return (
    <div ref={ref} className="mini-bar" onClick={onExpand}>
      {track.releaseCover?<img src={track.releaseCover} className="mini-art" alt=""/>:<div className="mini-art mini-art-ph"><Music2 size={18}/></div>}
      <div className="mini-info"><div className="mini-title">{track.title}</div><div className="mini-artist">{track.artistName}</div></div>
      <div className="mini-ctrls" onClick={e=>e.stopPropagation()}>
        <button className="mini-btn" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying?<Pause size={22} fill="currentColor" strokeWidth={0}/>:<Play size={22} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>}
        </button>
        <button className="mini-btn" onClick={onNext}><FastForward size={22} fill="currentColor" strokeWidth={0}/></button>
      </div>
    </div>
  );
}

/* ── Full screen player ── */
function FullPlayer({ track, isPlaying, progress, duration, open, onCollapse, dispatch, seekTo, provider, providerItemId, volume, onNext, onPrev, genreInfo, isReanalyzing, onReanalyze, showBpmFader, setShowBpmFader, baseBpm, activeBpm, onChangeBpmSpeed, onResetBpmSpeed }) {
  const ytRef = useRef(null);
  const scRef = useRef(null);
  const fpRef    = useRef(null);
  const handleRef= useRef(null);
  const startY   = useRef(0);
  const [showQueue, setShowQueue] = useState(false);
  const [accent,    setAccent]    = useState(() => _fpColorCache.get(track?.releaseCover) ?? null);
  const [buffering, setBuffering] = useState(false);
  const seekTargetRef = useRef(null);
  const lastProgressRef = useRef(progress);
  const trackIdRef = useRef(track?.id);

  // When a new track starts, show loading until progress begins
  useEffect(() => {
    if (track?.id !== trackIdRef.current) {
      trackIdRef.current = track?.id;
      setBuffering(true);
      seekTargetRef.current = null;
      lastProgressRef.current = 0;
    }
  }, [track?.id]);

  // Clear buffering once progress starts moving
  useEffect(() => {
    if (!buffering) { lastProgressRef.current = progress; return; }
    // For initial load: any progress > 0.5s means audio is flowing
    if (seekTargetRef.current === null && progress > 0.5) {
      setBuffering(false);
      return;
    }
    // For seek: progress changed meaningfully from where we were
    if (seekTargetRef.current !== null) {
      const diff = Math.abs(progress - lastProgressRef.current);
      if (diff > 0.3) {
        setBuffering(false);
        seekTargetRef.current = null;
      }
    }
    lastProgressRef.current = progress;
  }, [progress, buffering]);

  // Fallback: clear buffering after 5 seconds max (external players can be slow)
  useEffect(() => {
    if (!buffering) return;
    const t = setTimeout(() => setBuffering(false), 5000);
    return () => clearTimeout(t);
  }, [buffering]);

  /* Extract dominant colour whenever artwork changes — instant from cache */
  useEffect(() => {
    const url = track?.releaseCover;
    if (!url) { setAccent(null); return; }
    if (_fpColorCache.has(url)) { setAccent(_fpColorCache.get(url)); return; }
    // For YouTube thumbnails, set a default red accent since CORS blocks canvas sampling
    if (url.includes('ytimg.com') || url.includes('youtube.com')) {
      setAccent('180,40,40');
      return;
    }
    // For SoundCloud, use orange accent
    if (provider === 'soundcloud') {
      setAccent('255,85,0');
      return;
    }
    extractColor(url).then(c => { if (c) setAccent(c); });
  }, [track?.releaseCover]);

  useEffect(() => {
    const el=fpRef.current; const hdl=handleRef.current; if(!el||!hdl) return;
    const onTS=e=>{ startY.current=e.touches[0].clientY; };
    const onTE=e=>{
      if (scrubState.dragging) return;   // ignore release from scrub gesture
      if(e.changedTouches[0].clientY-startY.current>60) onCollapse();
    };
    el.addEventListener('touchstart',onTS,{passive:true}); el.addEventListener('touchend',onTE,{passive:true});
    hdl.addEventListener('click',onCollapse);
    return ()=>{ el.removeEventListener('touchstart',onTS); el.removeEventListener('touchend',onTE); hdl.removeEventListener('click',onCollapse); };
  },[onCollapse]);

  const Artwork = ({big}) => track.releaseCover
    ? <img src={track.releaseCover} className={big?'fp-art':'fp-q-art'} alt=""/>
    : <div className={big?'fp-art fp-art-ph':'fp-q-art fp-art-ph'}><Music2 size={big?72:24}/></div>;

  // Provider-aware seek: route to YouTube, SoundCloud, or native audio
  const handleSeek = useCallback((seconds) => {
    setBuffering(true);
    seekTargetRef.current = seconds;
    lastProgressRef.current = seconds;
    if (provider === 'youtube' && ytRef.current?.seekTo) {
      ytRef.current.seekTo(seconds);
      dispatch({ type: 'SET_PROGRESS', value: seconds });
    } else if (provider === 'soundcloud' && scRef.current?.seekTo) {
      scRef.current.seekTo(seconds);
      dispatch({ type: 'SET_PROGRESS', value: seconds });
    } else {
      seekTo(seconds);
    }
  }, [provider, seekTo, dispatch]);

  const controls = <PlayerControls progress={progress} duration={duration}
    isPlaying={isPlaying} dispatch={dispatch} onSeek={handleSeek}
    onNext={onNext} onPrev={onPrev}
    showQueue={showQueue} setShowQueue={setShowQueue} buffering={buffering}
    bpm={genreInfo?.bpm} musicalKey={genreInfo?.key}
    isReanalyzing={isReanalyzing} onReanalyze={onReanalyze}
    showBpmFader={showBpmFader} setShowBpmFader={setShowBpmFader}
    baseBpm={baseBpm} activeBpm={activeBpm}
    onChangeBpmSpeed={onChangeBpmSpeed} onResetBpmSpeed={onResetBpmSpeed}/>;

  /* Flat dominant colour: top bright → bottom 45% darker, same hue, no black */
  const fpStyle = (() => {
    if (!accent) return {};
    const [r, g, b] = accent.split(',').map(Number);
    const d = (v) => Math.round(v * 0.45); // darker shade
    return {
      background: `linear-gradient(180deg, rgb(${r},${g},${b}) 0%, rgb(${d(r)},${d(g)},${d(b)}) 100%)`,
    };
  })();

  return (
    <div ref={fpRef} className={`fp${open?' fp--open':''}`} style={fpStyle}>
      <div ref={handleRef} className="fp-handle-row"><div className="fp-handle"/></div>
      {showQueue ? (
        <>
          <div className="fp-q-header">
            <Artwork big={false}/>
            <div className="fp-q-info"><div className="fp-title">{track.title}</div></div>
            <div className="fp-meta-btns"><button className="fp-icon-btn"><Star size={18}/></button><button className="fp-icon-btn"><MoreHorizontal size={18}/></button></div>
          </div>
          <div className="fp-q-modes">
            <button className="fp-mode-btn"><Shuffle size={17}/></button><button className="fp-mode-btn"><Repeat size={17}/></button>
            <button className="fp-mode-btn fp-mode-btn--on"><Infinity size={17}/></button><button className="fp-mode-btn"><X size={17}/></button>
          </div>
          <div className="fp-q-empty"><p>There's no music in the queue.</p></div>
          {controls}
        </>
      ) : (
        <>
          <div className="fp-top">
            <div className="fp-art-wrap">
              {provider === 'youtube' && providerItemId ? (
                <div className="fp-art" style={{ overflow: 'hidden', padding: 0, background: '#000' }}>
                  <YouTubePlayer
                    ref={ytRef}
                    videoId={providerItemId}
                    isPlaying={isPlaying}
                    volume={volume}
                    onStateChange={({ isPlaying: ytPlaying, progress: ytProg, duration: ytDur }) => {
                      dispatch({ type: 'SET_PROGRESS', value: ytProg });
                      if (ytDur > 0) dispatch({ type: 'SET_DURATION', value: ytDur });
                    }}
                    onEnded={() => onNext()}
                  />
                </div>
              ) : provider === 'soundcloud' && providerItemId ? (
                <div className="fp-art" style={{ overflow: 'hidden', padding: 0, background: '#1a1a1a' }}>
                  <SoundCloudPlayer
                    ref={scRef}
                    trackUrl={providerItemId}
                    isPlaying={isPlaying}
                    volume={volume}
                    onStateChange={({ progress: scProg, duration: scDur }) => {
                      dispatch({ type: 'SET_PROGRESS', value: scProg });
                      if (scDur > 0) dispatch({ type: 'SET_DURATION', value: scDur });
                    }}
                    onEnded={() => onNext()}
                  />
                </div>
              ) : (
                <Artwork big={true}/>
              )}
            </div>
          </div>
          <div className="fp-meta">
            <div className="fp-meta-text">
              <div className="fp-title">{track.title}</div>
              <div
                className="fp-artist"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const a = track.artistName || track.artist;
                  if (a) openRichArtistSheet(a);
                }}
              >
                {track.artistName || track.artist || '—'}
              </div>
              {!track.isPrivate && genreInfo && genreInfo.primaryGenre && (
                <div className="fp-genre-row">
                  {[genreInfo.primaryGenre, ...(genreInfo.secondaryGenres || []).slice(0, 2)].map((g, idx) => (
                    <button
                      key={g}
                      type="button"
                      className={`fp-genre-chip${idx === 0 ? ' fp-genre-chip--primary' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openRichGenreSheet(g, {
                          currentArtist: track.artistName || track.artist || '',
                          currentTitle: track.title || '',
                          currentLabel: track.label || track.labelName || track.releaseLabel || '',
                          currentCover: track.releaseCover || track.artworkUrl || track.cover || '',
                          secondaryGenres: genreInfo.secondaryGenres || [],
                          confidence: genreInfo.confidence,
                          evidence: genreInfo.evidence || [],
                        });
                      }}
                    >
                      <span className="fp-genre-dot" />
                      {g}
                    </button>
                  ))}
                </div>
              )}
              {provider && provider !== 'native' && (
                <div className="fp-source-badge">
                  {provider === 'youtube' && <span className="fp-source-yt">Playing via YouTube</span>}
                  {provider === 'soundcloud' && <span className="fp-source-sc">Playing via SoundCloud</span>}
                </div>
              )}
            </div>
            <div className="fp-meta-btns"><button className="fp-icon-btn"><Star size={20}/></button><button className="fp-icon-btn"><MoreHorizontal size={20}/></button></div>
          </div>
          {controls}
        </>
      )}
    </div>
  );
}

/* ── Web Genre & Scene Sheet Modal (Musicmap Discovery Panel on Web) ── */
function WebGenreSheetModal() {
  const [genre, setGenre] = useState(null);
  const [scene, setScene] = useState(null);

  useEffect(() => {
    const onOpenGenre = (e) => {
      if (e.detail) {
        setScene(null);
        setGenre(e.detail);
      }
    };
    const onOpenScene = (e) => {
      if (e.detail) {
        setGenre(null);
        setScene(e.detail);
      }
    };
    window.addEventListener('kyoyu-open-web-genre', onOpenGenre);
    window.addEventListener('kyoyu-open-web-scene', onOpenScene);
    return () => {
      window.removeEventListener('kyoyu-open-web-genre', onOpenGenre);
      window.removeEventListener('kyoyu-open-web-scene', onOpenScene);
    };
  }, []);

  if (scene) {
    return (
      <div className="wgs-backdrop" onClick={() => setScene(null)}>
        <div className="wgs-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="wgs-handle-wrap" onClick={() => setScene(null)}>
            <div className="wgs-handle" />
          </div>
          <button className="wgs-close" onClick={() => setScene(null)} aria-label="Close">
            <X size={18} />
          </button>
          <div className="wgs-scroll">
            <div className="wgs-header">
              <div className="wgs-badges">
                {scene.category && <span className="wgs-super-badge">{scene.category.toUpperCase()}</span>}
                {scene.openedDate && <span className="wgs-origin-badge">Opened: {scene.openedDate}</span>}
              </div>
              <h2 className="wgs-title">{scene.name}</h2>
              {scene.location && (
                <div className="wgs-aliases">📍 {scene.location}{scene.address ? ` · ${scene.address}` : ''}</div>
              )}
              {scene.status && (
                <div className="wgs-traits-bar"><span>Status: {scene.status}</span></div>
              )}
            </div>

            {scene.description && (
              <div className="wgs-section">
                <div className="wgs-section-title">HISTORY & CULTURAL LEGACY</div>
                <p className="wgs-desc">{scene.description}</p>
              </div>
            )}

            {scene.closedHistory && (
              <div className="wgs-section">
                <div className="wgs-section-title">CLOSURES, RELOCATIONS & TURNING POINTS</div>
                <p className="wgs-desc">{scene.closedHistory}</p>
              </div>
            )}

            {scene.politicalEthos && (
              <div className="wgs-section">
                <div className="wgs-section-title">POLITICAL ETHOS, VALUES & SOCIAL CONTEXT</div>
                <p className="wgs-desc">{scene.politicalEthos}</p>
              </div>
            )}

            {scene.strugglesAndFights?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">FIGHTS WITH THE CITY, STATE & STRUGGLES TO STAY OPEN</div>
                {scene.strugglesAndFights.map((f, i) => (
                  <p key={i} className="wgs-desc" style={{ marginBottom: 8 }}>• {f}</p>
                ))}
              </div>
            )}

            {scene.landmarkMoments?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">DEFINING MOMENTS & HISTORIC NIGHTS</div>
                {scene.landmarkMoments.map((m, i) => (
                  <p key={i} className="wgs-desc" style={{ marginBottom: 8 }}>• {m}</p>
                ))}
              </div>
            )}

            {scene.genresPlayed?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">GENRES PLAYED & FORGED HERE</div>
                <div className="wgs-chip-list">
                  {scene.genresPlayed.map((g) => (
                    <button key={g} className="wgs-genre-link" onClick={() => openRichGenreSheet(g)}>{g}</button>
                  ))}
                </div>
              </div>
            )}

            {scene.keyActors?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">KEY ACTORS, RESIDENTS & FOUNDERS</div>
                <div className="wgs-chip-list">
                  {scene.keyActors.map((a) => (
                    <button
                      key={a}
                      className="wgs-entity-chip"
                      onClick={() => {
                        setScene(null);
                        openRichArtistSheet(a.split('(')[0].trim());
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scene.upcomingEvents?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">UPCOMING EVENTS & PROGRAMMING</div>
                {scene.upcomingEvents.map((ev, i) => (
                  <div key={i} className="wgs-track-row" style={{ cursor: 'default' }}>
                    <div className="wgs-track-info">
                      <div className="wgs-track-title">{ev.title} · {ev.date}</div>
                      <div className="wgs-track-sub">{ev.lineup}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {scene.pastEvents?.length > 0 && (
              <div className="wgs-section">
                <div className="wgs-section-title">HISTORIC & LANDMARK PAST EVENTS</div>
                {scene.pastEvents.map((pev, i) => (
                  <div key={i} className="wgs-track-row" style={{ cursor: 'default' }}>
                    <div className="wgs-track-info">
                      <div className="wgs-track-title">{pev.title} ({pev.year})</div>
                      <div className="wgs-track-sub">{pev.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!genre) return null;

  return (
    <div className="wgs-backdrop" onClick={() => setGenre(null)}>
      <div className="wgs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wgs-handle-wrap" onClick={() => setGenre(null)}>
          <div className="wgs-handle" />
        </div>
        <button className="wgs-close" onClick={() => setGenre(null)} aria-label="Close">
          <X size={18} />
        </button>
        <div className="wgs-scroll">
          {/* Header: Super-Genre + Canonical Genre + Origin */}
          <div className="wgs-header">
            <div className="wgs-badges">
              {genre.superGenre && (
                <span
                  className="wgs-super-badge"
                  onClick={() => openRichGenreSheet(genre.superGenre)}
                >
                  {genre.superGenre.toUpperCase()} FAMILY
                </span>
              )}
              {genre.secondarySuperGenre && (
                <span
                  className="wgs-super-badge wgs-super-badge--hybrid"
                  onClick={() => openRichGenreSheet(genre.secondarySuperGenre)}
                >
                  × {genre.secondarySuperGenre.toUpperCase()}
                </span>
              )}
              {(genre.originYear || genre.originDecade) && (
                <span className="wgs-origin-badge">{genre.originYear || genre.originDecade}</span>
              )}
            </div>
            <h2 className="wgs-title">{genre.name}</h2>
            {(genre.aliases?.length > 0 || genre.siblingGroup) && (
              <div className="wgs-aliases">
                {genre.aliases?.length > 0 && (
                  <span>Also known as: {genre.aliases.join(' / ')}</span>
                )}
                {genre.siblingGroup && (
                  <span> · Cluster: {genre.siblingGroup}</span>
                )}
              </div>
            )}
            {(genre.originPlace || genre.bpmRange || genre.rhythmProfile) && (
              <div className="wgs-traits-bar">
                {genre.originPlace && <span>📍 {genre.originPlace}</span>}
                {genre.bpmRange && <span>⏱ {genre.bpmRange}</span>}
                {genre.rhythmProfile && <span>🥁 {genre.rhythmProfile}</span>}
              </div>
            )}
          </div>

          {/* Sonic Traits */}
          {genre.sonicTraits?.length > 0 && (
            <div className="wgs-chip-list">
              {genre.sonicTraits.map((t) => (
                <span key={t} className="wgs-trait-pill">{t}</span>
              ))}
            </div>
          )}

          {/* Description */}
          {genre.description && (
            <div className="wgs-section">
              <div className="wgs-section-title">HISTORY & SOUND</div>
              <p className="wgs-desc">{genre.description}</p>
            </div>
          )}

          {/* Genealogy / Musicmap Graph */}
          {(genre.parentGenres?.length > 0 || genre.adjacentGenres?.length > 0 || genre.subgenres?.length > 0 || genre.backlashAgainst?.length > 0) && (
            <div className="wgs-section">
              <div className="wgs-section-title">GENEALOGY & CONNECTIONS</div>
              {genre.parentGenres?.length > 0 && (
                <div className="wgs-graph-group">
                  <span className="wgs-graph-label">Historic Roots</span>
                  <div className="wgs-chip-list">
                    {genre.parentGenres.map((g) => (
                      <button key={g} className="wgs-genre-link" onClick={() => openRichGenreSheet(g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {genre.adjacentGenres?.length > 0 && (
                <div className="wgs-graph-group">
                  <span className="wgs-graph-label">Often Mixed With / Adjacent</span>
                  <div className="wgs-chip-list">
                    {genre.adjacentGenres.map((g) => (
                      <button key={g} className="wgs-genre-link" onClick={() => openRichGenreSheet(g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {genre.subgenres?.length > 0 && (
                <div className="wgs-graph-group">
                  <span className="wgs-graph-label">Offshoots & Subgenres</span>
                  <div className="wgs-chip-list">
                    {genre.subgenres.map((g) => (
                      <button key={g} className="wgs-genre-link" onClick={() => openRichGenreSheet(g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {genre.backlashAgainst?.length > 0 && (
                <div className="wgs-graph-group">
                  <span className="wgs-graph-label">Counter-Current / Backlash To</span>
                  <div className="wgs-chip-list">
                    {genre.backlashAgainst.map((g) => (
                      <button key={g} className="wgs-genre-link" onClick={() => openRichGenreSheet(g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Similar Titles in the Same Genre (50% Classics / 50% Deep Cuts + Refresh) */}
          {genre.similarTracks?.length > 0 && (
            <div className="wgs-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div className="wgs-section-title" style={{ marginBottom: 2 }}>SIMILAR TITLES IN {genre.name.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)' }}>50% Essential Classics · 50% Deep Niche Cuts</div>
                </div>
                <button
                  className="wgs-genre-link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => refreshGenreSheetTracks(genre.name)}
                >
                  <RefreshCw size={12} />
                  <span>Refresh</span>
                </button>
              </div>
              <div className="wgs-tracks-list">
                {genre.similarTracks.slice(0, 14).map((t) => (
                  <div
                    key={t.id}
                    className="wgs-track-row"
                    onClick={() => playGenreTrack(t)}
                  >
                    {(t.coverImage || t.thumb || t.cover) ? (
                      <img src={t.coverImage || t.thumb || t.cover} className="wgs-track-art" alt="" />
                    ) : (
                      <div className="wgs-track-art wgs-track-art--ph"><Music2 size={16} /></div>
                    )}
                    <div className="wgs-track-info">
                      <div className="wgs-track-title">{t.title}</div>
                      <div className="wgs-track-sub">
                        {t.artist}{t.label ? ` · ${t.label}` : ''}{t.year ? ` (${t.year})` : ''}
                      </div>
                    </div>
                    <Play size={18} fill="currentColor" className="wgs-track-play" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pioneer Artists & Collaborators */}
          {(genre.pioneerArtists?.length > 0 || genre.collaboratorArtists?.length > 0) && (
            <div className="wgs-section">
              <div className="wgs-section-title">PIONEERS & SCENE ARTISTS</div>
              <div className="wgs-chip-list">
                {[...(genre.collaboratorArtists || []), ...(genre.pioneerArtists || [])]
                  .filter((v, i, a) => v && a.indexOf(v) === i)
                  .slice(0, 16)
                  .map((artist) => (
                    <button
                      key={artist}
                      className="wgs-entity-chip"
                      onClick={() => {
                        setGenre(null);
                        openRichArtistSheet(artist);
                      }}
                    >
                      {artist}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Key Labels */}
          {genre.classicLabels?.length > 0 && (
            <div className="wgs-section">
              <div className="wgs-section-title">KEY LABELS</div>
              <div className="wgs-chip-list">
                {genre.classicLabels.slice(0, 14).map((lbl) => (
                  <button
                    key={lbl}
                    className="wgs-entity-chip"
                    onClick={() => {
                      setGenre(null);
                      openRichLabelSheet(lbl);
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Club / Festival / Scene Contexts — Tappable to open Scene Sheet */}
          {genre.eventContexts?.length > 0 && (
            <div className="wgs-section">
              <div className="wgs-section-title">ICONIC CLUBS, FESTIVALS & SCENES</div>
              <div className="wgs-chip-list">
                {genre.eventContexts.map((ev) => (
                  <button
                    key={ev}
                    className="wgs-entity-chip"
                    onClick={() => openRichSceneSheet(ev)}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useLibrary } from '../../contexts/LibraryContext';

/* ── Root ── */
export default function Player({ hideMini = false }) {
  const { state, dispatch, seekTo, playNextSearch, playPrevSearch, playPreviousListened, isInSearchQueue, playNextAutoplay, resumeRestoredSession, recoverYouTubeFailure } = usePlayer();
  const { toggleLikeUpload, isLikedUpload, toggleLike, isLiked, likedUploads, likedTracks } = useLibrary();
  const [exp, setExp] = useState(false);
  const { currentTrack, isPlaying, progress, duration, provider, providerItemId, volume, restoredPending } = state;
  const [resolvedGenre, setResolvedGenre] = useState(null);
  const [reanalyzeTick, setReanalyzeTick] = useState(0);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [showBpmFader, setShowBpmFader] = useState(false);
  const [baseBpm, setBaseBpm] = useState(0);
  const [activeBpm, setActiveBpm] = useState(0);

  const applyPlaybackRate = useCallback((rate) => {
    const rawRate = Number(rate);
    const clampedRate = isNaN(rawRate) ? 1.0 : (rawRate <= 0.01 ? 0.0 : Math.max(0.0625, Math.min(4.0, rawRate)));
    window.__kyoyuPlaybackRate = clampedRate;
    const audioEl = window.__kyoyuAudioRef;
    if (audioEl) {
      try {
        if ('preservesPitch' in audioEl) audioEl.preservesPitch = false;
        if ('webkitPreservesPitch' in audioEl) audioEl.webkitPreservesPitch = false;
        if ('mozPreservesPitch' in audioEl) audioEl.mozPreservesPitch = false;
        audioEl.playbackRate = clampedRate <= 0.01 ? 0.0625 : clampedRate;
      } catch (e) {}
    }
    try {
      ytHiddenRef.current?.setPlaybackRate?.(Math.max(0.25, Math.min(2.0, clampedRate || 0.25)));
    } catch (e) {}
    try {
      const mh = window.webkit?.messageHandlers?.audioFallback;
      if (mh) mh.postMessage({ playbackRate: clampedRate });
    } catch (e) {}
  }, []);

  const handleChangeBpmSpeed = useCallback((targetBpm) => {
    if (!(baseBpm > 0)) return;
    const numTarget = Number(targetBpm);
    const clampedBpm = isNaN(numTarget) ? baseBpm : Math.max(0, Math.min(300, numTarget));
    setActiveBpm(clampedBpm);
    const rate = clampedBpm / baseBpm;
    applyPlaybackRate(rate);
  }, [baseBpm, applyPlaybackRate]);

  const handleResetBpmSpeed = useCallback(() => {
    if (baseBpm > 0) setActiveBpm(baseBpm);
    applyPlaybackRate(1.0);
  }, [baseBpm, applyPlaybackRate]);

  // Reset BPM speed fader and playback rate when switching to a new track
  useEffect(() => {
    setShowBpmFader(false);
    setBaseBpm(0);
    setActiveBpm(0);
    applyPlaybackRate(1.0);
  }, [currentTrack?.id, applyPlaybackRate]);

  const handleReanalyzeCurrentTrack = useCallback(() => {
    if (!currentTrack) return;
    const rawTitle = currentTrack.title || '';
    const rawArtist = currentTrack.artistName || currentTrack.artist || '';
    const rawLabel = currentTrack.label || currentTrack.labelName || currentTrack.releaseLabel || '';
    const rawAlbum = (currentTrack.releaseTitle || currentTrack.albumTitle || currentTrack.album || '').replace(/\s*\(single\)\s*$/i, '').trim();
    const cleaned = splitCleanMetadata(rawTitle, rawArtist, rawLabel, rawAlbum);
    const title = cleaned.title || rawTitle;
    const artist = cleaned.artist || rawArtist;
    const album = cleanTrackOrReleaseTitle(cleaned.album || rawAlbum, artist);
    const cacheKey = [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
    const fullCacheKey = [artist, title, album].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
    if (window.__kyoyuInfoCache) {
      delete window.__kyoyuInfoCache[cacheKey];
      if (fullCacheKey) delete window.__kyoyuInfoCache[fullCacheKey];
    }
    clearEssentiaAudioCache(fullCacheKey || cacheKey, currentTrack.previewUrl || currentTrack.src || '');
    setIsReanalyzing(true);
    setReanalyzeTick(t => t + 1);
  }, [currentTrack]);

  useEffect(() => {
    window.__kyoyuReanalyzeCurrentTrack = handleReanalyzeCurrentTrack;
    return () => {
      if (window.__kyoyuReanalyzeCurrentTrack === handleReanalyzeCurrentTrack) {
        delete window.__kyoyuReanalyzeCurrentTrack;
      }
    };
  }, [handleReanalyzeCurrentTrack]);

  const isLongFormTrack = useMemo(() => {
    if (Number(duration) > 1320) return true;
    const rawDur = currentTrack?.duration;
    if (typeof rawDur === 'number' && rawDur > 0) {
      const sec = rawDur > 43200 ? rawDur / 1000 : rawDur;
      if (sec > 1320) return true;
    } else if (typeof rawDur === 'string' && rawDur.includes(':')) {
      const parts = rawDur.trim().split(':').map(Number);
      if (!parts.some(isNaN)) {
        const sec = parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + (parts[1] || 0);
        if (sec > 1320) return true;
      }
    }
    return false;
  }, [duration, currentTrack]);

  const isPrivateTrack = useMemo(() => {
    if (!currentTrack) return false;
    const tid = String(currentTrack.id || '');
    const rawItemId = String(currentTrack.trackId || currentTrack.providerItemId || currentTrack.appleMusicId || '');
    const rawUrl = String(currentTrack.providerUrl || currentTrack.trackUrl || currentTrack.providerItemId || currentTrack.url || '');
    return Boolean(
      currentTrack.isPrivate ||
      currentTrack.origin?.isPrivate ||
      /soundcloud\.com\/[^/]+\/[^/]+\/s-[A-Za-z0-9]+/i.test(rawUrl) ||
      ((provider === 'applemusic' || currentTrack.sourceProvider === 'applemusic' || tid.startsWith('am-')) &&
        (tid.startsWith('am-i.') || rawItemId.startsWith('i.')) &&
        !currentTrack.catalogId)
    );
  }, [currentTrack, provider]);

  const activeGenreInfo = useMemo(() => {
    if (!currentTrack || isLongFormTrack) return null;
    if (resolvedGenre && !resolvedGenre.isLongFormMix && String(resolvedGenre._trackKey) === `${currentTrack.id || ''}:${currentTrack.title || ''}` && !resolvedGenre.unverified) {
      if (isPrivateTrack) {
        return {
          ...resolvedGenre,
          primaryGenre: '',
          secondaryGenres: [],
          superGenre: '',
        };
      }
      return resolvedGenre;
    }
    return null;
  }, [resolvedGenre, currentTrack, isLongFormTrack, isPrivateTrack]);

  // Sync baseBpm whenever activeGenreInfo reports a verified BPM
  useEffect(() => {
    const rawBpmStr = String(activeGenreInfo?.bpm || currentTrack?.bpm || '').replace(/[^0-9.]/g, '');
    const parsed = parseFloat(rawBpmStr);
    if (parsed > 30 && parsed < 260) {
      setBaseBpm(prev => {
        if (Math.abs(prev - parsed) > 0.05) {
          setActiveBpm(parsed);
        }
        return parsed;
      });
    }
  }, [activeGenreInfo?.bpm, currentTrack?.bpm]);

  // Search-queue-aware next/prev — used by controls, mini bar, onEnded, and native bridge
  const handleNext = useCallback(() => {
    if (isInSearchQueue()) { 
      playNextSearch(); // internally calls playNextAutoplay if exhausted
    }
    else { playNextAutoplay(); }
  }, [isInSearchQueue, playNextSearch, playNextAutoplay]);

  const handlePrev = useCallback(() => {
    if (playPreviousListened) {
      playPreviousListened();
    } else if (isInSearchQueue()) {
      playPrevSearch();
    } else {
      dispatch({ type: 'PREV_TRACK' });
    }
  }, [playPreviousListened, isInSearchQueue, playPrevSearch, dispatch]);
  const expand   = useCallback(()=>{ setExp(true);  postNative({expanded:true});  },[]);
  const collapse = useCallback(()=>{ setExp(false); postNative({expanded:false}); },[]);
  useEffect(()=>{
    window.__kyoyuSetProgress = (prog) => {
      dispatch({ type: 'SET_PROGRESS', value: prog });
    };
    window.__kyoyuSetDuration = (dur) => {
      // Small optimization: avoid re-rendering if unchanged
      // (PlayerContext state is passed directly to Audio fallback UI usually, but doing it safely here)
      dispatch({ type: 'SET_DURATION', value: dur });
    };
    
    window.__kyoyuPlayerCmd = (cmd, val)=>{
      if (cmd === 'nativeError') {
        dispatch({ type: 'NATIVE_ERROR' });
        return;
      }
      if (cmd === 'setPlaybackRate') {
        const rawRate = Number(val);
        const rate = isNaN(rawRate) ? 1.0 : (rawRate <= 0.01 ? 0.0 : Math.max(0.0625, Math.min(4.0, rawRate)));
        window.__kyoyuPlaybackRate = rate;
        const audioEl = window.__kyoyuAudioRef;
        if (audioEl) {
          try {
            if ('preservesPitch' in audioEl) audioEl.preservesPitch = false;
            if ('webkitPreservesPitch' in audioEl) audioEl.webkitPreservesPitch = false;
            if ('mozPreservesPitch' in audioEl) audioEl.mozPreservesPitch = false;
            audioEl.playbackRate = rate <= 0.01 ? 0.0625 : rate;
          } catch (e) {}
        }
        try {
          ytHiddenRef.current?.setPlaybackRate?.(Math.max(0.25, Math.min(2.0, rate || 0.25)));
        } catch (e) {}
        return;
      }
      if (cmd === 'ytEnsurePause') {
        // The user paused outside the app: never let the iframe (or the web play state) resume on return
        if (provider === 'youtube') {
          if (isPlaying) dispatch({ type: 'SET_PLAYING', value: false });
          ytHiddenRef.current?.pause?.();
        }
        return;
      }
      if (cmd === 'ytKick') {
        // App just went to the background: WebKit may have paused the iframe — resume it if the user is playing
        if (provider === 'youtube' && isPlaying) ytHiddenRef.current?.play?.();
        return;
      }
      if (cmd === 'next' || cmd === 'prev') {
        const now = Date.now();
        const last = window.__kyoyuLastSkip || { cmd: '', t: 0 };
        if (last.cmd === cmd && now - last.t < 450) return;
        window.__kyoyuLastSkip = { cmd, t: now };
      }
      if ((cmd === 'toggle' || cmd === 'play') && restoredPending) {
        // Restored (paused, not loaded) session: first play re-resolves a fresh stream and resumes at the saved spot
        resumeRestoredSession();
        return;
      }
      if(cmd==='toggle') {
        // Directly control external players for instant response
        const willPlay = !isPlaying; // state BEFORE toggle
        dispatch({type:'TOGGLE_PLAY'});
        if (isStreamingProvider(provider)) {
          callStreaming(willPlay ? 'resume' : 'pause', { service: provider }).catch(() => {});
        } else if (provider === 'youtube') {
          if (willPlay) ytHiddenRef.current?.play?.();
          else          ytHiddenRef.current?.pause?.();
        } else if (provider === 'soundcloud') {
          if (willPlay) scHiddenRef.current?.play?.();
          else          scHiddenRef.current?.pause?.();
        } else {
          // Native provider: directly control AVPlayer
          try {
            const mh = window.webkit?.messageHandlers?.audioFallback;
            if (mh) mh.postMessage(willPlay ? 'resume' : 'pause');
          } catch(e) {}
        }
      }
      if(cmd==='play') {
        dispatch({type:'SET_PLAYING', value: true});
        if (isStreamingProvider(provider)) callStreaming('resume', { service: provider }).catch(() => {});
        else if (provider === 'youtube') ytHiddenRef.current?.play?.();
        else if (provider === 'soundcloud') scHiddenRef.current?.play?.();
        else {
          try {
            const mh = window.webkit?.messageHandlers?.audioFallback;
            if (mh) mh.postMessage('resume');
          } catch(e) {}
        }
      }
      if(cmd==='pause') {
        dispatch({type:'SET_PLAYING', value: false});
        if (isStreamingProvider(provider)) callStreaming('pause', { service: provider }).catch(() => {});
        else if (provider === 'youtube') ytHiddenRef.current?.pause?.();
        else if (provider === 'soundcloud') scHiddenRef.current?.pause?.();
        else {
          try {
            const mh = window.webkit?.messageHandlers?.audioFallback;
            if (mh) mh.postMessage('pause');
          } catch(e) {}
        }
      }
      if(cmd==='next') handleNext();
      if(cmd==='prev') handlePrev();
      if(cmd==='stop')   dispatch({type:'STOP'});
      if(cmd==='expand'){
        // On native iOS, only forward to Swift — don't open web FullPlayer
        if (isNative()) {
          postNative({expanded:true});
        } else {
          setExp(true); postNative({expanded:true});
        }
      }
      if(cmd==='seekTo' && typeof val === 'number') {
        // Route seek to the correct player based on provider
        if (isStreamingProvider(provider)) {
          callStreaming('seek', { service: provider, position: val }).catch(() => {});
          dispatch({ type: 'SET_PROGRESS', value: val });
        } else if (provider === 'youtube') {
          ytHiddenRef.current?.seekTo?.(val);
          dispatch({ type: 'SET_PROGRESS', value: val });
        } else if (provider === 'soundcloud') {
          scHiddenRef.current?.seekTo?.(val);
          dispatch({ type: 'SET_PROGRESS', value: val });
        } else {
          seekTo(val);
        }
      }
    };
    
    // Listen for global native like event
    const handleNativeLike = (e) => {
      if (e.detail.handled) return;
      const trackId = String(e.detail.trackId).split('?ts=')[0];
      if (currentTrack && String(currentTrack.id) === trackId) {
        e.detail.handled = true;
        const trackObj = {
          ...currentTrack,
          cover: currentTrack.releaseCover || currentTrack.artworkUrl || '',
          // Preserve provider metadata for YouTube/SoundCloud/Bandcamp playback & like sync from library
          provider: badgeProviderOf(provider, currentTrack),
          providerItemId: currentTrack.providerItemId || currentTrack.providerUrl || undefined,
          scTrackId: currentTrack.scTrackId || currentTrack.origin?.scTrackId || undefined,
          // exact source for replay from Library (Bandcamp page / SoundCloud id / YouTube id)
          replay: historyReplayInfo(currentTrack),
        };
        try { toggleLikeUpload(trackObj); } catch(err) {}
      }
    };
    window.addEventListener('kyoyu-native-like', handleNativeLike);

    // Send initial player style preference to Swift
    const style = localStorage.getItem('kyoyu-player-style') || 'sheet';
    postNative({ playerStyle: style });
    return ()=>{ 
      window.removeEventListener('kyoyu-native-like', handleNativeLike);
      delete window.__kyoyuPlayerCmd; 
    };
  },[dispatch, seekTo, currentTrack, toggleLikeUpload, provider, isPlaying, handleNext, handlePrev, restoredPending, resumeRestoredSession]);
  useEffect(() => {
    if (currentTrack) {
      const tid = String(currentTrack.id || '');
      const rawItemId = String(currentTrack.trackId || currentTrack.providerItemId || currentTrack.appleMusicId || '');
      const isPrivateAmWithoutArt =
        (provider === 'applemusic' || tid.startsWith('am-')) &&
        (tid.startsWith('am-i.') || rawItemId.startsWith('i.')) &&
        !!currentTrack.catalogId;
      const rawArt = isPrivateAmWithoutArt ? '' : (currentTrack.releaseCover || currentTrack.artworkUrl || currentTrack.cover || '');
      const validArt = (typeof rawArt === 'string' && /^(https?:\/\/|data:|blob:|\/)/i.test(rawArt.trim()))
        ? rawArt.trim().replace('{w}', '600').replace('{h}', '600')
        : '';
      const isInvalidAlbumName = (s) => {
        if (typeof s !== 'string') return true;
        const t = s.trim();
        if (!t) return true;
        if (/^(unknown(\s+album|\s+release)?|single\s+release|radio|track\s+radio|—|-)$/i.test(t)) return true;
        if (/\s+radio$/i.test(t) || /^(seeded|inspired)\s+by\s+/i.test(t)) return true;
        return false;
      };
      const rawArtist = currentTrack.artistName || currentTrack.artist || '';
      const rawTitle = currentTrack.title || '';
      const rawLabel = isPrivateTrack ? '' : (currentTrack.label || currentTrack.labelName || currentTrack.releaseLabel || '');
      const rawAlbum = isPrivateTrack ? '' : ([currentTrack.releaseTitle, currentTrack.albumTitle, currentTrack.album]
        .find(a => !isInvalidAlbumName(a)) || '');
      const cleanRawAlbum = rawAlbum.replace(/\s*\(single\)\s*$/i, '').trim();
      const cleanedMeta = splitCleanMetadata(rawTitle, rawArtist, rawLabel, cleanRawAlbum);
      const cleanTitle = cleanedMeta.title || rawTitle;
      const cleanArtist = cleanedMeta.artist || rawArtist;
      const cleanLabel = isPrivateTrack ? '' : (cleanedMeta.label || rawLabel);
      const cleanAlbumFromMeta = isPrivateTrack ? '' : cleanTrackOrReleaseTitle(cleanedMeta.album || cleanRawAlbum, cleanArtist);
      const hasVerifiedTrackAnalysis = Boolean(activeGenreInfo && !activeGenreInfo.unverified && activeGenreInfo.analyzed);
      postNative({
        visible: true,
        playing: isPlaying,
        title: cleanTitle,
        artwork: validArt,
        trackId: String(currentTrack.id || ''),
        albumId: isPrivateTrack ? '' : String(currentTrack.releaseId || currentTrack.album || ''),
        artist: cleanArtist,
        albumName: isPrivateTrack ? '' : (cleanAlbumFromMeta || ''),
        label: isPrivateTrack ? '' : cleanLabel,
        year: String(currentTrack.year || currentTrack.releaseYear || ''),
        bpm: hasVerifiedTrackAnalysis ? String(activeGenreInfo.bpm || currentTrack.bpm || '') : '',
        key: hasVerifiedTrackAnalysis ? String(activeGenreInfo.key || currentTrack.key || currentTrack.musicalKey || '') : '',
        genre: (hasVerifiedTrackAnalysis && !isPrivateTrack) ? (activeGenreInfo?.primaryGenre || '') : '',
        secondaryGenres: (hasVerifiedTrackAnalysis && !isPrivateTrack) ? (activeGenreInfo?.secondaryGenres || []) : [],
        superGenre: (hasVerifiedTrackAnalysis && !isPrivateTrack) ? (activeGenreInfo?.superGenre || '') : '',
        analyzed: hasVerifiedTrackAnalysis,
        isPrivate: isPrivateTrack,
        provider: provider || 'native',
        sourceProvider: badgeProviderOf(provider, currentTrack),
        trackUrl: currentTrack.providerUrl || currentTrack.trackUrl || currentTrack.providerItemId || currentTrack.replay?.url || '',
        albumUrl: isPrivateTrack ? '' : (currentTrack.albumUrl || '')
      });
    } else {
      postNative({ visible: false, playing: false });
    }
  }, [currentTrack, isPlaying, provider, likedUploads, likedTracks, activeGenreInfo, isPrivateTrack]);

  // Universal Multi-Signal Genre Determination (Musicmap Classifier + Discogs / MusicBrainz / Bandcamp enrichment)
  useEffect(() => {
    if (!currentTrack) {
      setResolvedGenre(null);
      return;
    }
    let cancelled = false;
    const isInvalidAlbumName = (s) => {
      if (typeof s !== 'string') return true;
      const t = s.trim();
      if (!t) return true;
      if (/^(unknown(\s+album|\s+release)?|single\s+release|radio|track\s+radio|—|-)$/i.test(t)) return true;
      if (/\s+radio$/i.test(t) || /^(seeded|inspired)\s+by\s+/i.test(t)) return true;
      return false;
    };
    const trackKey = `${currentTrack.id || ''}:${currentTrack.title || ''}`;
    const srcProv = badgeProviderOf(provider, currentTrack);
    const rawTitle = currentTrack.title || '';
    const rawArtist = currentTrack.artistName || currentTrack.artist || '';
    const rawLabel = isPrivateTrack ? '' : (currentTrack.label || currentTrack.labelName || currentTrack.releaseLabel || '');
    const rawAlbum = isPrivateTrack ? '' : ([currentTrack.releaseTitle, currentTrack.albumTitle, currentTrack.album]
      .find(a => !isInvalidAlbumName(a)) || '');
    const cleaned = splitCleanMetadata(rawTitle, rawArtist, rawLabel, rawAlbum.replace(/\s*\(single\)\s*$/i, '').trim());
    const title = cleaned.title || rawTitle;
    const artist = cleaned.artist || rawArtist;
    const album = isPrivateTrack ? '' : cleanTrackOrReleaseTitle(cleaned.album || rawAlbum.replace(/\s*\(single\)\s*$/i, '').trim(), artist);
    const bcTrackUrl = [
      currentTrack.albumUrl,
      currentTrack.providerUrl,
      currentTrack.trackUrl,
      currentTrack.providerItemId,
      currentTrack.replay?.url,
      currentTrack.origin?.url,
    ].find(u => typeof u === 'string' && /^https?:\/\/[^/]+\.bandcamp\.com/i.test(u)) || '';
    const cacheKey = [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
    const fullCacheKey = [artist, title, album].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');

    const forceRefreshNow = reanalyzeTick > 0;

    // 1. Check if we already have cached track-info
    const cachedInfo = forceRefreshNow ? null : (window.__kyoyuInfoCache?.[fullCacheKey] || window.__kyoyuInfoCache?.[cacheKey]);
    if (cachedInfo) {
      const isLongMixCached = Boolean(isLongFormTrack || cachedInfo.isLongFormMix || Number(cachedInfo.duration) > 1320);
      const initial = (isLongMixCached || isPrivateTrack) ? { primaryGenre: '', secondaryGenres: [], superGenre: '', unverified: isLongMixCached } : classifyTrackGenre(currentTrack, {
        ...cachedInfo,
        provider: srcProv,
      });
      const isAlreadyAnalyzed = !isLongMixCached && Boolean(
        cachedInfo.analyzed ||
        (cachedInfo.bpm && cachedInfo.key && (isPrivateTrack || initial.primaryGenre || cachedInfo.primaryGenre))
      );
      setResolvedGenre({
        ...initial,
        primaryGenre: (isLongMixCached || isPrivateTrack) ? '' : (cachedInfo.primaryGenre || initial.primaryGenre || ''),
        secondaryGenres: (isLongMixCached || isPrivateTrack) ? [] : (cachedInfo.secondaryGenres?.length ? cachedInfo.secondaryGenres : (initial.secondaryGenres || [])),
        bpm: (!isLongMixCached && cachedInfo.bpm && cachedInfo.bpmFromProvider !== false) ? String(cachedInfo.bpm) : '',
        key: (!isLongMixCached && cachedInfo.key && cachedInfo.keyFromProvider !== false) ? String(cachedInfo.key) : '',
        analyzed: isAlreadyAnalyzed,
        unverified: isLongMixCached || (!isAlreadyAnalyzed && !isPrivateTrack && initial.unverified),
        _trackKey: trackKey,
      });
      const initialPatch = {
        trackId: String(currentTrack.id || ''),
        verifiedGenre: (isLongMixCached || isPrivateTrack) ? '' : (cachedInfo.primaryGenre || initial.primaryGenre || ''),
        verifiedSecondaryGenres: (isLongMixCached || isPrivateTrack) ? [] : (cachedInfo.secondaryGenres?.length ? cachedInfo.secondaryGenres : (initial.secondaryGenres || [])),
        superGenre: (isLongMixCached || isPrivateTrack) ? '' : (initial.superGenre || ''),
        analyzed: isAlreadyAnalyzed,
        isPrivate: isPrivateTrack,
      };
      if (isAlreadyAnalyzed && !isLongMixCached) {
        initialPatch.genre = isPrivateTrack ? '' : initialPatch.verifiedGenre;
        initialPatch.secondaryGenres = isPrivateTrack ? [] : initialPatch.verifiedSecondaryGenres;
      }
      if (!isLongMixCached && cachedInfo.bpm && cachedInfo.bpmFromProvider !== false) initialPatch.bpm = String(cachedInfo.bpm);
      if (!isLongMixCached && cachedInfo.key && cachedInfo.keyFromProvider !== false) initialPatch.key = String(cachedInfo.key);
      if (cachedInfo.previewUrl) initialPatch.previewUrl = String(cachedInfo.previewUrl);
      if (!isPrivateTrack && cachedInfo.album && !isInvalidAlbumName(cachedInfo.album)) {
        initialPatch.albumName = cleanTrackOrReleaseTitle(String(cachedInfo.album).replace(/\s*\(single\)\s*$/i, '').trim(), artist);
      }
      if (!isPrivateTrack && cachedInfo.label && !(cleaned.label || currentTrack.label || currentTrack.labelName || currentTrack.releaseLabel)) {
        initialPatch.label = cachedInfo.label;
      }
      if (cachedInfo.year && !(currentTrack.year || currentTrack.releaseYear)) {
        initialPatch.year = String(cachedInfo.year);
      }
      postNative(initialPatch);
    }

    // Preload Album, Artist, and Label sheets immediately in background
    if (typeof window.__kyoyuPreloadPlayingEntities === 'function') {
      window.__kyoyuPreloadPlayingEntities(currentTrack, cachedInfo || null);
    }

    if (!forceRefreshNow && cachedInfo && cachedInfo._v === 20 && (cachedInfo.label || !bcTrackUrl)) return;

    // 2. Asynchronously query /api/discogs-search (action: 'track-info') AND /api/bandcamp-resolve (when on Bandcamp)
    (async () => {
      try {
        const discogsPromise = fetch('/api/discogs-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'track-info',
            title,
            artist,
            album,
            provider: srcProv,
            trackId: String(currentTrack.id || ''),
            duration: Number(duration || currentTrack.duration || 0),
            forceRefresh: forceRefreshNow,
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        const bcPagePromise = bcTrackUrl
          ? fetch('/api/bandcamp-resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'album-tracks', url: bcTrackUrl }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null);

        const [rawInfoData, bcPageData] = await Promise.all([discogsPromise, bcPagePromise]);
        if (cancelled || (!rawInfoData && !bcPageData && !isPrivateTrack)) return;

        const infoData = { ...(rawInfoData || {}) };
        if (!isPrivateTrack && bcPageData && !bcPageData.error) {
          if (bcPageData.label && (!infoData.label || /not on label|unknown/i.test(infoData.label))) {
            infoData.label = bcPageData.label;
          }
          if (bcPageData.labelUrl) {
            infoData.labelUrl = bcPageData.labelUrl;
          }
          if (bcPageData.albumName && (isInvalidAlbumName(infoData.album) || infoData.album === title)) {
            infoData.album = cleanTrackOrReleaseTitle(bcPageData.albumName, artist || bcPageData.artist || '');
          }
          if (bcPageData.year && !infoData.year) {
            infoData.year = String(bcPageData.year);
          }
        }

        const isLongMixInfo = Boolean(isLongFormTrack || infoData.isLongFormMix || Number(infoData.duration) > 1320);

        // Tier 1 Web Audio Essentia MIR fallback when running on Web and Tier 2 metadata lacks BPM or Key (or when user explicitly held BPM/Key to re-analyze)
        if (!isLongMixInfo && !isNative() && (forceRefreshNow || !infoData.bpm || !infoData.key)) {
          const candidateAudioUrl = infoData.previewUrl || currentTrack.previewUrl || currentTrack.src || '';
          if (candidateAudioUrl && /^https?:\/\//i.test(candidateAudioUrl)) {
            const dspRes = await analyzeAudioUrlWithEssentiaDSP(candidateAudioUrl, fullCacheKey || cacheKey, forceRefreshNow);
            if (cancelled) return;
            if (dspRes) {
              if ((forceRefreshNow || !infoData.bpm) && dspRes.bpm) {
                infoData.bpm = dspRes.bpm;
                infoData.bpmFromProvider = true;
              }
              if ((forceRefreshNow || !infoData.key) && dspRes.key) {
                infoData.key = dspRes.key;
                infoData.keyFromProvider = true;
              }
              infoData.analyzed = true;
            }
          }
        }

        window.__kyoyuInfoCache = window.__kyoyuInfoCache || {};
        window.__kyoyuInfoCache[cacheKey] = infoData;
        if (fullCacheKey) window.__kyoyuInfoCache[fullCacheKey] = infoData;

        const refined = (isLongMixInfo || isPrivateTrack) ? { primaryGenre: '', secondaryGenres: [], superGenre: '', unverified: isLongMixInfo } : classifyTrackGenre(currentTrack, {
          ...infoData,
          provider: srcProv,
        });
        const bestPrimaryGenre = (isLongMixInfo || isPrivateTrack) ? '' : (infoData.kyoyuAnalysis?.primaryGenre || refined.primaryGenre || (Array.isArray(infoData.styles) && infoData.styles[0]) || '');
        const bestSecondaryGenres = (isLongMixInfo || isPrivateTrack) ? [] : ((infoData.kyoyuAnalysis?.secondaryGenres?.length ? infoData.kyoyuAnalysis.secondaryGenres : null)
          || (refined.secondaryGenres?.length ? refined.secondaryGenres : null)
          || (Array.isArray(infoData.styles) ? infoData.styles.slice(1, 4) : []));
        const isTrackAnalyzed = !isLongMixInfo && Boolean(
          infoData.analyzed ||
          (infoData.bpm && infoData.key && (isPrivateTrack || bestPrimaryGenre))
        );

        // Persist newly completed Web DSP analysis to Supabase track_info_cache
        if (!isLongMixInfo && !isNative() && isTrackAnalyzed && infoData.bpm && infoData.key && (bestPrimaryGenre || isPrivateTrack) && (forceRefreshNow || !rawInfoData?.analyzed)) {
          fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save-track-analysis',
              title,
              artist,
              album: isPrivateTrack ? '' : (infoData.album || album || ''),
              bpm: String(infoData.bpm),
              key: String(infoData.key),
              primaryGenre: isPrivateTrack ? '' : bestPrimaryGenre,
              secondaryGenres: isPrivateTrack ? [] : bestSecondaryGenres,
            }),
          }).catch(() => {});
        }

        setResolvedGenre({
          ...refined,
          primaryGenre: isPrivateTrack ? '' : bestPrimaryGenre,
          secondaryGenres: isPrivateTrack ? [] : bestSecondaryGenres,
          bpm: (!isLongMixInfo && infoData.bpm && infoData.bpmFromProvider !== false) ? String(infoData.bpm) : '',
          key: (!isLongMixInfo && infoData.key && infoData.keyFromProvider !== false) ? String(infoData.key) : '',
          analyzed: isTrackAnalyzed,
          unverified: isLongMixInfo || (!isPrivateTrack && !bestPrimaryGenre),
          _trackKey: trackKey,
        });

        const nativePatch = {
          trackId: String(currentTrack.id || ''),
          verifiedGenre: isPrivateTrack ? '' : bestPrimaryGenre,
          verifiedSecondaryGenres: isPrivateTrack ? [] : bestSecondaryGenres,
          superGenre: (isLongMixInfo || isPrivateTrack) ? '' : (refined.superGenre || ''),
          analyzed: isTrackAnalyzed,
          isPrivate: isPrivateTrack,
        };
        if (isTrackAnalyzed && !isLongMixInfo) {
          nativePatch.genre = isPrivateTrack ? '' : bestPrimaryGenre;
          nativePatch.secondaryGenres = isPrivateTrack ? [] : bestSecondaryGenres;
        }
        if (!isLongMixInfo && infoData.bpm && infoData.bpmFromProvider !== false) nativePatch.bpm = String(infoData.bpm);
        if (!isLongMixInfo && infoData.key && infoData.keyFromProvider !== false) nativePatch.key = String(infoData.key);
        if (infoData.previewUrl) nativePatch.previewUrl = String(infoData.previewUrl);
        if (!isPrivateTrack && infoData.album && !isInvalidAlbumName(infoData.album)) {
          nativePatch.albumName = cleanTrackOrReleaseTitle(String(infoData.album).replace(/\s*\(single\)\s*$/i, '').trim(), artist);
        }
        const resolvedLabel = isPrivateTrack ? '' : (infoData.label || bcPageData?.label || cleaned.label || '');
        if (!isPrivateTrack && resolvedLabel) {
          nativePatch.label = resolvedLabel;
        }
        if (infoData.year && !(currentTrack.year || currentTrack.releaseYear)) {
          nativePatch.year = String(infoData.year);
        }
        postNative(nativePatch);

        // Preload Album, Artist, and Label sheets with enriched Discogs/MusicBrainz/Bandcamp info
        if (!isPrivateTrack && typeof window.__kyoyuPreloadPlayingEntities === 'function') {
          window.__kyoyuPreloadPlayingEntities(currentTrack, infoData);
        }
      } catch (e) {} finally {
        if (!cancelled) setIsReanalyzing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artistName, currentTrack?.artist, provider, reanalyzeTick, isPrivateTrack, isLongFormTrack]);
  // Signal to CSS that a mini pill player is visible (used by album sheet positioning)
  useEffect(()=>{
    if(currentTrack) document.body.classList.add('has-mini-player');
    else             document.body.classList.remove('has-mini-player');
    return ()=>{ document.body.classList.remove('has-mini-player'); };
  },[currentTrack]);

  // Sync Media Session API (ensures WKWebView pushes the right metadata if it overrides Swift)
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Kyoyu',
        artist: currentTrack.artistName || 'Unknown Artist',
        artwork: [
          { src: currentTrack.releaseCover || '', sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      
      try {
        navigator.mediaSession.setActionHandler('play', () => window.__kyoyuPlayerCmd?.('play'));
        navigator.mediaSession.setActionHandler('pause', () => window.__kyoyuPlayerCmd?.('pause'));
        navigator.mediaSession.setActionHandler('previoustrack', () => window.__kyoyuPlayerCmd?.('prev'));
        navigator.mediaSession.setActionHandler('nexttrack', () => window.__kyoyuPlayerCmd?.('next'));
      } catch (e) {}
    }
  }, [currentTrack]);

  // Which service the audio REALLY comes from — shown as a badge on the artwork in the native sheet
  useEffect(() => {
    if (!isNative() || !currentTrack) return;
    postNative({ sourceProvider: badgeProviderOf(provider, currentTrack) });
  }, [currentTrack?.id, provider, currentTrack?.src, currentTrack?.origin?.provider]);

  const ytHiddenRef = useRef(null);
  const scHiddenRef = useRef(null);
  const silentSessionLockRef = useRef(null);

  // Play silent audio ONLY when using the YouTube iframe in WKWebView.
  // When provider === 'native' (AVPlayer) or isStreamingProvider (Spotify / Apple Music), native audio owns the session!
  useEffect(() => {
    if (isNative() && silentSessionLockRef.current) {
      if (isPlaying && provider === 'youtube') {
        silentSessionLockRef.current?.play()?.catch(() => {});
      } else {
        if (isStreamingProvider(provider) || provider === 'native') {
          try { if (window.__kyoyuTrack) window.__kyoyuTrack.playing = false; } catch (e) {}
        }
        silentSessionLockRef.current?.pause();
      }
    }
  }, [isPlaying, provider]);
  // Push progress + duration to Swift on every update (replaces old polling approach)
  useEffect(() => {
    if (isNative() && currentTrack && provider !== 'native') {
      postNative({ progress, dur: duration });
    }
  }, [progress, duration, provider]);
  // AVPlayer (provider 'native') owns its own clock in Swift — echoing progress back caused the scrubber to flicker.
  // We still tell Swift the known duration (instant UI before AVPlayer reports it) and a restored session's position.
  useEffect(() => {
    if (!(isNative() && currentTrack && provider === 'native')) return;
    postNative(restoredPending ? { progress, dur: duration } : { dur: duration });
  }, [duration, provider, currentTrack?.id, restoredPending]);

  // Apple Music / Spotify → web: progress, play state (e.g. paused from Control Center), track end, artwork, or Lock Screen track change
  const streamingRef = useRef({});
  useEffect(() => { streamingRef.current = { provider, isPlaying, handleNext, itemId: providerItemId, currentTrack }; });
  useEffect(() => onStreamingEvent((evt) => {
    const cur = streamingRef.current;
    if (!isStreamingProvider(cur.provider) || evt.service !== cur.provider) return;
    if (evt.type === 'trackChange' || evt.type === 'metadata') {
      const newItemId = String(evt.itemId || cur.itemId || '').replace(/^(am|sp|td)-/, '');
      const isEvtPrivate = Boolean(
        evt.isPrivate ||
        (evt.service === 'applemusic' && newItemId.startsWith('i.'))
      );
      const patch = {};
      if (evt.title) patch.title = evt.title;
      if (evt.artist) { patch.artistName = evt.artist; patch.artist = evt.artist; }
      if (isEvtPrivate) {
        patch.isPrivate = true;
        patch.releaseTitle = '';
        patch.albumName = '';
      } else if (evt.album) {
        patch.releaseTitle = evt.album;
        patch.albumName = evt.album;
      }
      if (evt.artworkUrl) { patch.releaseCover = evt.artworkUrl; patch.artworkUrl = evt.artworkUrl; patch.cover = evt.artworkUrl; }
      if (evt.duration > 0) patch.duration = evt.duration;
      if (evt.bpm) patch.bpm = String(evt.bpm);
      if (evt.key) patch.key = String(evt.key);
      if (newItemId) {
        patch.providerItemId = newItemId;
        if (evt.service === 'spotify') { patch.spotifyId = newItemId; patch.id = `spotify-${newItemId}`; }
        if (evt.service === 'applemusic') { patch.appleMusicId = newItemId; patch.id = `applemusic-${newItemId}`; }
      }
      dispatch({ type: 'UPDATE_CURRENT_TRACK', patch, itemId: newItemId || undefined, duration: evt.duration || undefined });
      return;
    }
    // Events of a previous song (still in flight while the next one loads) must never drive the current one
    if (evt.itemId && cur.itemId && String(evt.itemId) !== String(cur.itemId)) return;
    if (evt.type === 'progress') {
      if (typeof evt.position === 'number') dispatch({ type: 'SET_PROGRESS', value: evt.position });
      if (evt.duration > 0) dispatch({ type: 'SET_DURATION', value: evt.duration });
    } else if (evt.type === 'state') {
      if (evt.playing !== cur.isPlaying) dispatch({ type: 'SET_PLAYING', value: !!evt.playing });
    } else if (evt.type === 'artwork' && evt.artworkUrl) {
      const curId = String(cur.currentTrack?.id || '');
      const curItem = String(cur.itemId || cur.currentTrack?.trackId || '');
      if (evt.service === 'applemusic' && (curId.startsWith('am-i.') || curItem.startsWith('i.'))) {
        return;
      }
      dispatch({
        type: 'UPDATE_CURRENT_TRACK',
        patch: { releaseCover: evt.artworkUrl, artworkUrl: evt.artworkUrl, cover: evt.artworkUrl },
      });
      postNative({ trackId: curId, artwork: evt.artworkUrl });
    } else if (evt.type === 'ended') {
      cur.handleNext();
    } else if (evt.type === 'failed') {
      dispatch({ type: 'SET_PLAYING', value: false });
      const label = evt.service === 'spotify' ? 'Spotify' : evt.service === 'tidal' ? 'TIDAL' : 'Apple Music';
      postNative({ alertTitle: `${label} did not start playing`, alert: `${evt.reason || 'No response from the player.'}\n\nOpen the ${label} app once, make sure you are logged in with Premium, then try again.` });
    }
  }), [dispatch]);

  // Switching away from Apple Music / Spotify (another source, or stop) → stop that engine
  const prevProviderRef = useRef(provider);
  useEffect(() => {
    const prev = prevProviderRef.current;
    prevProviderRef.current = provider;
    if (isStreamingProvider(prev) && prev !== provider) {
      callStreaming('stop', { service: prev }).catch(() => {});
    }
  }, [provider]);

  // Handle _restart for external providers (PREV_TRACK → seek to 0)
  useEffect(() => {
    if (!currentTrack?._restart) return;
    if (isStreamingProvider(provider)) {
      callStreaming('seek', { service: provider, position: 0 }).catch(() => {});
    } else if (provider === 'youtube') {
      ytHiddenRef.current?.seekTo?.(0);
    } else if (provider === 'soundcloud') {
      scHiddenRef.current?.seekTo?.(0);
    }
  }, [currentTrack?._restart, provider]);

  if(!currentTrack) return null;

  // On native iOS with YouTube, render a hidden YouTube player for audio only
  // The native sheet player handles the UI
  const isNativeYT = isNative() && provider === 'youtube' && providerItemId;
  const isNativeSC = isNative() && provider === 'soundcloud' && providerItemId;

  return (
    <>
      {/* Silent HTML5 audio to force WKWebView to bind MediaSession to the top window */}
      {isNative() && (
        <audio 
          ref={silentSessionLockRef} 
          loop 
          src="data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAWVhpbmcAAAABAAAAAQAAACcAAQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ//OEAA/wAAAAAAAABnUAAAgAAA0gAAAEAAAABAAAABAAAAAQAAAAEAAAA=" 
        />
      )}
      {/* Mini bar — only when not suppressed by BottomDock and not in native iOS */}
      {!hideMini && !exp && !isNative() && (
        <MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={expand} dispatch={dispatch} onNext={handleNext}/>
      )}
      {/* Hidden YouTube player for native iOS — provides audio while native sheet handles UI. */}
      {isNativeYT && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100vw', height: '100vh', opacity: 1, zIndex: -9999, pointerEvents: 'none' }}>
          <YouTubePlayer
            ref={ytHiddenRef}
            videoId={providerItemId}
            isPlaying={isPlaying}
            volume={volume}
            audioOnly={true}
            onStateChange={({ progress: ytProg, duration: ytDur }) => {
              dispatch({ type: 'SET_PROGRESS', value: ytProg });
              if (ytDur > 0) dispatch({ type: 'SET_DURATION', value: ytDur });
            }}
            onEnded={() => handleNext()}
            onError={() => recoverYouTubeFailure()}
          />
        </div>
      )}
      {/* Hidden SoundCloud player for native iOS — provides audio while native sheet handles UI. */}
      {isNativeSC && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100vw', height: '100vh', opacity: 1, zIndex: -9999, pointerEvents: 'none' }}>
          <SoundCloudPlayer
            ref={scHiddenRef}
            trackUrl={providerItemId}
            isPlaying={isPlaying}
            volume={volume}
            audioOnly={false}
            onStateChange={({ progress: scProg, duration: scDur }) => {
              dispatch({ type: 'SET_PROGRESS', value: scProg });
              if (scDur > 0) dispatch({ type: 'SET_DURATION', value: scDur });
            }}
            onEnded={() => handleNext()}
          />
        </div>
      )}
      {/* Web FullPlayer — skip on native iOS since native sheet handles UI */}
      {!isNative() && (
        <>
          <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration}
            open={exp} onCollapse={collapse} dispatch={dispatch} seekTo={seekTo}
            provider={provider} providerItemId={providerItemId} volume={volume}
            onNext={handleNext} onPrev={handlePrev} genreInfo={activeGenreInfo}
            isReanalyzing={isReanalyzing} onReanalyze={handleReanalyzeCurrentTrack}
            showBpmFader={showBpmFader} setShowBpmFader={setShowBpmFader}
            baseBpm={baseBpm} activeBpm={activeBpm}
            onChangeBpmSpeed={handleChangeBpmSpeed} onResetBpmSpeed={handleResetBpmSpeed}/>
          <WebGenreSheetModal />
        </>
      )}
    </>
  );
}
