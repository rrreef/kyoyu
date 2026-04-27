import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play, Pause, Rewind, FastForward, Music2 } from 'lucide-react';
import './Player.css';

function fmt(s) {
  const m = Math.floor(s/60), sec=Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function EqBars({ active, n=5, cls='' }) {
  return (
    <div className={`eq ${cls}${active?' on':''}`}>
      {Array.from({length:n}).map((_,i)=><span key={i} style={{'--i':i}}/>)}
    </div>
  );
}

function AirPlayIcon() {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>
      <polygon points="11 13 16 20 6 20 11 13" fill="currentColor" stroke="none"/>
    </svg>
  );
}

/* ── Mini pill — img_11 ── */
function MiniIsland({ track, isPlaying, onExpand }) {
  const startY = useRef(0);

  function onTouchStart(e) { startY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 40) onExpand();   // swipe DOWN → expand
  }

  return (
    <div
      className="di-mini"
      onClick={onExpand}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {track.releaseCover
        ? <img src={track.releaseCover} className="di-mini-art" alt=""/>
        : <div className="di-mini-art di-mini-art-ph"><Music2 size={14}/></div>
      }
      <EqBars active={isPlaying} n={5} cls="eq--di"/>
    </div>
  );
}

/* ── Expanded card — img_12, drops below Dynamic Island ── */
function ExpandedIsland({ track, isPlaying, progress, duration, onCollapse, dispatch }) {
  const scrubRef = useRef(null);
  const startY   = useRef(0);
  const pct = duration ? (progress/duration)*100 : 0;
  const rem = Math.max(0, duration - progress);

  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type:'SET_PROGRESS', value: Math.floor(((e.clientX-r.left)/r.width)*duration) });
  }

  function onTouchStart(e) { startY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy < -40) onCollapse();   // swipe UP → collapse to mini
  }

  return (
    <div
      className="di-exp"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Row 1: artwork + info + eq */}
      <div className="di-exp-r1">
        {track.releaseCover
          ? <img src={track.releaseCover} className="di-exp-art" alt=""/>
          : <div className="di-exp-art di-exp-art-ph"><Music2 size={20}/></div>
        }
        <div className="di-exp-info">
          <div className="di-exp-title">{track.title}</div>
          <div className="di-exp-artist">{track.artistName}</div>
        </div>
        <EqBars active={isPlaying} n={5} cls="eq--sm"/>
      </div>

      {/* Row 2: scrubber */}
      <div className="di-scrub" ref={scrubRef} onClick={seek}>
        <div className="di-scrub-fill" style={{width:`${pct}%`}}/>
        <div className="di-scrub-thumb" style={{left:`${pct}%`}}/>
      </div>
      <div className="di-times">
        <span>{fmt(progress)}</span>
        <span>-{fmt(rem)}</span>
      </div>

      {/* Row 3: controls */}
      <div className="di-ctrls-row">
        <div className="di-ctrls">
          <button className="di-btn" onClick={()=>dispatch({type:'PREV_TRACK'})}>
            <Rewind size={26} fill="currentColor" strokeWidth={0}/>
          </button>
          <button className="di-btn" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
            {isPlaying
              ? <Pause size={30} fill="currentColor" strokeWidth={0}/>
              : <Play  size={30} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>
            }
          </button>
          <button className="di-btn" onClick={()=>dispatch({type:'NEXT_TRACK'})}>
            <FastForward size={26} fill="currentColor" strokeWidth={0}/>
          </button>
        </div>
        <button className="di-btn di-btn--air"><AirPlayIcon/></button>
      </div>
    </div>
  );
}

/* ── Main export ── */
export default function Player() {
  const { state, dispatch } = usePlayer();
  const [exp, setExp] = useState(true);
  const { currentTrack, isPlaying, progress, duration } = state;

  useEffect(() => { if (currentTrack) setExp(true); }, [currentTrack?.id]);

  if (!currentTrack) return null;

  if (!exp) return (
    <MiniIsland track={currentTrack} isPlaying={isPlaying} onExpand={()=>setExp(true)}/>
  );

  return (
    <ExpandedIsland
      track={currentTrack} isPlaying={isPlaying}
      progress={progress} duration={duration}
      onCollapse={()=>setExp(false)} dispatch={dispatch}
    />
  );
}
