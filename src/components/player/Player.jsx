import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play, Pause, Rewind, FastForward, Music2,
         Star, MoreHorizontal, Airplay, AlignJustify, MessageSquare } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor((s||0)/60), sec = Math.floor((s||0)%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

/* ── Bottom mini bar — fused with tab bar ── */
function MiniBar({ track, isPlaying, onExpand, dispatch }) {
  const ref = useRef(null);
  const startY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTS = e => { startY.current = e.touches[0].clientY; };
    const onTE = e => { if (startY.current - e.changedTouches[0].clientY > 30) onExpand(); };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchend',   onTE, { passive: true });
    return () => { el.removeEventListener('touchstart',onTS); el.removeEventListener('touchend',onTE); };
  }, [onExpand]);

  return (
    <div ref={ref} className="mini-bar" onClick={onExpand}>
      {track.releaseCover
        ? <img src={track.releaseCover} className="mini-art" alt=""/>
        : <div className="mini-art mini-art-ph"><Music2 size={18}/></div>
      }
      <div className="mini-info">
        <div className="mini-title">{track.title}</div>
        <div className="mini-artist">{track.artistName}</div>
      </div>
      <div className="mini-ctrls" onClick={e=>e.stopPropagation()}>
        <button className="mini-btn" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying ? <Pause size={22} fill="currentColor" strokeWidth={0}/>
                     : <Play  size={22} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>}
        </button>
        <button className="mini-btn" onClick={()=>dispatch({type:'NEXT_TRACK'})}>
          <FastForward size={22} fill="currentColor" strokeWidth={0}/>
        </button>
      </div>
    </div>
  );
}

/* ── Full screen player — screenshot 2 layout ── */
function FullPlayer({ track, isPlaying, progress, duration, open, onCollapse, dispatch }) {
  const fpRef    = useRef(null);
  const handleRef = useRef(null);
  const startY   = useRef(0);

  // Attach via DOM so WKWebView scroll can't intercept
  useEffect(() => {
    const el   = fpRef.current;
    const hdl  = handleRef.current;
    if (!el || !hdl) return;

    const onTS = e => { startY.current = e.touches[0].clientY; };
    const onTE = e => { if (e.changedTouches[0].clientY - startY.current > 50) onCollapse(); };

    // Whole-card swipe-down
    el.addEventListener('touchstart', onTS,  { passive: true });
    el.addEventListener('touchend',   onTE,  { passive: true });
    // Handle tap also collapses
    hdl.addEventListener('click', onCollapse);

    return () => {
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchend',   onTE);
      hdl.removeEventListener('click', onCollapse);
    };
  }, [onCollapse]);

  const pct = duration ? (progress/duration)*100 : 0;
  const rem = Math.max(0, duration - progress);

  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type:'SET_PROGRESS', value: Math.floor(((e.clientX-r.left)/r.width)*duration) });
  }

  return (
    <div ref={fpRef} className={`fp${open?' fp--open':''}`}>

      {/* ① Pull handle — tap or swipe down to close */}
      <div ref={handleRef} className="fp-handle-row">
        <div className="fp-handle"/>
      </div>

      {/* ② Large artwork */}
      <div className="fp-art-wrap">
        {track.releaseCover
          ? <img src={track.releaseCover} className="fp-art" alt=""/>
          : <div className="fp-art fp-art-ph"><Music2 size={80}/></div>
        }
      </div>

      {/* ③ Title + actions */}
      <div className="fp-meta">
        <div className="fp-meta-text">
          <div className="fp-title">{track.title}</div>
          <div className="fp-artist">{track.artistName || '—'}</div>
        </div>
        <div className="fp-meta-btns">
          <button className="fp-icon-btn"><Star size={22}/></button>
          <button className="fp-icon-btn"><MoreHorizontal size={22}/></button>
        </div>
      </div>

      {/* ④ Scrubber */}
      <div className="fp-scrub-wrap">
        <div className="fp-scrub" onClick={seek}>
          <div className="fp-scrub-fill" style={{width:`${pct}%`}}/>
          <div className="fp-scrub-thumb" style={{left:`${pct}%`}}/>
        </div>
        <div className="fp-times">
          <span>{fmt(progress)}</span>
          <span>-{fmt(rem)}</span>
        </div>
      </div>

      {/* ⑤ Controls */}
      <div className="fp-ctrls">
        <button className="fp-ctrl" onClick={()=>dispatch({type:'PREV_TRACK'})}>
          <Rewind size={38} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="fp-ctrl fp-ctrl--play" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying ? <Pause size={52} fill="currentColor" strokeWidth={0}/>
                     : <Play  size={52} fill="currentColor" strokeWidth={0} style={{marginLeft:4}}/>}
        </button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'NEXT_TRACK'})}>
          <FastForward size={38} fill="currentColor" strokeWidth={0}/>
        </button>
      </div>

      {/* ⑥ Volume */}
      <div className="fp-vol">
        <span className="fp-vol-icon">🔈</span>
        <input type="range" className="fp-vol-slider" min="0" max="100" defaultValue="80"/>
        <span className="fp-vol-icon">🔊</span>
      </div>

      {/* ⑦ Bottom icons */}
      <div className="fp-actions">
        <button className="fp-icon-btn"><MessageSquare size={22}/></button>
        <button className="fp-icon-btn"><Airplay size={22}/></button>
        <button className="fp-icon-btn"><AlignJustify size={22}/></button>
      </div>
    </div>
  );
}

export default function Player() {
  const { state, dispatch } = usePlayer();
  const [exp, setExp] = useState(false);
  const { currentTrack, isPlaying, progress, duration } = state;
  const expand   = useCallback(() => setExp(true),  []);
  const collapse = useCallback(() => setExp(false), []);
  useEffect(() => { if (currentTrack) setExp(false); }, [currentTrack?.id]);
  if (!currentTrack) return null;
  return (
    <>
      {!exp && <MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={expand} dispatch={dispatch}/>}
      <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration}
                  open={exp} onCollapse={collapse} dispatch={dispatch}/>
    </>
  );
}
