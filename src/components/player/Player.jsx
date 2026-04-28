import { useState, useRef, useEffect, useCallback } from 'react';
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

/* ── Web fallback mini bar ── */
function MiniBar({ track, isPlaying, onExpand, dispatch }) {
  const ref = useRef(null); const startY = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const s = e => { startY.current = e.touches[0].clientY; };
    const e2 = e => { if (startY.current - e.changedTouches[0].clientY > 30) onExpand(); };
    el.addEventListener('touchstart', s, { passive:true }); el.addEventListener('touchend', e2, { passive:true });
    return () => { el.removeEventListener('touchstart',s); el.removeEventListener('touchend',e2); };
  }, [onExpand]);
  return (
    <div ref={ref} className="mini-bar" onClick={onExpand}>
      {track.releaseCover ? <img src={track.releaseCover} className="mini-art" alt=""/> : <div className="mini-art mini-art-ph"><Music2 size={18}/></div>}
      <div className="mini-info"><div className="mini-title">{track.title}</div><div className="mini-artist">{track.artistName}</div></div>
      <div className="mini-ctrls" onClick={e=>e.stopPropagation()}>
        <button className="mini-btn" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>{isPlaying?<Pause size={22} fill="currentColor" strokeWidth={0}/>:<Play size={22} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>}</button>
        <button className="mini-btn" onClick={()=>dispatch({type:'NEXT_TRACK'})}><FastForward size={22} fill="currentColor" strokeWidth={0}/></button>
      </div>
    </div>
  );
}

/* ── Full screen player ── */
function FullPlayer({ track, isPlaying, progress, duration, open, onCollapse, dispatch }) {
  const fpRef = useRef(null); const handleRef = useRef(null); const startY = useRef(0);
  const volRef = useRef(null);
  const [showQueue, setShowQueue] = useState(false);
  const [vol, setVol] = useState(80);

  function handleVol(e) {
    const r = volRef.current.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - r.left;
    setVol(Math.max(0, Math.min(100, Math.round((x / r.width) * 100))));
  }

  useEffect(() => {
    const el = fpRef.current; const hdl = handleRef.current;
    if (!el || !hdl) return;
    const onTS = e => { startY.current = e.touches[0].clientY; };
    const onTE = e => { if (e.changedTouches[0].clientY - startY.current > 60) onCollapse(); };
    el.addEventListener('touchstart', onTS, { passive:true });
    el.addEventListener('touchend',   onTE, { passive:true });
    hdl.addEventListener('click', onCollapse);
    return () => { el.removeEventListener('touchstart',onTS); el.removeEventListener('touchend',onTE); hdl.removeEventListener('click',onCollapse); };
  }, [onCollapse]);

  const pct = duration ? (progress/duration)*100 : 0;
  const rem = Math.max(0, duration - progress);
  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type:'SET_PROGRESS', value: Math.floor(((e.clientX-r.left)/r.width)*duration) });
  }

  const Artwork = ({ big }) => track.releaseCover
    ? <img src={track.releaseCover} className={big?'fp-art':'fp-q-art'} alt=""/>
    : <div className={big?'fp-art fp-art-ph':'fp-q-art fp-art-ph'}><Music2 size={big?72:24}/></div>;

  const Bottom = () => (
    <>
      <div className="fp-scrub-wrap">
        <div className="fp-scrub" onClick={seek}><div className="fp-scrub-fill" style={{width:`${pct}%`}}/></div>
        <div className="fp-times"><span>{fmt(progress)}</span><span>-{fmt(rem)}</span></div>
      </div>
      <div className="fp-ctrls">
        <button className="fp-ctrl" onClick={()=>dispatch({type:'PREV_TRACK'})}><Rewind size={36} fill="currentColor" strokeWidth={0}/></button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying?<Pause size={48} fill="currentColor" strokeWidth={0}/>:<Play size={48} fill="currentColor" strokeWidth={0} style={{marginLeft:3}}/>}
        </button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'NEXT_TRACK'})}><FastForward size={36} fill="currentColor" strokeWidth={0}/></button>
      </div>
      <div className="fp-vol">
        <Volume size={15} className="fp-vol-icon"/>
        <div ref={volRef} className="fp-vol-bar" onClick={handleVol} onTouchStart={handleVol}>
          <div className="fp-vol-fill" style={{width:`${vol}%`}}/>
        </div>
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

  return (
    <div ref={fpRef} className={`fp${open?' fp--open':''}`}>
      <div ref={handleRef} className="fp-handle-row"><div className="fp-handle"/></div>

      {showQueue ? (
        <>
          <div className="fp-q-header">
            <Artwork big={false}/>
            <div className="fp-q-info"><div className="fp-title">{track.title}</div></div>
            <div className="fp-meta-btns">
              <button className="fp-icon-btn"><Star size={18}/></button>
              <button className="fp-icon-btn"><MoreHorizontal size={18}/></button>
            </div>
          </div>
          <div className="fp-q-modes">
            <button className="fp-mode-btn"><Shuffle size={17}/></button>
            <button className="fp-mode-btn"><Repeat size={17}/></button>
            <button className="fp-mode-btn fp-mode-btn--on"><Infinity size={17}/></button>
            <button className="fp-mode-btn"><X size={17}/></button>
          </div>
          <div className="fp-q-empty"><p>There's no music in the queue.</p></div>
          <Bottom/>
        </>
      ) : (
        <>
          <div className="fp-top">
            <div className="fp-art-wrap"><Artwork big={true}/></div>
          </div>
          <div className="fp-meta">
            <div className="fp-meta-text">
              <div className="fp-title">{track.title}</div>
              <div className="fp-artist">{track.artistName||'—'}</div>
            </div>
            <div className="fp-meta-btns">
              <button className="fp-icon-btn"><Star size={20}/></button>
              <button className="fp-icon-btn"><MoreHorizontal size={20}/></button>
            </div>
          </div>
          <Bottom/>
        </>
      )}
    </div>
  );
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const [exp, setExp] = useState(false);
  const { currentTrack, isPlaying, progress, duration } = state;
  const expand   = useCallback(() => { setExp(true);  postNative({ expanded: true  }); }, []);
  const collapse = useCallback(() => { setExp(false); postNative({ expanded: false }); }, []);
  useEffect(() => {
    window.__kyoyuPlayerCmd = (cmd) => {
      if (cmd==='toggle') dispatch({type:'TOGGLE_PLAY'});
      if (cmd==='next')   dispatch({type:'NEXT_TRACK'});
      if (cmd==='prev')   dispatch({type:'PREV_TRACK'});
      if (cmd==='expand') { setExp(true);  postNative({ expanded: true  }); }
    };
    return () => { delete window.__kyoyuPlayerCmd; };
  }, [dispatch]);
  useEffect(() => {
    if (currentTrack) postNative({ visible:true, playing:isPlaying, title:currentTrack.title||'', artwork:currentTrack.releaseCover||'' });
    else postNative({ visible:false, playing:false, title:'', artwork:'' });
  }, [currentTrack, isPlaying]);
  if (!currentTrack) return null;
  return (
    <>
      {!exp && !isNative() && <MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={expand} dispatch={dispatch}/>}
      <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration} open={exp} onCollapse={collapse} dispatch={dispatch}/>
    </>
  );
}
