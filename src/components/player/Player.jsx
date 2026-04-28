import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play, Pause, Rewind, FastForward, Music2, Star, MoreHorizontal,
         Airplay, AlignJustify, MessageSquare, Shuffle, Repeat, Infinity, X,
         Volume, Volume2 } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor((s||0)/60), sec = Math.floor((s||0)%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function postNative(p) { try { window.webkit.messageHandlers.player.postMessage(p); } catch(e){} }
const isNative = () => { try { return !!window.webkit?.messageHandlers?.player; } catch(e){ return false; } };

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
      document.removeEventListener('touchmove', tMove);
      const p = pct(e.changedTouches[0].clientX); set(p); endRef.current(p);
    }
    function tStart(e) {
      e.stopPropagation();   // block fp swipe-collapse
      const p = pct(e.touches[0].clientX); set(p); moveRef.current(p);
      document.addEventListener('touchmove', tMove, { passive: false });
      document.addEventListener('touchend',  tEnd,  { once: true, passive: true });
    }

    /* mouse (desktop / simulator) */
    function mMove(e) { const p = pct(e.clientX); set(p); moveRef.current(p); }
    function mUp(e)   {
      document.removeEventListener('mousemove', mMove);
      const p = pct(e.clientX); set(p); endRef.current(p);
    }
    function mDown(e) {
      e.stopPropagation();
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

/* ── Volume slider ── */
const VolSlider = memo(function VolSlider({ volume, onSet }) {
  const hitRef   = useRef(null);
  const fillRef  = useRef(null);
  const thumbRef = useRef(null);
  const setRef   = useRef(onSet);
  useEffect(() => { setRef.current = onSet; }, [onSet]);

  useScrub(
    hitRef, fillRef, thumbRef,
    pct => setRef.current(pct),
    pct => setRef.current(pct)
  );

  useEffect(() => {
    const p = (volume ?? 0.8) * 100;
    if (fillRef.current)  fillRef.current.style.width = `${p}%`;
    if (thumbRef.current) thumbRef.current.style.left  = `${p}%`;
  }, [volume]);

  const p = (volume ?? 0.8) * 100;
  return (
    <div className="fp-vol-bar">
      <div ref={fillRef}  className="fp-vol-fill"                   style={{ width:`${p}%` }}/>
      <div ref={thumbRef} className="fp-scrub-thumb fp-scrub-thumb--sm" style={{ left:`${p}%`  }}/>
      <div ref={hitRef}   className="fp-scrub-hit"/>
    </div>
  );
});

/* ── Transport + scrubbers — TOP-LEVEL so React never unmounts them ──
   (defining this inside FullPlayer would recreate the function reference
    on every progress tick, causing React to unmount/remount Scrubber
    and tear down its event listeners each second)                    ── */
const PlayerControls = memo(function PlayerControls({
  progress, duration, volume, isPlaying, dispatch, onSeek, onSetVol, showQueue, setShowQueue
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
      <div className="fp-vol">
        <Volume size={15} className="fp-vol-icon"/>
        <VolSlider volume={volume} onSet={onSetVol}/>
        <Volume2 size={15} className="fp-vol-icon"/>
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
function FullPlayer({ track, isPlaying, progress, duration, volume, open, onCollapse, dispatch, seekTo, setVolume }) {
  const fpRef    = useRef(null);
  const handleRef= useRef(null);
  const startY   = useRef(0);
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    const el=fpRef.current; const hdl=handleRef.current; if(!el||!hdl) return;
    const onTS=e=>{ startY.current=e.touches[0].clientY; };
    const onTE=e=>{ if(e.changedTouches[0].clientY-startY.current>60) onCollapse(); };
    el.addEventListener('touchstart',onTS,{passive:true}); el.addEventListener('touchend',onTE,{passive:true});
    hdl.addEventListener('click',onCollapse);
    return ()=>{ el.removeEventListener('touchstart',onTS); el.removeEventListener('touchend',onTE); hdl.removeEventListener('click',onCollapse); };
  },[onCollapse]);

  const Artwork = ({big}) => track.releaseCover
    ? <img src={track.releaseCover} className={big?'fp-art':'fp-q-art'} alt=""/>
    : <div className={big?'fp-art fp-art-ph':'fp-q-art fp-art-ph'}><Music2 size={big?72:24}/></div>;

  const controls = <PlayerControls progress={progress} duration={duration} volume={volume}
    isPlaying={isPlaying} dispatch={dispatch} onSeek={seekTo} onSetVol={setVolume}
    showQueue={showQueue} setShowQueue={setShowQueue}/>;

  return (
    <div ref={fpRef} className={`fp${open?' fp--open':''}`}>
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
          <div className="fp-top"><div className="fp-art-wrap"><Artwork big={true}/></div></div>
          <div className="fp-meta">
            <div className="fp-meta-text"><div className="fp-title">{track.title}</div><div className="fp-artist">{track.artistName||'—'}</div></div>
            <div className="fp-meta-btns"><button className="fp-icon-btn"><Star size={20}/></button><button className="fp-icon-btn"><MoreHorizontal size={20}/></button></div>
          </div>
          {controls}
        </>
      )}
    </div>
  );
}

/* ── Root ── */
export default function Player() {
  const { state, dispatch, seekTo, setVolume } = usePlayer();
  const [exp, setExp] = useState(false);
  const { currentTrack, isPlaying, progress, duration, volume } = state;
  const expand   = useCallback(()=>{ setExp(true);  postNative({expanded:true});  },[]);
  const collapse = useCallback(()=>{ setExp(false); postNative({expanded:false}); },[]);
  useEffect(()=>{
    window.__kyoyuPlayerCmd = cmd=>{
      if(cmd==='toggle') dispatch({type:'TOGGLE_PLAY'});
      if(cmd==='next')   dispatch({type:'NEXT_TRACK'});
      if(cmd==='prev')   dispatch({type:'PREV_TRACK'});
      if(cmd==='expand'){ setExp(true); postNative({expanded:true}); }
    };
    return ()=>{ delete window.__kyoyuPlayerCmd; };
  },[dispatch]);
  useEffect(()=>{
    if(currentTrack) postNative({visible:true,playing:isPlaying,title:currentTrack.title||'',artwork:currentTrack.releaseCover||''});
    else             postNative({visible:false,playing:false,title:'',artwork:''});
  },[currentTrack,isPlaying]);
  if(!currentTrack) return null;
  return (
    <>
      {!exp&&!isNative()&&<MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={expand} dispatch={dispatch}/>}
      <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration}
        volume={volume} open={exp} onCollapse={collapse} dispatch={dispatch} seekTo={seekTo} setVolume={setVolume}/>
    </>
  );
}
