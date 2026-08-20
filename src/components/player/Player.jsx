import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import YouTubePlayer from './YouTubePlayer';
import { Play, Pause, Rewind, FastForward, Music2, Star, MoreHorizontal,
         Airplay, AlignJustify, MessageSquare, Shuffle, Repeat, Infinity, X } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor((s||0)/60), sec = Math.floor((s||0)%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function postNative(p) { try { window.webkit.messageHandlers.player.postMessage(p); } catch(e){} }
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
const Scrubber = memo(function Scrubber({ progress, duration, onSeek }) {
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
  progress, duration, isPlaying, dispatch, onSeek, showQueue, setShowQueue
}) {
  const rem = Math.max(0, (duration||0) - (progress||0));
  return (
    <>
      <div className="fp-scrub-wrap">
        <Scrubber progress={progress} duration={duration} onSeek={onSeek}/>
        <div className="fp-times"><span>{fmt(progress)}</span><span>-{fmt(rem)}</span></div>
      </div>
      <div className="fp-ctrls">
        <button className="fp-ctrl" onClick={()=>dispatch({type:'PREV_TRACK'})}><Rewind size={36} fill="currentColor" strokeWidth={0}/></button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying ? <Pause size={48} fill="currentColor" strokeWidth={0}/> : <Play size={48} fill="currentColor" strokeWidth={0} style={{marginLeft:3}}/>}
        </button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'NEXT_TRACK'})}><FastForward size={36} fill="currentColor" strokeWidth={0}/></button>
      </div>
      <div className="fp-actions">
        <button className="fp-action-btn"><MessageSquare size={22}/></button>
        <button className="fp-action-btn"><Airplay size={22}/></button>
        <button className={`fp-action-btn${showQueue?' fp-action-btn--on':''}`} onClick={()=>setShowQueue(q=>!q)}>
          <AlignJustify size={22}/>
        </button>
      </div>
    </>
  );
});

/* ── Mini bar ── */
function MiniBar({ track, isPlaying, onExpand, dispatch }) {
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
        <button className="mini-btn" onClick={()=>dispatch({type:'NEXT_TRACK'})}><FastForward size={22} fill="currentColor" strokeWidth={0}/></button>
      </div>
    </div>
  );
}

