import { useState, useRef, useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play, Pause, Rewind, FastForward, Music2,
         Star, MoreHorizontal, Airplay, AlignJustify, MessageSquare } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor((s||0)/60), sec = Math.floor((s||0)%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

/* ── Bottom mini bar ── */
function MiniBar({ track, isPlaying, onExpand, dispatch }) {
  const startY = useRef(0);
  function onTS(e) { startY.current = e.touches[0].clientY; }
  function onTE(e) { if (startY.current - e.changedTouches[0].clientY > 40) onExpand(); }

  return (
    <div className="mini-bar" onClick={onExpand} onTouchStart={onTS} onTouchEnd={onTE}>
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

/* ── Full screen player ── */
function FullPlayer({ track, isPlaying, progress, duration, open, onCollapse, dispatch }) {
  const startY = useRef(0);
  const pct = duration ? (progress/duration)*100 : 0;
  const rem = Math.max(0, duration - progress);

  function onTS(e) { startY.current = e.touches[0].clientY; }
  function onTE(e) { if (e.changedTouches[0].clientY - startY.current > 60) onCollapse(); }
  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type:'SET_PROGRESS', value: Math.floor(((e.clientX-r.left)/r.width)*duration) });
  }

  return (
    <div className={`fp${open?' fp--open':''}`} onTouchStart={onTS} onTouchEnd={onTE}
         style={track.releaseCover ? {'--fp-art': `url(${track.releaseCover})`} : {}}>
      {/* blurred art bg */}
      <div className="fp-bg"/>

      {/* handle */}
      <div className="fp-handle-row"><div className="fp-handle"/></div>

      {/* artwork */}
      <div className="fp-art-wrap">
        {track.releaseCover
          ? <img src={track.releaseCover} className="fp-art" alt=""/>
          : <div className="fp-art fp-art-ph"><Music2 size={72}/></div>
        }
      </div>

      {/* title row */}
      <div className="fp-meta">
        <div className="fp-meta-text">
          <div className="fp-title">{track.title}</div>
          <div className="fp-artist">{track.artistName}</div>
        </div>
        <div className="fp-meta-btns">
          <button className="fp-icon-btn"><Star size={20}/></button>
          <button className="fp-icon-btn"><MoreHorizontal size={20}/></button>
        </div>
      </div>

      {/* scrubber */}
      <div className="fp-scrub-wrap">
        <div className="fp-scrub" onClick={seek}>
          <div className="fp-scrub-fill" style={{width:`${pct}%`}}/>
          <div className="fp-scrub-thumb" style={{left:`${pct}%`}}/>
        </div>
        <div className="fp-times"><span>{fmt(progress)}</span><span>-{fmt(rem)}</span></div>
      </div>

      {/* controls */}
      <div className="fp-ctrls">
        <button className="fp-ctrl" onClick={()=>dispatch({type:'PREV_TRACK'})}>
          <Rewind size={36} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying ? <Pause size={44} fill="currentColor" strokeWidth={0}/>
                     : <Play  size={44} fill="currentColor" strokeWidth={0} style={{marginLeft:4}}/>}
        </button>
        <button className="fp-ctrl" onClick={()=>dispatch({type:'NEXT_TRACK'})}>
          <FastForward size={36} fill="currentColor" strokeWidth={0}/>
        </button>
      </div>

      {/* volume */}
      <div className="fp-vol">
        <span className="fp-vol-icon">🔈</span>
        <input type="range" className="fp-vol-slider" min="0" max="100" defaultValue="80"/>
        <span className="fp-vol-icon">🔊</span>
      </div>

      {/* bottom icons */}
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
  useEffect(() => { if (currentTrack) setExp(false); }, [currentTrack?.id]);
  if (!currentTrack) return null;
  return (
    <>
      {!exp && <MiniBar track={currentTrack} isPlaying={isPlaying} onExpand={()=>setExp(true)} dispatch={dispatch}/>}
      <FullPlayer track={currentTrack} isPlaying={isPlaying} progress={progress} duration={duration}
                  open={exp} onCollapse={()=>setExp(false)} dispatch={dispatch}/>
    </>
  );
}
