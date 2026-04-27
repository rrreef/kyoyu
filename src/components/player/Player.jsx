import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Music2 } from 'lucide-react';
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

/* ── Mini pill at top (img_11 compact) ── */
function MiniIsland({ track, isPlaying, onTap }) {
  return (
    <div className="di-mini" onClick={onTap}>
      {track.releaseCover
        ? <img src={track.releaseCover} className="di-mini-art" alt=""/>
        : <div className="di-mini-art di-mini-art-ph"><Music2 size={14}/></div>
      }
      <EqBars active={isPlaying} n={5} cls="eq--di"/>
    </div>
  );
}

/* ── Expanded Dynamic Island player (img_12) — drops from top ── */
function ExpandedIsland({ track, isPlaying, progress, duration, onCollapse, dispatch }) {
  const ref = useRef(null);
  const pct = duration ? (progress/duration)*100 : 0;
  const rem = Math.max(0, duration - progress);

  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    dispatch({ type:'SET_PROGRESS', value: Math.floor(((e.clientX-r.left)/r.width)*duration) });
  }

  return (
    <div className="di-exp">
      {/* row 1: art + info + eq */}
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

      {/* row 2: scrubber */}
      <div className="di-scrub" ref={ref} onClick={seek}>
        <div className="di-scrub-fill" style={{width:`${pct}%`}}/>
        <div className="di-scrub-thumb" style={{left:`${pct}%`}}/>
      </div>
      <div className="di-times">
        <span>{fmt(progress)}</span>
        <span>-{fmt(rem)}</span>
      </div>

      {/* row 3: controls */}
      <div className="di-ctrls">
        <button className="di-btn" onClick={()=>dispatch({type:'PREV_TRACK'})}>
          <SkipBack size={26} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="di-btn" onClick={()=>dispatch({type:'TOGGLE_PLAY'})}>
          {isPlaying
            ? <Pause size={30} fill="currentColor" strokeWidth={0}/>
            : <Play  size={30} fill="currentColor" strokeWidth={0} style={{marginLeft:2}}/>
          }
        </button>
        <button className="di-btn" onClick={()=>dispatch({type:'NEXT_TRACK'})}>
          <SkipForward size={26} fill="currentColor" strokeWidth={0}/>
        </button>
        <button className="di-btn di-btn--air"><AirPlayIcon/></button>
      </div>

      {/* tap to collapse */}
      <div className="di-collapse-hit" onClick={onCollapse}/>
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

  if (!exp) return <MiniIsland track={currentTrack} isPlaying={isPlaying} onTap={()=>setExp(true)}/>;

  return (
    <ExpandedIsland
      track={currentTrack} isPlaying={isPlaying}
      progress={progress} duration={duration}
      onCollapse={()=>setExp(false)} dispatch={dispatch}
    />
  );
}