/* ── Full screen player ── */
function FullPlayer({ track, isPlaying, progress, duration, open, onCollapse, dispatch, seekTo, provider, providerItemId, volume }) {
  const ytRef = useRef(null);
  const fpRef    = useRef(null);
  const handleRef= useRef(null);
  const startY   = useRef(0);
  const [showQueue, setShowQueue] = useState(false);
  const [accent,    setAccent]    = useState(() => _fpColorCache.get(track?.releaseCover) ?? null);

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

  const controls = <PlayerControls progress={progress} duration={duration}
    isPlaying={isPlaying} dispatch={dispatch} onSeek={seekTo}
    showQueue={showQueue} setShowQueue={setShowQueue}/>;

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
                    onEnded={() => dispatch({ type: 'NEXT_TRACK' })}
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
              <div className="fp-artist">{track.artistName||'—'}</div>
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

import { useLibrary } from '../../contexts/LibraryContext';

/* ── Root ── */
export default function Player({ hideMini = false }) {
  const { state, dispatch, seekTo } = usePlayer();
  const { toggleLikeUpload, isLikedUpload, toggleLike, isLiked, likedUploads, likedTracks } = useLibrary();
  const [exp, setExp] = useState(false);
  const { currentTrack, isPlaying, progress, duration, provider, providerItemId, volume } = state;
  const expand   = useCallback(()=>{ setExp(true);  postNative({expanded:true});  },[]);
  const collapse = useCallback(()=>{ setExp(false); postNative({expanded:false}); },[]);
  useEffect(()=>{
    window.__kyoyuPlayerCmd = (cmd, val)=>{
      if(cmd==='toggle') dispatch({type:'TOGGLE_PLAY'});
      if(cmd==='next')   dispatch({type:'NEXT_TRACK'});
      if(cmd==='prev')   dispatch({type:'PREV_TRACK'});
      if(cmd==='stop')   dispatch({type:'STOP'});
      if(cmd==='expand'){
        // On native iOS, only forward to Swift — don't open web FullPlayer
        if (isNative()) {
          postNative({expanded:true});
        } else {
          setExp(true); postNative({expanded:true});
        }
      }
      if(cmd==='seekTo' && typeof val === 'number') seekTo(val);
    };
    
    // Listen for global native like event
    const handleNativeLike = (e) => {
      if (e.detail.handled) return;
      const trackId = String(e.detail.trackId).split('?ts=')[0];
      if (currentTrack && String(currentTrack.id) === trackId) {
        e.detail.handled = true;
        const trackObj = {
          ...currentTrack,
          cover: currentTrack.releaseCover || currentTrack.artworkUrl || ''
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
  },[dispatch, seekTo, currentTrack, toggleLikeUpload]);
  useEffect(() => {
    if (currentTrack) {
      postNative({
        visible: true,
        playing: isPlaying,
        title: currentTrack.title || '',
        artwork: currentTrack.releaseCover || currentTrack.artworkUrl || currentTrack.cover || '',
        trackId: String(currentTrack.id || '') + '?ts=' + Date.now(),
        albumId: String(currentTrack.releaseId || currentTrack.album || ''),
        artist: currentTrack.artistName || currentTrack.artist || ''
      });
    } else {
      postNative({ visible: false, playing: false });
    }
  }, [currentTrack, isPlaying, likedUploads, likedTracks]);
  // Signal to CSS that a mini pill player is visible (used by album sheet positioning)
  useEffect(()=>{
    if(currentTrack) document.body.classList.add('has-mini-player');
    else             document.body.classList.remove('has-mini-player');
    return ()=>{ document.body.classList.remove('has-mini-player'); };
  },[currentTrack]);
  const ytHiddenRef = useRef(null);
  // Expose YouTube progress to Swift's NativePlayerView
  useEffect(() => {
    if (isNative() && provider === 'youtube') {
      window.__kyoyuYTProgress = () => JSON.stringify({ progress, duration });
    } else {
      delete window.__kyoyuYTProgress;
    }
    return () => { delete window.__kyoyuYTProgress; };
  }, [provider, progress, duration]);

  if(!currentTrack) return null;

  // On native iOS with YouTube, render a hidden YouTube player for audio only
  // The native sheet player handles the UI
  const isNativeYT = isNative() && provider === 'youtube' && providerItemId;

  return (
    <>
      {/* Mini bar — only when not suppressed by BottomDock and not in native iOS */}
      {!hideMini && !exp && !isNative() && (
        <MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={expand} dispatch={dispatch}/>
      )}
      {/* Hidden YouTube player for native iOS — provides audio while native sheet handles UI.
           transform: scale(0.001) shrinks the hardware video layer to near-zero so it can't
           bleed through the native SwiftUI glass overlay. */}
      {isNativeYT && (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: 2, height: 2, transform: 'scale(0.001)', transformOrigin: 'bottom right', clipPath: 'inset(100%)', overflow: 'hidden', pointerEvents: 'none' }}>
          <YouTubePlayer
            ref={ytHiddenRef}
            videoId={providerItemId}
            isPlaying={isPlaying}
            volume={volume}
            onStateChange={({ progress: ytProg, duration: ytDur }) => {
              dispatch({ type: 'SET_PROGRESS', value: ytProg });
              if (ytDur > 0) dispatch({ type: 'SET_DURATION', value: ytDur });
            }}
            onEnded={() => dispatch({ type: 'NEXT_TRACK' })}
          />
        </div>
      )}
      {/* Web FullPlayer — skip on native iOS since native sheet handles UI */}
      {!isNative() && (
        <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration}
          open={exp} onCollapse={collapse} dispatch={dispatch} seekTo={seekTo}
          provider={provider} providerItemId={providerItemId} volume={volume}/>
      )}
    </>
  );
}
