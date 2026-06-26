/**
 * BottomDock — swipeable carousel: [mini-player] ↔ [tab nav]
 *
 * The glass pill is always fixed at the bottom of the screen.
 * Internally it holds a 200%-wide sliding track with two slots:
 *   Slot 0 (left)  = mini player
 *   Slot 1 (right) = tab nav
 *
 * When a track starts playing → jumps to slot 0 (player).
 * Swipe left  on player → show nav  (slot 1).
 * Swipe right on nav    → show player (slot 0).
 * No track → always show nav.
 *
 * Note: global CSS sets `touch-action: manipulation` on all elements.
 * We override it to `touch-action: pan-y` on the dock so horizontal
 * swipes don't get cancelled by the browser before we can preventDefault.
 */
import { createPortal } from 'react-dom';
import { useRef, useEffect, useCallback, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Library, Search, MessageCircle, ShoppingBag,
  Play, Pause, FastForward,
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import './BottomDock.css';

const NAV_ITEMS = [
  { to: '/',         label: 'Home',     icon: Home          },
  { to: '/library',  label: 'Library',  icon: Library       },
  { to: '/search',   label: 'Search',   icon: Search        },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/shop',     label: 'Shop',     icon: ShoppingBag   },
];

/* ── Mini player content ────────────────────────────────────────── */
function MiniSlot({ track, isPlaying, dispatch, onExpand }) {
  return (
    <div className="dock-mini" onClick={onExpand}>
      {track.releaseCover
        ? <img src={track.releaseCover} className="dock-mini-art" alt="" />
        : <div className="dock-mini-art dock-mini-art-ph" />}

      <div className="dock-mini-info">
        <div className="dock-mini-title">{track.title}</div>
        <div className="dock-mini-artist">{track.artistName || track.artist || '—'}</div>
      </div>

      <div className="dock-mini-ctrls" onClick={e => e.stopPropagation()}>
        <button
          className="dock-mini-btn"
          onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <Pause  size={22} fill="currentColor" strokeWidth={0} />
            : <Play   size={22} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
        </button>
        <button
          className="dock-mini-btn"
          onClick={() => dispatch({ type: 'NEXT_TRACK' })}
          aria-label="Next track"
        >
          <FastForward size={20} fill="currentColor" strokeWidth={0} />
        </button>
      </div>

      {/* Faint swipe hint */}
      <div className="dock-swipe-hint" aria-hidden="true">›</div>
    </div>
  );
}

/* ── All logic lives here (hooks before any conditional returns) ─── */
function DockInner({ onExpandPlayer }) {
  const { state, dispatch } = usePlayer();
  const { currentTrack, isPlaying } = state;
  const hasTrack = !!currentTrack;

  const location     = useLocation();
  const dockRef      = useRef(null);   // outer fixed pill
  const trackRef     = useRef(null);   // 200%-wide inner slider
  const navRef       = useRef(null);   // <nav> element for indicator calc
  const indicatorRef = useRef(null);   // sliding dot indicator

  /* 0 = player, 1 = nav. Start on nav. */
  const [slot, setSlot] = useState(1);

  /* Jump to player when track starts; back to nav when it stops */
  const prevHasTrack = useRef(false);
  useEffect(() => {
    if (hasTrack && !prevHasTrack.current) {
      setSlot(0); // new track → show player
    }
    if (!hasTrack) {
      setSlot(1); // stopped → show nav
    }
    prevHasTrack.current = hasTrack;
  }, [hasTrack]);

  /* ── Nav indicator slide ────────────────────────────────────── */
  const slideIndicator = useCallback(() => {
    const nav = navRef.current;
    const ind = indicatorRef.current;
    if (!nav || !ind) return;
    const active = nav.querySelector('.dock-nav-item.active');
    if (!active) return;
    const nr = nav.getBoundingClientRect();
    const ir = active.getBoundingClientRect();
    ind.style.transform = `translateX(${ir.left - nr.left + ir.width / 2}px) translateX(-50%)`;
  }, []);

  useEffect(() => {
    // Slight delay so NavLink has committed its active class
    const t = setTimeout(slideIndicator, 30);
    return () => clearTimeout(t);
  }, [location.pathname, slot, slideIndicator]);

  /* ── Swipe gesture ─────────────────────────────────────────── */
  const startX     = useRef(0);
  const startY     = useRef(0);
  const dragging   = useRef(false);
  const axis       = useRef(null);     // 'h' | 'v' | null
  const currentSlot = useRef(slot);    // ref copy so callbacks don't stale-close
  const hasTrackRef = useRef(hasTrack);

  useEffect(() => { currentSlot.current  = slot;     }, [slot]);
  useEffect(() => { hasTrackRef.current  = hasTrack; }, [hasTrack]);

  /* Width of one slot in pixels (= width of the outer pill) */
  const slotWidth = useCallback(
    () => dockRef.current?.offsetWidth ?? window.innerWidth,
    []
  );

  const applyTrackX = useCallback((pct) => {
    const tr = trackRef.current;
    if (!tr) return;
    // pct is 0..−50 (percentage of track's own 200% width)
    tr.style.transform = `translateX(${pct}%)`;
  }, []);

  /* Instantly snap to a slot (no animation) */
  const snapTo = useCallback((s) => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = 'none';
    applyTrackX(s === 0 ? 0 : -50);
    // Force reflow then re-enable transition
    void tr.offsetWidth;
    tr.style.transition = '';
  }, [applyTrackX]);

  /* Animate-slide to a slot */
  const slideTo = useCallback((s) => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = ''; // use CSS transition
    applyTrackX(s === 0 ? 0 : -50);
    setSlot(s);
  }, [applyTrackX]);

  const onTouchStart = useCallback((e) => {
    startX.current   = e.touches[0].clientX;
    startY.current   = e.touches[0].clientY;
    dragging.current = true;
    axis.current     = null;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!dragging.current || !hasTrackRef.current) return;

    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine axis on first meaningful move (≥4px)
    if (!axis.current) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }

    if (axis.current === 'h') {
      e.preventDefault(); // stop page scroll for horizontal gesture
      const base    = currentSlot.current === 0 ? 0 : -50;
      const deltaPct = (dx / slotWidth()) * 50; // 50 because track is 2× wide
      const clamped  = Math.max(-50, Math.min(0, base + deltaPct));
      const tr = trackRef.current;
      if (tr) {
        tr.style.transition = 'none';
        tr.style.transform  = `translateX(${clamped}%)`;
      }
    }
  }, [slotWidth]);

  const onTouchEnd = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (axis.current !== 'h' || !hasTrackRef.current) return;

    const dx = e.changedTouches[0].clientX - startX.current;
    const THRESHOLD = 44; // px

    if (currentSlot.current === 0 && dx < -THRESHOLD) {
      slideTo(1); // player → nav
    } else if (currentSlot.current === 1 && dx > THRESHOLD) {
      slideTo(0); // nav → player
    } else {
      // snap back to current slot
      slideTo(currentSlot.current);
    }
  }, [slideTo]);

  // Attach touch handlers with passive:false on touchmove so we can preventDefault
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true  });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // When slot changes programmatically (e.g. track starts), slide with animation
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = ''; // CSS handles animation
    tr.style.transform  = `translateX(${slot === 0 ? '0%' : '-50%'})`;
  }, [slot]);

  return createPortal(
    <div ref={dockRef} className="bottom-dock">

      {/* Page dots — visible only while a track is playing */}
      {hasTrack && (
        <div className="dock-dots" aria-hidden="true">
          <span className={`dock-dot${slot === 0 ? ' dock-dot--on' : ''}`} />
          <span className={`dock-dot${slot === 1 ? ' dock-dot--on' : ''}`} />
        </div>
      )}

      {/* Inner track — 200% wide, slides left/right */}
      <div ref={trackRef} className="dock-track">

        {/* Slot 0 — mini player (only mounted when a track exists) */}
        <div className="dock-slot">
          {hasTrack && (
            <MiniSlot
              track={currentTrack}
              isPlaying={isPlaying}
              dispatch={dispatch}
              onExpand={onExpandPlayer}
            />
          )}
        </div>

        {/* Slot 1 — tab nav */}
        <div className="dock-slot">
          <nav ref={navRef} className="dock-nav">
            <div ref={indicatorRef} className="dock-nav-indicator" aria-hidden="true" />
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `dock-nav-item${isActive ? ' active' : ''}`}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

      </div>
    </div>,
    document.body,
  );
}

/* ── Public export — returns null inside native iOS shell ──────── */
export default function BottomDock({ onExpandPlayer }) {
  if (navigator.userAgent.includes('KyoyuApp')) return null;
  return <DockInner onExpandPlayer={onExpandPlayer} />;
}
