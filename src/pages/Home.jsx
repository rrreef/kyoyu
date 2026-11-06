import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowRight, Lock, Music2, ListMusic } from 'lucide-react';
import { usePlayer, historyReplayInfo } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useHomeLayoutLive } from '../contexts/DisplayContext';
import { UploadExpandedList, UploadGridView } from '../components/uploads/UploadShelf';
import AccountItemList, { sanitizeArtworkUrl, pinImageInMemory, preloadImagesInMemory, toPlayable, openContentActionCard, usePinnedAndHiddenContent, openArtistFromHomeTap, openLabelFromHomeTap } from '../components/AccountItems';
import { useConnectedLibrary, preloadConnectedLibrary } from '../lib/useConnectedLibrary';
import { fetchAccountLibrary, useProviderPriority, useHomeSectionRows, DEFAULT_HOME_SECTION_ROWS, HOME_TITLES_PER_ROW, cleanTrackOrReleaseTitle, splitCleanMetadata } from '../lib/streaming';
import { fetchPublicTracks } from '../lib/uploadPipeline';
import AlbumSheet, { openNativeAlbumFast, registerAlbumPlayback } from '../components/ui/AlbumSheet';
import './Home.css';

const PUBLIC_RELEASES_CACHE_KEY = 'kyoyu-public-releases-cache-v1';
let _cachedPublicReleases = [];
let _publicReleasesPromise = null;
const _publicReleaseListeners = new Set();
const _expandedVisibleCounts = new Map();
const _horizontalSwipePageCounts = new Map();
const _horizontalSwipePageIndices = new Map();
const _freeSwipeOffsets = new Map();
let _lastHomeVerticalScrollTs = 0;

if (typeof window !== 'undefined' && !window.__kyoyuHomeScrollTrackerInstalled) {
  window.__kyoyuHomeScrollTrackerInstalled = true;
  window.addEventListener(
    'scroll',
    (e) => {
      const tgt = e.target;
      if (
        tgt === window ||
        tgt === document ||
        tgt === document.documentElement ||
        tgt === document.body ||
        tgt?.id === 'kyoyu-tab-pane-0' ||
        tgt?.classList?.contains('kyoyu-keepalive-pane') ||
        tgt?.classList?.contains('main-content')
      ) {
        _lastHomeVerticalScrollTs = performance.now();
      }
    },
    { capture: true, passive: true }
  );
}

function markHorizontalSwipeNow() {
  if (typeof window !== 'undefined') {
    window.__kyoyuLastHorizontalSwipeTs = Date.now();
    window.__kyoyuCancelActiveLongPress?.();
  }
}

function CatalogSwipeRow({ sectionKey, pages, renderPage }) {
  const [pageIndex, setPageIndex] = useState(() => {
    const saved = _horizontalSwipePageIndices.get(sectionKey) || 0;
    return Math.max(0, Math.min(saved, Math.max(0, pages.length - 1)));
  });
  const [renderedPages, setRenderedPages] = useState(() => {
    const savedPage = _horizontalSwipePageIndices.get(sectionKey) || 0;
    const savedCount = _horizontalSwipePageCounts.get(sectionKey) || 4;
    return Math.min(pages.length, Math.max(4, savedPage + 4, savedCount));
  });

  const rowRef = useRef(null);
  const trackRef = useRef(null);
  const settleTimerRef = useRef(null);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;
  const pagesLenRef = useRef(pages.length);
  pagesLenRef.current = pages.length;
  const renderedPagesRef = useRef(renderedPages);
  renderedPagesRef.current = renderedPages;

  const gestureRef = useRef({
    active: false,
    axis: null,
    isDraggingX: false,
    startX: 0,
    startY: 0,
    lockX: 0,
    rowWidth: 340,
    lastX: 0,
    lastTs: 0,
    vx: 0,
    rawDx: 0,
  });

  useEffect(() => {
    const maxPage = Math.max(0, pages.length - 1);
    const savedIdx = _horizontalSwipePageIndices.get(sectionKey) || 0;
    const clampedPage = Math.max(0, Math.min(savedIdx, maxPage));
    if (clampedPage !== pageIndexRef.current) {
      pageIndexRef.current = clampedPage;
      setPageIndex(clampedPage);
    }
    const savedCount = _horizontalSwipePageCounts.get(sectionKey) || 4;
    const targetRendered = Math.min(pages.length, Math.max(4, clampedPage + 4, savedCount));
    if (targetRendered > renderedPagesRef.current) {
      renderedPagesRef.current = targetRendered;
      setRenderedPages(targetRendered);
    }
    const track = trackRef.current;
    if (track && !gestureRef.current.isDraggingX) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(${-clampedPage * 100}%, 0, 0)`;
    }
  }, [sectionKey, pages.length]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const g = gestureRef.current;
      if (pagesLenRef.current <= 1 || e.touches.length !== 1) {
        g.active = false;
        g.axis = null;
        g.isDraggingX = false;
        return;
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      const t = e.touches[0];
      const now = performance.now();
      const scrollingVertically = now - _lastHomeVerticalScrollTs < 60;
      g.active = true;
      g.axis = scrollingVertically ? 'y' : null;
      g.isDraggingX = false;
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.lockX = t.clientX;
      g.rowWidth = el.clientWidth || 340;
      g.lastX = t.clientX;
      g.lastTs = now;
      g.vx = 0;
      g.rawDx = 0;
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || g.axis === 'y') return;
      if (e.touches.length !== 1) {
        g.axis = 'y';
        return;
      }
      const now = performance.now();
      if (g.axis === null && now - _lastHomeVerticalScrollTs < 50) {
        g.axis = 'y';
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (g.axis === null) {
        if (absDx < 6 && absDy < 6) return;
        if (absDy > absDx * 1.15 && absDy >= 7) {
          g.axis = 'y';
          return;
        }
        if (absDx >= 6 && absDx >= absDy * 1.12) {
          g.axis = 'x';
          g.isDraggingX = true;
          g.lockX = t.clientX;
          g.lastX = t.clientX;
          g.lastTs = now;
          g.vx = 0;
          g.rawDx = 0;
          markHorizontalSwipeNow();
        } else {
          return;
        }
      }

      if (g.axis === 'x') {
        if (e.cancelable) e.preventDefault();
        markHorizontalSwipeNow();
        const dt = Math.max(1, now - g.lastTs);
        const instVx = (t.clientX - g.lastX) / dt;
        g.vx = g.vx * 0.32 + instVx * 0.68;
        g.lastX = t.clientX;
        g.lastTs = now;

        const rawDx = t.clientX - g.lockX;
        g.rawDx = rawDx;
        const curPage = pageIndexRef.current;
        const maxPage = Math.max(0, pagesLenRef.current - 1);
        let effectiveDx = rawDx;
        if ((curPage <= 0 && rawDx > 0) || (curPage >= maxPage && rawDx < 0)) {
          effectiveDx = rawDx * 0.26;
        }
        const track = trackRef.current;
        if (track) {
          const pctOffset = (-curPage * 100) + (effectiveDx / Math.max(1, g.rowWidth)) * 100;
          track.style.transition = 'none';
          track.style.transform = `translate3d(${pctOffset.toFixed(3)}%, 0, 0)`;
        }
      }
    };

    const finishTouch = () => {
      const g = gestureRef.current;
      if (!g.active) return;
      const wasDraggingX = g.axis === 'x' && g.isDraggingX;
      const rawDx = g.rawDx;
      const vx = g.vx;
      const width = g.rowWidth || el.clientWidth || 340;
      g.active = false;
      g.axis = null;
      g.isDraggingX = false;
      if (!wasDraggingX) return;

      markHorizontalSwipeNow();
      const curPage = pageIndexRef.current;
      const maxPage = Math.max(0, pagesLenRef.current - 1);
      const threshold = Math.min(64, width * 0.14);
      let nextPage = curPage;
      if ((rawDx < -threshold || (vx < -0.18 && rawDx < -8)) && curPage < maxPage) {
        nextPage = curPage + 1;
      } else if ((rawDx > threshold || (vx > 0.18 && rawDx > 8)) && curPage > 0) {
        nextPage = curPage - 1;
      }

      pageIndexRef.current = nextPage;
      _horizontalSwipePageIndices.set(sectionKey, nextPage);

      // Animate purely on the GPU compositor thread first — defer React state updates until after the glide settles
      const track = trackRef.current;
      if (track) {
        track.style.transition = 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)';
        track.style.transform = `translate3d(${-nextPage * 100}%, 0, 0)`;
      }

      const needed = Math.min(pagesLenRef.current, nextPage + 4);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        if (needed > renderedPagesRef.current) {
          renderedPagesRef.current = needed;
          _horizontalSwipePageCounts.set(sectionKey, Math.max(_horizontalSwipePageCounts.get(sectionKey) || 4, needed));
          setRenderedPages(needed);
        }
        setPageIndex(nextPage);
      }, 330);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finishTouch, { passive: true });
    el.addEventListener('touchcancel', finishTouch, { passive: true });
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finishTouch);
      el.removeEventListener('touchcancel', finishTouch);
    };
  }, [sectionKey]);

  const handleClickCapture = useCallback((e) => {
    if (typeof window !== 'undefined' && window.__kyoyuLastHorizontalSwipeTs && Date.now() - window.__kyoyuLastHorizontalSwipeTs < 360) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div ref={rowRef} className="catalog-swipe-row" onClickCapture={handleClickCapture}>
      <div
        ref={trackRef}
        className="catalog-swipe-track"
        style={{ transform: `translate3d(${-pageIndex * 100}%, 0, 0)` }}
      >
        {pages.slice(0, renderedPages).map((pageItems, pIdx) => (
          <div key={`${sectionKey}-p${pIdx}`} className="catalog-swipe-page">
            {renderPage(pageItems, pIdx)}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroSwipeRow({ sectionKey, itemCount, children }) {
  const [pageIndex, setPageIndex] = useState(() => {
    const saved = _horizontalSwipePageIndices.get(sectionKey) || 0;
    return Math.max(0, Math.min(saved, Math.max(0, itemCount - 1)));
  });

  const rowRef = useRef(null);
  const trackRef = useRef(null);
  const settleTimerRef = useRef(null);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  const gestureRef = useRef({
    active: false,
    axis: null,
    isDraggingX: false,
    startX: 0,
    startY: 0,
    lockX: 0,
    lastX: 0,
    lastTs: 0,
    vx: 0,
    rawDx: 0,
  });

  useEffect(() => {
    const maxPage = Math.max(0, itemCount - 1);
    const savedIdx = _horizontalSwipePageIndices.get(sectionKey) || 0;
    const clampedPage = Math.max(0, Math.min(savedIdx, maxPage));
    if (clampedPage !== pageIndexRef.current) {
      pageIndexRef.current = clampedPage;
      setPageIndex(clampedPage);
    }
    const track = trackRef.current;
    if (track && !gestureRef.current.isDraggingX) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(calc(${-clampedPage} * (100% + 14px)), 0, 0)`;
    }
  }, [sectionKey, itemCount]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const g = gestureRef.current;
      if (itemCountRef.current <= 1 || e.touches.length !== 1) {
        g.active = false;
        g.axis = null;
        g.isDraggingX = false;
        return;
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      const t = e.touches[0];
      const now = performance.now();
      const scrollingVertically = now - _lastHomeVerticalScrollTs < 60;
      g.active = true;
      g.axis = scrollingVertically ? 'y' : null;
      g.isDraggingX = false;
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.lockX = t.clientX;
      g.lastX = t.clientX;
      g.lastTs = now;
      g.vx = 0;
      g.rawDx = 0;
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || g.axis === 'y') return;
      if (e.touches.length !== 1) {
        g.axis = 'y';
        return;
      }
      const now = performance.now();
      if (g.axis === null && now - _lastHomeVerticalScrollTs < 50) {
        g.axis = 'y';
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (g.axis === null) {
        if (absDx < 6 && absDy < 6) return;
        if (absDy > absDx * 1.15 && absDy >= 7) {
          g.axis = 'y';
          return;
        }
        if (absDx >= 6 && absDx >= absDy * 1.12) {
          g.axis = 'x';
          g.isDraggingX = true;
          g.lockX = t.clientX;
          g.lastX = t.clientX;
          g.lastTs = now;
          g.vx = 0;
          g.rawDx = 0;
          markHorizontalSwipeNow();
        } else {
          return;
        }
      }

      if (g.axis === 'x') {
        if (e.cancelable) e.preventDefault();
        markHorizontalSwipeNow();
        const dt = Math.max(1, now - g.lastTs);
        const instVx = (t.clientX - g.lastX) / dt;
        g.vx = g.vx * 0.32 + instVx * 0.68;
        g.lastX = t.clientX;
        g.lastTs = now;

        const rawDx = t.clientX - g.lockX;
        g.rawDx = rawDx;
        const curPage = pageIndexRef.current;
        const maxPage = Math.max(0, itemCountRef.current - 1);
        let effectiveDx = rawDx;
        if ((curPage <= 0 && rawDx > 0) || (curPage >= maxPage && rawDx < 0)) {
          effectiveDx = rawDx * 0.26;
        }
        const track = trackRef.current;
        if (track) {
          track.style.transition = 'none';
          track.style.transform = `translate3d(calc(${-curPage} * (100% + 14px) + ${effectiveDx}px), 0, 0)`;
        }
      }
    };

    const finishTouch = () => {
      const g = gestureRef.current;
      if (!g.active) return;
      const wasDraggingX = g.axis === 'x' && g.isDraggingX;
      const rawDx = g.rawDx;
      const vx = g.vx;
      g.active = false;
      g.axis = null;
      g.isDraggingX = false;
      if (!wasDraggingX) return;

      markHorizontalSwipeNow();
      const curPage = pageIndexRef.current;
      const maxPage = Math.max(0, itemCountRef.current - 1);
      const width = el.clientWidth || 340;
      const threshold = Math.min(64, width * 0.14);
      let nextPage = curPage;
      if ((rawDx < -threshold || (vx < -0.18 && rawDx < -8)) && curPage < maxPage) {
        nextPage = curPage + 1;
      } else if ((rawDx > threshold || (vx > 0.18 && rawDx > 8)) && curPage > 0) {
        nextPage = curPage - 1;
      }

      pageIndexRef.current = nextPage;
      _horizontalSwipePageIndices.set(sectionKey, nextPage);
      const track = trackRef.current;
      if (track) {
        track.style.transition = 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)';
        track.style.transform = `translate3d(calc(${-nextPage} * (100% + 14px)), 0, 0)`;
      }
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        setPageIndex(nextPage);
      }, 330);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finishTouch, { passive: true });
    el.addEventListener('touchcancel', finishTouch, { passive: true });
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finishTouch);
      el.removeEventListener('touchcancel', finishTouch);
    };
  }, [sectionKey]);

  const handleClickCapture = useCallback((e) => {
    if (typeof window !== 'undefined' && window.__kyoyuLastHorizontalSwipeTs && Date.now() - window.__kyoyuLastHorizontalSwipeTs < 360) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div ref={rowRef} className="featured-hero-row" onClickCapture={handleClickCapture}>
      <div
        ref={trackRef}
        className="featured-hero-track"
        style={{ transform: `translate3d(calc(${-pageIndex} * (100% + 14px)), 0, 0)` }}
      >
        {children}
      </div>
    </div>
  );
}

function FreeSwipeRow({ sectionKey, className = 'scroll-row', style, disabled = false, children }) {
  const rowRef = useRef(null);
  const trackRef = useRef(null);
  const offsetRef = useRef(_freeSwipeOffsets.get(sectionKey) || 0);

  const gestureRef = useRef({
    active: false,
    axis: null,
    isDraggingX: false,
    startX: 0,
    startY: 0,
    lockX: 0,
    baseOffset: 0,
    lastX: 0,
    lastTs: 0,
    vx: 0,
  });

  useEffect(() => {
    if (disabled) return;
    const el = rowRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const getMinX = () => {
      const styles = window.getComputedStyle(el);
      const padL = parseFloat(styles.paddingLeft) || 0;
      const padR = parseFloat(styles.paddingRight) || 0;
      const innerW = Math.max(1, el.clientWidth - padL - padR);
      return -Math.max(0, track.scrollWidth - innerW);
    };

    const clampedInit = Math.max(getMinX(), Math.min(0, offsetRef.current));
    offsetRef.current = clampedInit;
    track.style.transition = 'none';
    track.style.transform = `translate3d(${clampedInit}px, 0, 0)`;

    const onTouchStart = (e) => {
      const g = gestureRef.current;
      if (e.touches.length !== 1) {
        g.active = false;
        g.axis = null;
        g.isDraggingX = false;
        return;
      }
      const t = e.touches[0];
      const now = performance.now();
      const scrollingVertically = now - _lastHomeVerticalScrollTs < 60;
      g.active = true;
      g.axis = scrollingVertically ? 'y' : null;
      g.isDraggingX = false;
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.lockX = t.clientX;
      g.baseOffset = offsetRef.current;
      g.lastX = t.clientX;
      g.lastTs = now;
      g.vx = 0;
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || g.axis === 'y') return;
      if (e.touches.length !== 1) {
        g.axis = 'y';
        return;
      }
      const now = performance.now();
      if (g.axis === null && now - _lastHomeVerticalScrollTs < 50) {
        g.axis = 'y';
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (g.axis === null) {
        if (absDx < 6 && absDy < 6) return;
        if (absDy > absDx * 1.15 && absDy >= 7) {
          g.axis = 'y';
          return;
        }
        if (absDx >= 6 && absDx >= absDy * 1.12) {
          g.axis = 'x';
          g.isDraggingX = true;
          g.lockX = t.clientX;
          g.baseOffset = offsetRef.current;
          g.lastX = t.clientX;
          g.lastTs = now;
          g.vx = 0;
          markHorizontalSwipeNow();
        } else {
          return;
        }
      }

      if (g.axis === 'x') {
        if (e.cancelable) e.preventDefault();
        markHorizontalSwipeNow();
        const dt = Math.max(1, now - g.lastTs);
        const instVx = (t.clientX - g.lastX) / dt;
        g.vx = g.vx * 0.35 + instVx * 0.65;
        g.lastX = t.clientX;
        g.lastTs = now;

        const minX = getMinX();
        const rawNext = g.baseOffset + (t.clientX - g.lockX);
        let effectiveNext = rawNext;
        if (rawNext > 0) effectiveNext = rawNext * 0.25;
        else if (rawNext < minX) effectiveNext = minX + (rawNext - minX) * 0.25;
        offsetRef.current = effectiveNext;
        track.style.transition = 'none';
        track.style.transform = `translate3d(${effectiveNext}px, 0, 0)`;
      }
    };

    const finishTouch = () => {
      const g = gestureRef.current;
      if (!g.active) return;
      const wasDraggingX = g.axis === 'x' && g.isDraggingX;
      const vx = g.vx;
      g.active = false;
      g.axis = null;
      g.isDraggingX = false;
      if (!wasDraggingX) return;

      markHorizontalSwipeNow();
      const minX = getMinX();
      const projected = offsetRef.current + vx * 240;
      const finalOffset = Math.max(minX, Math.min(0, projected));
      offsetRef.current = finalOffset;
      _freeSwipeOffsets.set(sectionKey, finalOffset);
      track.style.transition = 'transform 340ms cubic-bezier(0.16, 1, 0.3, 1)';
      track.style.transform = `translate3d(${finalOffset}px, 0, 0)`;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finishTouch, { passive: true });
    el.addEventListener('touchcancel', finishTouch, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finishTouch);
      el.removeEventListener('touchcancel', finishTouch);
    };
  }, [sectionKey, disabled]);

  const handleClickCapture = useCallback((e) => {
    if (typeof window !== 'undefined' && window.__kyoyuLastHorizontalSwipeTs && Date.now() - window.__kyoyuLastHorizontalSwipeTs < 360) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  if (disabled) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`${className} free-swipe-row`} style={style} onClickCapture={handleClickCapture}>
      <div ref={trackRef} className="free-swipe-track">
        {children}
      </div>
    </div>
  );
}

function HeroMarqueeRow({ className, children, onClick }) {
  const wrapRef = useRef(null);
  const copyRef = useRef(null);
  const [overflowState, setOverflowState] = useState({ overflowing: false, duration: 9 });
  const textStr = typeof children === 'string' ? children : String(children ?? '');

  useEffect(() => {
    const wrap = wrapRef.current;
    const copy = copyRef.current;
    if (!wrap || !copy) return;
    const measure = () => {
      const containerW = wrap.clientWidth;
      const contentW = copy.scrollWidth;
      const isOver = containerW > 0 && contentW > containerW + 1;
      const dur = Math.max(6, Math.min(18, (contentW + 36) / 28));
      setOverflowState(prev => (
        prev.overflowing === isOver && Math.abs(prev.duration - dur) < 0.2
          ? prev
          : { overflowing: isOver, duration: dur }
      ));
    };
    measure();
    const t = setTimeout(measure, 120);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(wrap);
    }
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
    };
  }, [textStr]);

  if (!textStr) return null;

  const isInteractive = typeof onClick === 'function';

  return (
    <div
      ref={wrapRef}
      className={className}
      data-subtap={isInteractive ? 'true' : undefined}
      onTouchStart={isInteractive ? (e) => { e.stopPropagation(); window.__kyoyuCancelActiveLongPress?.(); } : undefined}
      onTouchEnd={isInteractive ? (e) => { e.stopPropagation(); } : undefined}
      onPointerDown={isInteractive ? (e) => { e.stopPropagation(); } : undefined}
      onClick={isInteractive ? (e) => { e.stopPropagation(); e.preventDefault(); onClick(e); } : undefined}
      style={isInteractive ? { cursor: 'pointer', width: 'fit-content', maxWidth: '100%', position: 'relative', zIndex: 3 } : undefined}
    >
      <div
        className={`featured-hero-marquee-track${overflowState.overflowing ? ' is-overflowing' : ''}`}
        style={overflowState.overflowing ? { '--hero-marquee-dur': `${overflowState.duration.toFixed(1)}s` } : undefined}
      >
        <span
          ref={copyRef}
          className={overflowState.overflowing ? 'featured-hero-marquee-copy' : undefined}
        >
          {textStr}
        </span>
        {overflowState.overflowing && (
          <span className="featured-hero-marquee-copy" aria-hidden="true">
            {textStr}
          </span>
        )}
      </div>
    </div>
  );
}

try {
  if (typeof window !== 'undefined') {
    const rawPub = localStorage.getItem(PUBLIC_RELEASES_CACHE_KEY);
    if (rawPub) {
      const parsed = JSON.parse(rawPub);
      if (Array.isArray(parsed) && parsed.length) {
        _cachedPublicReleases = parsed;
        preloadImagesInMemory(parsed, 18);
      }
    }
    const rawHist = localStorage.getItem('kyoyu-play-history');
    if (rawHist) {
      const parsedHist = JSON.parse(rawHist);
      if (Array.isArray(parsedHist) && parsedHist.length) {
        preloadImagesInMemory(parsedHist, 18);
      }
    }
  }
} catch (_) {}

export function preloadHomeContent() {
  if (typeof window === 'undefined') return;
  preloadConnectedLibrary();
  if (!_publicReleasesPromise) {
    _publicReleasesPromise = fetchPublicTracks()
      .then((tracks) => {
        if (Array.isArray(tracks)) {
          _cachedPublicReleases = tracks;
          preloadImagesInMemory(tracks, 60);
          try {
            localStorage.setItem(PUBLIC_RELEASES_CACHE_KEY, JSON.stringify(tracks.slice(0, 60)));
          } catch (_) {}
          _publicReleaseListeners.forEach((fn) => fn(tracks));
        }
        return tracks;
      })
      .catch(() => _cachedPublicReleases);
  }
}

if (typeof window !== 'undefined') {
  preloadHomeContent();
}

const HERO_META_CACHE_KEY = 'kyoyu-hero-card-meta-v6';

function cleanHeroLabel(rawLabel, rawArtist = '') {
  const clean = String(rawLabel || '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(sub-label.*?\)/i, '')
    .split('—')[0]
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  if (!clean || clean === '—' || clean === '-') return '';
  if (/^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?)$/i.test(clean)) return '';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, '');
  const lNorm = norm(clean);
  const aNorm = norm(rawArtist);
  if (!lNorm || (aNorm && lNorm === aNorm)) return '';
  const collabs = String(rawArtist || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(norm).filter(Boolean);
  if (collabs.includes(lNorm)) return '';
  return clean;
}

function normalizeHeroFormats(rawFormats, defaultDigital = true) {
  const list = Array.isArray(rawFormats)
    ? rawFormats
    : (typeof rawFormats === 'string' && rawFormats.trim() ? [rawFormats] : []);
  const seen = new Set();
  const ordered = [];
  const addFmt = (f) => {
    const clean = String(f || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(clean);
  };
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (/\b(t-?shirt|shirt|hoodie|sweater|sweatshirt|tote|bag|poster|print|sticker|hat|cap|beanie|patch|pin|mug|slipmat|ticket)\b/i.test(s)) continue;
    if (/^artist$/i.test(s)) { addFmt('Artist'); continue; }
    if (/^label$/i.test(s)) { addFmt('Label'); continue; }
    let matchedVinylSize = false;
    if (/\b12\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 12"');
      matchedVinylSize = true;
    }
    if (/\b10\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 10"');
      matchedVinylSize = true;
    }
    if (/\b7\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)\b/i.test(s)) {
      addFmt('Vinyl 7"');
      matchedVinylSize = true;
    }
    if (/\b(?:2\s*x\s*lp|2\s*x\s*vinyl|double\s+(?:vinyl|lp)|2lp)\b/i.test(s)) {
      if (!matchedVinylSize) addFmt('Vinyl 2xLP');
      matchedVinylSize = true;
    } else if (!matchedVinylSize && /\b(?:vinyl\s+lp|lp\s+vinyl|\blp\b|180\s*g(?:ram)?\s+lp)\b/i.test(s)) {
      addFmt('Vinyl LP');
      matchedVinylSize = true;
    }
    if (/lathe/i.test(s)) {
      addFmt('Lathe Cut');
    } else if (!matchedVinylSize && /vinyl|test pressing|\bwax\b/i.test(s)) {
      addFmt('Vinyl');
    }
    if (/flexi/i.test(s)) addFmt('Flexi-disc');
    if (/shellac/i.test(s)) addFmt('Shellac');
    if (/reel-to-reel|reel to reel/i.test(s)) addFmt('Reel-To-Reel');
    if (/8-track/i.test(s)) addFmt('8-Track');
    if (/minidisc/i.test(s)) addFmt('MiniDisc');
    if (/cassette|\btape\b/i.test(s)) addFmt('Cassette');
    if (/compact disc|\bcd\b|cd-r|cd-rom|digipak/i.test(s)) addFmt('CD');
    if (/\busb\b|memory stick/i.test(s)) addFmt('USB');
    if (/\bvhs\b/i.test(s)) addFmt('VHS');
    if (/\bdvd\b|blu-?ray/i.test(s)) addFmt('DVD');
    if (/box\s*set/i.test(s)) addFmt('Box Set');
    if (/file|digital|mp3|flac|wav|aiff|alac|aac|ogg/i.test(s)) addFmt('Digital');
  }
  const hasSpecificVinyl = seen.has('vinyl 12"') || seen.has('vinyl 10"') || seen.has('vinyl 7"') || seen.has('vinyl 2xlp') || seen.has('vinyl lp');
  const filtered = hasSpecificVinyl
    ? ordered.filter(f => f.toLowerCase() !== 'vinyl')
    : ordered;
  if (defaultDigital && !seen.has('digital') && !seen.has('artist') && !seen.has('label')) {
    filtered.push('Digital');
  }
  return filtered;
}

function formatHeroReleaseDate(rawDate, fallbackTs = 0) {
  const s = String(rawDate || '').trim();
  if (s) {
    if (/^\d{4}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1950) {
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return s;
  }
  if (fallbackTs && Number(fallbackTs) > 100000000) {
    const dt = new Date(Number(fallbackTs) * 1000);
    if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1950) {
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return '';
}

/**
 * Groups an array of flat tracks into album objects.
 */
function groupByAlbum(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    const cleanT = splitCleanMetadata(t.title, t.artist, t.label, t.album);
    const hasAlbum = cleanT.album && cleanT.album.trim() && cleanT.album.trim() !== cleanT.title.trim();
    const key = hasAlbum ? `album::${cleanT.album.trim()}::${cleanT.artist.trim()}` : `single::${t.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id:          key,
        title:       hasAlbum ? cleanT.album.trim() : cleanT.title,
        artist:      cleanT.artist || t.artist,
        cover:       t.cover,
        label:       cleanT.label || t.label,
        genre:       t.genre,
        year:        t.year,
        releaseDate: t.releaseDate || t.publishedAt || t.createdAt || (t.year ? String(t.year) : ''),
        location:    t.location || t.country || '',
        formats:     t.formats || ['Digital'],
        tracks:      [],
      });
    }
    const entry = map.get(key);
    entry.tracks.push({ ...t, title: cleanT.title || t.title, artist: cleanT.artist || t.artist });
    if (!entry.cover && t.cover) entry.cover = t.cover;
    if (!entry.label && (cleanT.label || t.label)) entry.label = cleanT.label || t.label;
    if (!entry.location && (t.location || t.country)) entry.location = t.location || t.country;
  });
  const extractNum = (t) => {
    const sk = t.storageKey || t.downloadUrl || '';
    const m = sk.match(/[-_](\d{1,3})[-_]/);
    return m ? parseInt(m[1], 10) : 9999;
  };
  for (const entry of map.values()) {
    if (entry.tracks.length > 1) {
      entry.tracks.sort((a, b) => extractNum(a) - extractNum(b));
    }
  }
  return Array.from(map.values());
}

export default function Home() {
  const { playRelease, playTrack, playFromHistory, setSearchQueue, playSearchItem, addToQueue, state: playerState } = usePlayer();
  const { user } = useAuth();
  const { getLikedUploads, playlists, playlistActivity, touchPlaylistActivity } = useLibrary();
  const acct = useConnectedLibrary();
  const [providerPriority] = useProviderPriority();
  const [homeSectionRows] = useHomeSectionRows();
  const homeLayout = useHomeLayoutLive();
  const [myUploads,      setMyUploads]      = useState(() => {
    if (!user?.id) return [];
    try {
      const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(t => ({
        ...t,
        artworkUrl: localStorage.getItem(`kyoyu-art-${user.id}-${t.id}`) || t.artworkUrl || null,
      })) : [];
    } catch {
      return [];
    }
  });
  const [publicReleases, setPublicReleases] = useState(() => _cachedPublicReleases);
  const [selectedAlbum,  setSelectedAlbum]  = useState(null);
  const [historyColsMode, setHistoryColsMode] = useState(() => {
    try {
      const saved = localStorage.getItem('kyoyu-history-cols-v1');
      if (saved === 'list') return 'list';
      const num = parseInt(saved, 10);
      if (num >= 1 && num <= 5) return num;
    } catch (_) {}
    return 'list';
  });
  const [historyRows, setHistoryRows] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('kyoyu-history-rows-v1'), 10);
      if (saved >= 1 && saved <= 10) return saved;
    } catch (_) {}
    return 5;
  });

  const updateHistoryColsMode = useCallback((nextMode) => {
    const val = nextMode === 'list' ? 'list' : Math.min(5, Math.max(1, Number(nextMode) || 3));
    setHistoryColsMode(val);
    try {
      localStorage.setItem('kyoyu-history-cols-v1', String(val));
    } catch (_) {}
  }, []);

  const updateHistoryRows = useCallback((nextRows) => {
    const clamped = Math.min(10, Math.max(1, Number(nextRows) || 1));
    setHistoryRows(clamped);
    try {
      localStorage.setItem('kyoyu-history-rows-v1', String(clamped));
    } catch (_) {}
  }, []);

  const queueHistoryItem = useCallback((e, item) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (typeof window !== 'undefined') {
      window.__kyoyuCancelActiveLongPress?.();
    }
    if (!item) return;
    const trackPayload = {
      id: item.id || `hist-${Date.now()}`,
      title: item.title || 'Untitled',
      artistName: item.artist || item.artistName || '',
      artist: item.artist || item.artistName || '',
      releaseCover: item.cover || item.artworkUrl || '',
      cover: item.cover || item.artworkUrl || '',
      src: item.src || item.url || item.trackUrl || '',
      url: item.url || item.trackUrl || item.src || '',
      provider: item.provider || 'bandcamp',
    };
    addToQueue?.(trackPayload);
    if (typeof window !== 'undefined' && typeof window.__kyoyuQueueTrack === 'function') {
      window.__kyoyuQueueTrack(trackPayload);
    }
    window.webkit?.messageHandlers?.player?.postMessage({ cmd: 'open_queue_sheet' });
  }, [addToQueue]);

  async function openPlaylistSheet(pl) {
    if (pl && pl.kind !== 'album') {
      touchPlaylistActivity?.(pl);
    }
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    const initialTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const rawCreator = pl.artistName || pl.artist || pl.creator || user?.displayName || 'You';
    const meta = splitCleanMetadata(pl.title, rawCreator, pl.label || pl.labelName || '');
    let creator = meta.artist || rawCreator;
    let cleanAlbumTitle = meta.title || pl.title;
    let resolvedLabel = meta.label || pl.label || pl.labelName || null;
    let resolvedYear = pl.year ? String(pl.year) : null;
    const validCoverUrl = (c) => (c && c !== '/album1.png' && !String(c).endsWith('/album1.png')) ? c : null;
    let cover = validCoverUrl(pl.artworkUrl) || validCoverUrl(pl.cover) || null;
    if (cover && cover.includes('bcbits.com')) {
      cover = cover.replace(/_[0-9]+\.jpg/, '_10.jpg');
    }

    const isAlbumKind = pl.kind === 'album';
    const pushToSheet = (currentTracks) => {
      const cleanedTracks = (currentTracks || []).map(t => {
        const tm = splitCleanMetadata(t.title || t.name || 'Unknown Track', t.artist || t.artistName || (isAlbumKind ? creator : ''), resolvedLabel || '');
        const ownAlbum = t.album || t.releaseTitle || t.albumTitle || (isAlbumKind ? cleanAlbumTitle : '');
        const ownCover = validCoverUrl(t.artworkUrl) || validCoverUrl(t.cover) || validCoverUrl(t.releaseCover) || (isAlbumKind ? cover : null);
        return {
          ...t,
          title: tm.title || t.title || t.name || 'Unknown Track',
          artist: tm.artist || t.artist || t.artistName || (isAlbumKind ? creator : ''),
          artistName: tm.artist || t.artistName || t.artist || (isAlbumKind ? creator : ''),
          label: t.label || (isAlbumKind ? resolvedLabel : undefined) || undefined,
          year: t.year || (isAlbumKind ? resolvedYear : undefined) || undefined,
          album: ownAlbum,
          releaseTitle: ownAlbum,
          cover: ownCover,
          artworkUrl: ownCover || t.artworkUrl,
          releaseCover: ownCover || t.releaseCover,
        };
      });
      if (!cover) {
        const trackWithCover = cleanedTracks.find(t => validCoverUrl(t.artworkUrl) || validCoverUrl(t.cover) || validCoverUrl(t.releaseCover));
        if (trackWithCover) {
          cover = validCoverUrl(trackWithCover.artworkUrl) || validCoverUrl(trackWithCover.cover) || validCoverUrl(trackWithCover.releaseCover);
          if (cover && cover.includes('bcbits.com')) {
            cover = cover.replace(/_[0-9]+\.jpg/, '_10.jpg');
          }
        }
      }
      const albumObj = {
        ...pl,
        title: cleanAlbumTitle,
        artist: creator,
        label: resolvedLabel,
        year: resolvedYear,
        cover,
        isPlaylist: !isAlbumKind,
        tracks: cleanedTracks,
        _ts: ts,
      };
      setSelectedAlbum(albumObj);
      registerAlbumPlayback(albumObj);
      const mappedTracks = cleanedTracks.map(t => {
        const isPlayable = t.playable !== false && !t.unplayable && t.isPlayable !== false;
        return {
          id: t.id || String(Date.now() + Math.random()),
          title: t.title || t.name || 'Unknown Track',
          artist: t.artist || t.artistName || '',
          url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
          streamUrl: t.streamUrl || t.audioUrl || '',
          cover: validCoverUrl(t.artworkUrl) || validCoverUrl(t.cover) || validCoverUrl(t.releaseCover) || (isAlbumKind ? cover : null),
          provider: t.provider || pl.provider || null,
          playable: isPlayable,
          unplayable: !isPlayable,
        };
      });
      try {
        if (pl.kind === 'album') {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            isUpdate: Boolean(currentTracks && currentTracks.length > 0 && currentTracks !== initialTracks),
            nativeAlbum: {
              _ts: String(ts),
              id: pl.id,
              title: cleanAlbumTitle,
              artist: creator,
              cover,
              url: pl.trackUrl || pl.url || pl.albumUrl || pl.providerItemId || null,
              genre: pl.genre || null,
              year: resolvedYear,
              label: resolvedLabel,
              provider: pl.provider || null,
              isPreorder: Boolean(pl.isPreorder),
              tracks: mappedTracks,
            }
          });
        } else {
          window.webkit?.messageHandlers?.player?.postMessage({
            playlistOpen: true,
            nativePlaylist: {
              _ts: String(ts),
              id: pl.id,
              title: cleanAlbumTitle,
              cover,
              creator,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        }
      } catch(e) {}
    };

    pushToSheet(initialTracks);

    if ((!initialTracks.length || (initialTracks.length <= 1 && !pl.hasFullTracks)) && pl.provider === 'bandcamp' && (pl.kind === 'album' || pl.kind === 'track') && (pl.trackUrl || pl.url || pl.albumUrl || pl.providerItemId)) {
      const albumUrl = pl.trackUrl || pl.url || pl.albumUrl || pl.providerItemId;
      try {
        const r = await fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-album', albumUrl, bandId: pl.bandId, tralbumId: pl.tralbumId }),
        });
        const data = r.ok ? await r.json() : { tracks: [] };
        if (data.album) {
          if (data.album.label && !resolvedLabel) resolvedLabel = data.album.label;
          if (data.album.year && !resolvedYear) resolvedYear = String(data.album.year);
          if (data.album.artistName) {
            const m2 = splitCleanMetadata(data.album.title || cleanAlbumTitle, data.album.artistName, resolvedLabel || '');
            creator = m2.artist || creator;
            cleanAlbumTitle = m2.title || cleanAlbumTitle;
            if (m2.label && !resolvedLabel) resolvedLabel = m2.label;
          }
        }
        const now = Date.now();
        let resolvedPreorder = Boolean(data.isPreorder || data.album?.isPreorder);
        let fetched = (data.tracks || []).map((t, i) => {
          const isPlayable = t.playable !== false && !t.unplayable;
          return {
            id: `bc-${t.trackId || i}`,
            kind: 'track',
            provider: 'bandcamp',
            title: cleanTrackOrReleaseTitle(t.title, t.artistName || creator),
            artist: t.artistName || creator,
            artistName: t.artistName || creator,
            label: resolvedLabel || undefined,
            year: resolvedYear || undefined,
            album: cleanAlbumTitle,
            releaseTitle: cleanAlbumTitle,
            artworkUrl: t.artworkUrl || cover,
            cover: t.artworkUrl || cover,
            duration: t.duration || 0,
            streamUrl: t.streamUrl || '',
            audioUrl: t.streamUrl || '',
            url: t.streamUrl || t.trackUrl || '',
            trackUrl: t.trackUrl || albumUrl,
            albumUrl,
            providerItemId: t.trackUrl || albumUrl,
            streamFetchedAt: t.streamUrl ? now : undefined,
            playable: isPlayable,
            unplayable: !isPlayable,
          };
        });
        if (!fetched.length) {
          const r2 = await fetch('/api/bandcamp-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'album-tracks', url: albumUrl }),
          }).catch(() => null);
          const data2 = r2 && r2.ok ? await r2.json() : { tracks: [] };
          if (data2.label && !resolvedLabel) resolvedLabel = data2.label;
          if (data2.year && !resolvedYear) resolvedYear = String(data2.year);
          if (data2.isPreorder) resolvedPreorder = true;
          if (data2.artist) {
            const m3 = splitCleanMetadata(data2.albumTitle || cleanAlbumTitle, data2.artist, resolvedLabel || '');
            creator = m3.artist || creator;
            cleanAlbumTitle = m3.title || cleanAlbumTitle;
            if (m3.label && !resolvedLabel) resolvedLabel = m3.label;
          }
          fetched = (data2.tracks || []).map((t, i) => {
            const isPlayable = t.playable !== false && !t.unplayable;
            return {
              id: `bc-${t.trackId || t.trackNum || i}`,
              kind: 'track',
              provider: 'bandcamp',
              title: cleanTrackOrReleaseTitle(t.title, t.artist || t.artistName || creator),
              artist: t.artist || t.artistName || creator,
              artistName: t.artist || t.artistName || creator,
              label: resolvedLabel || undefined,
              year: resolvedYear || undefined,
              album: cleanAlbumTitle,
              releaseTitle: cleanAlbumTitle,
              artworkUrl: t.artworkUrl || cover,
              cover: t.artworkUrl || cover,
              duration: t.duration || 0,
              streamUrl: t.streamUrl || '',
              audioUrl: t.streamUrl || '',
              url: t.streamUrl || t.url || albumUrl,
              trackUrl: t.url || albumUrl,
              albumUrl,
              providerItemId: t.url || albumUrl,
              streamFetchedAt: t.streamUrl ? now : undefined,
              playable: isPlayable,
              unplayable: !isPlayable,
            };
          });
        }
        if (!fetched.length || (fetched.length <= 1 && !String(albumUrl).includes('/track/'))) {
          const nativeFetched = await fetchAccountLibrary('bandcamp', 'playlistTracks', { playlistUrl: albumUrl }).catch(() => []);
          if (Array.isArray(nativeFetched) && nativeFetched.length > fetched.length) {
            fetched = nativeFetched;
          }
        }
        if ((!Array.isArray(fetched) || !fetched.length) && (pl.kind === 'track' || String(albumUrl).includes('/track/'))) {
          fetched = [{
            id: pl.id || `bc-single-${now}`,
            kind: 'track',
            provider: 'bandcamp',
            title: cleanAlbumTitle,
            artist: creator,
            artistName: creator,
            label: resolvedLabel || undefined,
            year: resolvedYear || undefined,
            album: cleanAlbumTitle,
            releaseTitle: cleanAlbumTitle,
            artworkUrl: cover,
            cover,
            duration: pl.duration || 0,
            streamUrl: pl.streamUrl || '',
            audioUrl: pl.streamUrl || '',
            url: pl.streamUrl || albumUrl,
            trackUrl: albumUrl,
            albumUrl,
            providerItemId: albumUrl,
            playable: true,
            unplayable: false,
          }];
        }
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          pl.hasFullTracks = true;
          pl.label = resolvedLabel || pl.label;
          pl.year = resolvedYear || pl.year;
          pl.isPreorder = Boolean(resolvedPreorder || fetched.some(t => t.playable === false || t.unplayable));
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            pushToSheet(fetched);
          }
        }
      } catch (err) {
        // Sheet already opened with initialTracks
      }
      return;
    }

    if (!initialTracks.length && (pl.playlistId || pl.url || pl.trackUrl)) {
      try {
        const fetched = await fetchAccountLibrary(
          pl.provider || 'bandcamp',
          'playlistTracks',
          { playlistId: pl.playlistId, playlistUrl: pl.url || pl.trackUrl }
        );
        if (Array.isArray(fetched) && fetched.length > 0) {
          pl.tracks = fetched;
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            pushToSheet(fetched);
          }
        }
      } catch (err) {
        // Sheet already opened with initialTracks
      }
    }
  }

  const { pinnedItems, isItemHidden } = usePinnedAndHiddenContent();
  const visiblePinnedItems = useMemo(() => (pinnedItems || []).filter(it => !isItemHidden(it)), [pinnedItems, isItemHidden]);

  const lpTimerRef = useRef(null);
  const lpStartRef = useRef({ x: 0, y: 0 });
  const lpFiredRef = useRef(false);
  const clearLp = useCallback(() => {
    if (lpTimerRef.current) {
      clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    window.__kyoyuCancelActiveLongPress = clearLp;
    return () => {
      clearLp();
      if (window.__kyoyuCancelActiveLongPress === clearLp) {
        delete window.__kyoyuCancelActiveLongPress;
      }
    };
  }, [clearLp]);

  const bindLongPress = useCallback((itemPayload, onClickFn) => ({
    onTouchStart: (e) => {
      if (e?.target?.closest?.('[data-subtap]')) return;
      lpFiredRef.current = false;
      const t = e.touches?.[0];
      if (!t) return;
      lpStartRef.current = { x: t.clientX, y: t.clientY };
      clearLp();
      lpTimerRef.current = setTimeout(() => {
        if (window.__kyoyuLastHorizontalSwipeTs && Date.now() - window.__kyoyuLastHorizontalSwipeTs < 450) {
          return;
        }
        lpFiredRef.current = true;
        openContentActionCard(itemPayload);
      }, 460);
    },
    onTouchMove: (e) => {
      if (!lpTimerRef.current) return;
      const t = e.touches?.[0];
      if (!t) return;
      if (Math.abs(t.clientX - lpStartRef.current.x) > 8 || Math.abs(t.clientY - lpStartRef.current.y) > 8) {
        clearLp();
      }
    },
    onTouchEnd: (e) => {
      clearLp();
      if (lpFiredRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onTouchCancel: clearLp,
    onContextMenu: (e) => {
      if (e?.target?.closest?.('[data-subtap]')) return;
      e.preventDefault();
      e.stopPropagation();
      clearLp();
      lpFiredRef.current = true;
      openContentActionCard(itemPayload);
    },
    onClick: (e) => {
      if (e?.target?.closest?.('[data-subtap]')) return;
      const swipeRecent = window.__kyoyuLastHorizontalSwipeTs && Date.now() - window.__kyoyuLastHorizontalSwipeTs < 400;
      if (lpFiredRef.current || swipeRecent) {
        lpFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClickFn?.(e);
    },
  }), [clearLp]);

  // Group flat tracks into albums
  const publicAlbums = useMemo(() => groupByAlbum(publicReleases).filter(a => !isItemHidden(a)), [publicReleases, isItemHidden]);

  // Featured = albums with cover art (will be admin-curated via is_featured flag later)
  const featuredAlbums = useMemo(() => publicAlbums.filter(a => a.cover && !isItemHidden(a)), [publicAlbums, isItemHidden]);

  // Featured, Community & Bandcamp carousel state
  const featuredRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const communityHeroRef = useRef(null);
  const [activeCommunitySlide, setActiveCommunitySlide] = useState(0);
  const bandcampHeroRef = useRef(null);
  const [activeBcSlide, setActiveBcSlide] = useState(0);
  const [brokenCovers, setBrokenCovers] = useState({});
  const markCoverBroken = useCallback((url) => {
    if (!url) return;
    setBrokenCovers(prev => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  const [communityPosts, setCommunityPosts] = useState(() => {
    try {
      const raw = localStorage.getItem('kyoyu-community-posts-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const syncCommunity = () => {
      try {
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setCommunityPosts(parsed);
      } catch {}
    };
    window.__kyoyuPublishCommunityPost = (post) => {
      if (!post) return;
      try {
        const displayName =
          localStorage.getItem('kyoyu-profile-display-name') ||
          user?.displayName ||
          user?.user_metadata?.display_name ||
          user?.user_metadata?.username ||
          (user?.email ? user.email.split('@')[0] : '') ||
          post.sharedByName ||
          'You';
        const enrichedPost = {
          ...post,
          sharedByName: (!post.sharedByName || post.sharedByName === 'You') ? displayName : post.sharedByName,
          createdAt: post.createdAt || Date.now(),
        };
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        list = list.filter(x => !(
          String(x.entityType || '') === String(enrichedPost.entityType || '') &&
          String(x.title || '').toLowerCase() === String(enrichedPost.title || '').toLowerCase() &&
          String(x.artist || '').toLowerCase() === String(enrichedPost.artist || '').toLowerCase()
        ));
        list.unshift(enrichedPost);
        if (list.length > 60) list = list.slice(0, 60);
        localStorage.setItem('kyoyu-community-posts-v1', JSON.stringify(list));
        setCommunityPosts(list);
      } catch {}
    };
    window.addEventListener('kyoyu-community-posts-change', syncCommunity);
    window.addEventListener('storage', syncCommunity);
    return () => {
      window.removeEventListener('kyoyu-community-posts-change', syncCommunity);
      window.removeEventListener('storage', syncCommunity);
    };
  }, [user]);

  const [heroMetaMap, setHeroMetaMap] = useState(() => {
    try {
      const raw = localStorage.getItem(HERO_META_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const pendingHeroLookupsRef = useRef(new Set());

  // Enrich Featured, Community, and New on Bandcamp cards with cover, title, artist, label, releaseDate, location, and 100% complete formats
  useEffect(() => {
    let cancelled = false;
    const bcNewItems = (acct.bandcamp?.newStuff || []).slice(0, 18);
    const featItems = featuredAlbums.slice(0, 15);
    const commItems = (communityPosts || []).slice(0, 18);
    const candidates = [
      ...featItems.map(alb => ({
        key: String(alb.id || `${alb.artist || ''}|${alb.title || ''}`),
        title: alb.title || '',
        artist: alb.artist || '',
        label: alb.label || '',
        releaseDate: alb.releaseDate || '',
        location: alb.location || '',
        formats: alb.formats || [],
        cover: sanitizeArtworkUrl(alb.cover || '', alb.id, false),
        url: alb.url || alb.trackUrl || alb.tracks?.[0]?.trackUrl || '',
        entityType: 'album',
      })),
      ...commItems.map((post, idx) => {
        const displayRawTitle = post.album || post.title || '';
        const meta = splitCleanMetadata(displayRawTitle, post.artist || '', post.label || '');
        const url = post.albumUrl || post.url || '';
        return {
          key: String(post.postId || post.id || url || `comm-${idx}`),
          altUrlKey: url || '',
          title: meta.title || displayRawTitle,
          artist: meta.artist || post.artist || '',
          label: meta.label || post.label || '',
          releaseDate: post.releaseDate || '',
          location: post.location || '',
          formats: post.formats || [],
          cover: sanitizeArtworkUrl(post.cover || '', post.id, false),
          url,
          entityType: post.entityType || 'album',
        };
      }),
      ...bcNewItems.map((it, idx) => {
        const displayRawTitle = it.album || it.releaseTitle || it.title || '';
        const meta = splitCleanMetadata(displayRawTitle, it.artistName || it.artist || '', it.label || it.labelName || '');
        const url = it.albumUrl || it.trackUrl || it.url || '';
        return {
          key: String(it.id || url || `bc-new-${idx}`),
          altUrlKey: url || '',
          title: meta.title || displayRawTitle,
          artist: meta.artist || it.artistName || it.artist || '',
          label: meta.label || it.label || '',
          releaseDate: it.releaseDate || '',
          location: it.location || it.country || '',
          formats: it.formats || [],
          cover: sanitizeArtworkUrl(it.artworkUrl || it.cover || '', it.id, false),
          url,
          entityType: 'album',
        };
      }),
    ];

    const toFetch = candidates.filter(c => {
      if (!c.key || pendingHeroLookupsRef.current.has(c.key)) return false;
      const existing = heroMetaMap[c.key];
      if (existing && existing._complete) return false;
      return Boolean(c.title || c.url);
    });

    if (toFetch.length === 0) return;

    (async () => {
      const BATCH_SIZE = 10;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const updates = {};
        await Promise.all(batch.map(async (item) => {
          pendingHeroLookupsRef.current.add(item.key);
          let label = cleanHeroLabel(item.label, item.artist);
          let releaseDate = item.releaseDate || '';
          let location = item.location || '';
          let cover = item.cover || '';
          let cleanTitle = item.title || '';
          let cleanArtist = item.artist || '';
          const isArtistOrLabel = item.entityType === 'artist' || item.entityType === 'label';
          let formatsList = Array.isArray(item.formats) ? [...item.formats] : [];

          try {
            if (!isArtistOrLabel && item.url && item.url.includes('bandcamp.com')) {
              const bcRes = await fetch('/api/bandcamp-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'fetch-album', albumUrl: item.url }),
              }).then(r => r.ok ? r.json() : null).catch(() => null);
              if (bcRes?.album) {
                if (bcRes.album.artworkUrl) {
                  cover = sanitizeArtworkUrl(bcRes.album.artworkUrl, item.key, false) || cover;
                }
                if (bcRes.album.title || bcRes.album.artistName) {
                  const bcMeta = splitCleanMetadata(
                    bcRes.album.title || cleanTitle,
                    bcRes.album.artistName || cleanArtist,
                    bcRes.album.label || label
                  );
                  if (bcMeta.title) cleanTitle = bcMeta.title;
                  if (bcMeta.artist) cleanArtist = bcMeta.artist;
                }
                if (!label && bcRes.album.label) label = cleanHeroLabel(bcRes.album.label, cleanArtist);
                if (bcRes.album.releaseDate) releaseDate = bcRes.album.releaseDate;
                if (!location && bcRes.album.location) location = bcRes.album.location;
                if (Array.isArray(bcRes.album.formats) && bcRes.album.formats.length) {
                  formatsList.push(...bcRes.album.formats);
                }
              }
            }

            const hasSpecificVinylSize = formatsList.some(f => /\b(?:12|10|7)\s*(?:"|''|”|″|in(?:ch(?:es)?)?|-inch)|\b2xLP\b|\bVinyl LP\b/i.test(String(f || '')));
            if (!isArtistOrLabel && (!label || !location || !releaseDate || !cover || !hasSpecificVinylSize) && (cleanTitle || cleanArtist)) {
              const dcRes = await fetch('/api/discogs-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'track-info',
                  title: cleanTitle,
                  artist: cleanArtist,
                  album: cleanTitle,
                }),
              }).then(r => r.ok ? r.json() : null).catch(() => null);
              if (dcRes) {
                if (!cover && (dcRes.coverImage || dcRes.thumb)) {
                  cover = sanitizeArtworkUrl(dcRes.coverImage || dcRes.thumb, item.key, false);
                }
                if (!label) label = cleanHeroLabel(dcRes.labelName || dcRes.label || '', cleanArtist);
                if (!releaseDate && (dcRes.releaseDate || dcRes.year)) releaseDate = String(dcRes.releaseDate || dcRes.year);
                if (!location && (dcRes.country || dcRes.artistOrigin || dcRes.labelCountry)) {
                  location = String(dcRes.country || dcRes.artistOrigin || dcRes.labelCountry).trim();
                }
                if (Array.isArray(dcRes.formats) && dcRes.formats.length) {
                  formatsList.push(...dcRes.formats);
                }
              }
            }
          } catch (_) {}

          const entry = {
            title: cleanTitle,
            artist: cleanArtist,
            cover,
            label,
            releaseDate,
            location,
            formats: normalizeHeroFormats(formatsList, !isArtistOrLabel),
            _complete: true,
          };
          updates[item.key] = entry;
          if (item.altUrlKey) updates[item.altUrlKey] = entry;
        }));

        if (!cancelled && Object.keys(updates).length > 0) {
          setHeroMetaMap(prev => {
            const next = { ...prev, ...updates };
            try {
              localStorage.setItem(HERO_META_CACHE_KEY, JSON.stringify(next));
            } catch (_) {}
            return next;
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [featuredAlbums, communityPosts, acct.bandcamp?.newStuff]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track active slide on scroll
  const handleFeaturedScroll = useCallback(() => {
    const el = featuredRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveSlide(idx);
  }, []);

  const handleCommunityHeroScroll = useCallback(() => {
    const el = communityHeroRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveCommunitySlide(idx);
  }, []);

  const handleBcHeroScroll = useCallback(() => {
    const el = bandcampHeroRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 14;
    const idx = Math.round(scrollLeft / (cardWidth + gap));
    setActiveBcSlide(idx);
  }, []);

  // Load real public releases from prewarmed cache / backend
  useEffect(() => {
    if (_cachedPublicReleases.length > 0) {
      setPublicReleases(_cachedPublicReleases);
    }
    const onPub = (tracks) => setPublicReleases(tracks);
    _publicReleaseListeners.add(onPub);
    preloadHomeContent();
    return () => _publicReleaseListeners.delete(onPub);
  }, []);

  useEffect(() => {
    function loadUploads() {
      if (!user?.id) return;
      try {
        const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const hydrated = parsed.map(t => ({
            ...t,
            artworkUrl: localStorage.getItem(`kyoyu-art-${user.id}-${t.id}`) || t.artworkUrl || null,
          }));
          preloadImagesInMemory(hydrated, 60);
          setMyUploads(hydrated);
        } else {
          setMyUploads([]);
        }
      } catch {}
    }
    loadUploads();
    window.addEventListener('kyoyu-uploads-changed', loadUploads);
    return () => window.removeEventListener('kyoyu-uploads-changed', loadUploads);
  }, [user?.id]);

  const [playHistory, setPlayHistory] = useState(() => {
    try {
      const h = JSON.parse(localStorage.getItem('kyoyu-play-history') || '[]');
      preloadImagesInMemory(h, 40);
      return h;
    } catch (err) {
      return [];
    }
  });

  // Shelf filter state
  const [shelfFilter, setShelfFilter]   = useState('all');
  const [followingOnly, setFollowing]   = useState(false);
  const showFollowingToggle = shelfFilter === 'music' || shelfFilter === 'podcasts';

  // In-place expanded category state (infinite vertical scroll on Home page — once loaded, count stays in memory)
  const [expandedSectionKey, setExpandedSectionKey] = useState(null);
  const [expandedVisibleCount, setExpandedVisibleCount] = useState(45);
  const loadMoreSentinelRef = useRef(null);

  const toggleExpandSection = useCallback((sectionKey) => {
    setExpandedSectionKey((prev) => {
      if (prev === sectionKey) return null;
      const savedCount = _expandedVisibleCounts.get(sectionKey) || 45;
      setExpandedVisibleCount(savedCount);
      try {
        const pane = document.getElementById('kyoyu-tab-pane-0');
        if (pane) pane.scrollTo({ top: 0, behavior: 'smooth' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {}
      return sectionKey;
    });
  }, []);

  useEffect(() => {
    if (!expandedSectionKey) return;
    const bump = () => {
      setExpandedVisibleCount((c) => {
        const next = c + 36;
        _expandedVisibleCounts.set(expandedSectionKey, Math.max(_expandedVisibleCounts.get(expandedSectionKey) || 45, next));
        return next;
      });
    };
    const node = loadMoreSentinelRef.current;
    let observer = null;
    if (node && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            bump();
          }
        },
        { rootMargin: '800px 0px' }
      );
      observer.observe(node);
    }
    const pane = document.getElementById('kyoyu-tab-pane-0');
    const onScroll = () => {
      if (pane) {
        if (pane.scrollHeight > 0 && pane.scrollHeight - (pane.scrollTop + pane.clientHeight) < 800) {
          bump();
        }
        return;
      }
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement?.scrollHeight || document.body?.scrollHeight || 0;
      if (docHeight > 0 && docHeight - scrollBottom < 800) {
        bump();
      }
    };
    const scrollTarget = pane || window;
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (observer) observer.disconnect();
      scrollTarget.removeEventListener('scroll', onScroll);
    };
  }, [expandedSectionKey, expandedVisibleCount]);

  // Decide which sections to render per filter
  const f = shelfFilter;
  const showFeatured    = f === 'all' || f === 'music';
  const showReleases    = f === 'all' || f === 'music';

  return (
    <div className="page home-page animate-in">

      {/* ── Filter bar ── */}
      <section className="home-section mymusic-section">
        <div className="shelf-filter-bar">
          <div className="shelf-filters">
            {[
              { key: 'all',     label: 'All'      },
              { key: 'music',   label: 'Music'    },
              { key: 'podcasts', label: 'Podcasts' },
              { key: 'merch',   label: 'Merch'    },
            ].map(({ key, label }) => (
              <button
                key={key}
                data-home-filter={key}
                className={`shelf-filter-btn${shelfFilter === key ? ' active' : ''}`}
                onClick={() => { setShelfFilter(key); setFollowing(false); setExpandedSectionKey(null); }}
              >
                {label}
              </button>
            ))}
          </div>
          {showFollowingToggle && (
            <button
              className={`shelf-following-btn${followingOnly ? ' active' : ''}`}
              onClick={() => { setFollowing(f => !f); setExpandedSectionKey(null); }}
            >
              Following
            </button>
          )}
        </div>
      </section>

      {/* ═══ 1 — FEATURED CONTENT CAROUSEL ═══ */}
      {showFeatured && featuredAlbums.length > 0 && (!expandedSectionKey || expandedSectionKey === 'featured') && (
        <section className="home-section featured-hero-section">
          <div className="section-title">
            <span onClick={() => toggleExpandSection('featured')} style={{ cursor: 'pointer' }}>
              {expandedSectionKey === 'featured' ? '← Featured' : 'Featured'}
            </span>
            {expandedSectionKey === 'featured' && (
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{featuredAlbums.length}</span>
            )}
          </div>

          {expandedSectionKey === 'featured' ? (
            <>
              <div className={`upl-grid upl-grid-${homeLayout.cols || 3}`}>
                {featuredAlbums.slice(0, expandedVisibleCount).map((album) => {
                  const metaKey = `${(album.artist || '').toLowerCase()}::${(album.title || '').toLowerCase()}`;
                  const rich = heroMetaMap[album.id] || heroMetaMap[metaKey] || {};
                  const rawCov = album.cover || rich.cover || '';
                  const cleanCover = rawCov ? pinImageInMemory(rawCov, album.id) : '';
                  const showCover = cleanCover && !brokenCovers[cleanCover]
                    ? cleanCover
                    : (rich.cover && !brokenCovers[rich.cover] ? rich.cover : '');
                  return (
                    <div
                      key={album.id}
                      role="button"
                      tabIndex={0}
                      className="upl-grid-cell"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      {...bindLongPress({
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        artworkUrl: showCover || album.cover,
                        provider: 'kyoyu',
                        kind: 'album',
                        url: album.url || album.trackUrl || '',
                      }, () => {
                        if (album.id.startsWith('single::') && album.tracks?.length === 1) {
                          playTrack(album.tracks[0]);
                        } else {
                          setSelectedAlbum(openNativeAlbumFast(album));
                        }
                      })}
                    >
                      <div className="upl-grid-art">
                        {showCover
                          ? <img src={showCover} alt={album.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                          : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2} /></div>}
                      </div>
                      <div className="upl-grid-title">{album.title}</div>
                      <div
                        className="upl-grid-artist"
                        data-subtap={album.artist ? 'artist' : undefined}
                        onTouchStart={album.artist ? (e) => e.stopPropagation() : undefined}
                        onTouchEnd={album.artist ? (e) => e.stopPropagation() : undefined}
                        onPointerDown={album.artist ? (e) => e.stopPropagation() : undefined}
                        onClick={album.artist ? (e) => openArtistFromHomeTap(e, album.artist, album) : undefined}
                      >
                        {album.artist}
                      </div>
                    </div>
                  );
                })}
              </div>
              {expandedVisibleCount < featuredAlbums.length && (
                <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
              )}
            </>
          ) : (
            <>
              <HeroSwipeRow sectionKey="hero-featured" itemCount={featuredAlbums.length}>
                {featuredAlbums.map((album) => {
                  const metaKey = `${(album.artist || '').toLowerCase()}::${(album.title || '').toLowerCase()}`;
                  const rich = heroMetaMap[album.id] || heroMetaMap[metaKey] || {};
                  const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
                  const richCover = rich.cover ? pinImageInMemory(rich.cover, album.id) : '';
                  const showCover = (cleanCover && !brokenCovers[cleanCover])
                    ? cleanCover
                    : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                  const labelStr = cleanHeroLabel(album.label || rich.label || '', album.artist, album.title);
                  const releaseDateStr = formatHeroReleaseDate(album.releaseDate || rich.releaseDate || album.year || '', album.releaseTimestamp);
                  const locationStr = String(album.location || rich.location || album.country || '').trim();
                  const rawHeroFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                    ? rich.formats
                    : (typeof rich.formats === 'string' && rich.formats.trim() ? rich.formats : album.formats);
                  const formatsList = normalizeHeroFormats(rawHeroFormats, true);
                  const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                  return (
                    <div
                      key={album.id}
                      role="button"
                      tabIndex={0}
                      className="featured-hero-card"
                      {...bindLongPress({
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        artworkUrl: showCover || album.cover,
                        provider: 'kyoyu',
                        kind: 'album',
                        url: album.url || album.trackUrl || '',
                      }, () => {
                        if (album.id.startsWith('single::') && album.tracks?.length === 1) {
                          playTrack(album.tracks[0]);
                        } else {
                          setSelectedAlbum(openNativeAlbumFast({
                            ...album,
                            cover: showCover || album.cover,
                            label: labelStr || album.label,
                            releaseDate: releaseDateStr || album.releaseDate,
                            location: locationStr || album.location,
                            formats: formatsList,
                          }));
                        }
                      })}
                    >
                      {/* Cover art */}
                      <div className="featured-hero-art">
                        {showCover
                          ? <img src={showCover} alt={album.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                          : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                      </div>

                      {/* Info on the right of artwork: 1. Album, 2. Artist, 3. Label, 4. Release Date, 5. Location, 6. Formats */}
                      <div className="featured-hero-info">
                        <HeroMarqueeRow className="featured-hero-title">{album.title}</HeroMarqueeRow>
                        <HeroMarqueeRow
                          className="featured-hero-artist"
                          onClick={album.artist ? (e) => openArtistFromHomeTap(e, album.artist, album) : undefined}
                        >
                          {album.artist}
                        </HeroMarqueeRow>
                        {labelStr && (
                          <HeroMarqueeRow
                            className="featured-hero-label"
                            onClick={(e) => openLabelFromHomeTap(e, labelStr, album)}
                          >
                            {labelStr}
                          </HeroMarqueeRow>
                        )}
                        {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                        {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                        <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                      </div>
                    </div>
                  );
                })}
              </HeroSwipeRow>
            </>
          )}
        </section>
      )}

      {/* ═══ 1.05 — PINNED CONTENT (UNDER FEATURED) ═══ */}
      {showFeatured && visiblePinnedItems.length > 0 && (!expandedSectionKey || expandedSectionKey === 'home-pinned') && (() => {
        const mappedPinned = visiblePinnedItems.map(p => ({
          id: p.id,
          kind: p.type === 'playlist' ? 'playlist' : p.type === 'track' ? 'track' : 'album',
          provider: p.provider || 'bandcamp',
          title: p.title || 'Untitled',
          artistName: p.artist || '',
          artist: p.artist || '',
          artworkUrl: p.artwork || '',
          cover: p.artwork || '',
          url: p.url || '',
          trackUrl: p.url || '',
        }));
        const pinCols = homeLayout.cols || HOME_TITLES_PER_ROW;
        const pinViewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        const pinRows = homeSectionRows?.['home-pinned'] ?? DEFAULT_HOME_SECTION_ROWS;
        const pinPageSize = Math.max(0, Number(pinRows) || 0) * (pinViewMode === 'list' ? HOME_TITLES_PER_ROW : pinCols);
        const pinPages = [];
        if (pinPageSize > 0) {
          for (let i = 0; i < mappedPinned.length; i += pinPageSize) {
            pinPages.push(mappedPinned.slice(i, i + pinPageSize));
          }
        }
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-pinned')} style={{ cursor: 'pointer' }}>
                {expandedSectionKey === 'home-pinned' ? '← Pinned' : 'Pinned'}
              </span>
              {expandedSectionKey === 'home-pinned' && (
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{mappedPinned.length}</span>
              )}
            </div>
            {expandedSectionKey === 'home-pinned' ? (
              <>
                <AccountItemList
                  items={mappedPinned.slice(0, expandedVisibleCount)}
                  view={pinViewMode}
                  cols={pinCols}
                  onOpenPlaylist={openPlaylistSheet}
                />
                {expandedVisibleCount < mappedPinned.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : pinPages.length <= 1 ? (
              <AccountItemList
                items={pinPages[0] || mappedPinned}
                view={pinViewMode}
                cols={pinCols}
                onOpenPlaylist={openPlaylistSheet}
              />
            ) : (
              <CatalogSwipeRow
                sectionKey="home-pinned"
                pages={pinPages}
                renderPage={(pageItems) => (
                  <AccountItemList
                    items={pageItems}
                    view={pinViewMode}
                    cols={pinCols}
                    onOpenPlaylist={openPlaylistSheet}
                  />
                )}
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 1.1 — PLAYLISTS (3 PER ROW ICON VIEW, ORDERED MOST RECENT VIEWED / EDITED / PLAYED FIRST) ═══ */}
      {showFeatured && (!expandedSectionKey || expandedSectionKey === 'home-playlists') && (() => {
        const localMapped = (playlists || []).map(p => {
          const trackList = Array.isArray(p.tracks) ? p.tracks : [];
          const coverUrl = (p.cover && p.cover !== '/album1.png')
            ? p.cover
            : (trackList[0]?.cover || trackList[0]?.artworkUrl || trackList[0]?.releaseCover || '');
          const prov = p.provider || (Array.isArray(p.providers) && p.providers[0]) || '';
          return {
            ...p,
            id: p.id,
            kind: 'playlist',
            provider: prov,
            title: p.title || p.name || 'Untitled',
            artworkUrl: coverUrl,
            cover: coverUrl,
            artistName: `${trackList.length} ${trackList.length === 1 ? 'track' : 'tracks'}`,
            trackCount: trackList.length,
            tracks: trackList,
          };
        });

        const seenIds = new Set(localMapped.map(p => String(p.id)));
        const seenProvTitle = new Set(
          localMapped.map(p => `${String(p.provider || '').toLowerCase()}::${String(p.title || '').trim().toLowerCase()}`)
        );
        const remoteMapped = [];
        const provOrder = Array.isArray(providerPriority) && providerPriority.length
          ? providerPriority
          : ['bandcamp', 'soundcloud', 'youtube', 'spotify', 'applemusic', 'tidal'];

        for (const provKey of provOrder) {
          const provList = acct?.[provKey]?.playlists;
          if (!Array.isArray(provList)) continue;
          for (const r of provList) {
            if (!r) continue;
            const rid = String(r.id || r.playlistId || '');
            const rTitleKey = `${provKey}::${String(r.title || r.name || '').trim().toLowerCase()}`;
            if ((rid && seenIds.has(rid)) || ((r.title || r.name) && seenProvTitle.has(rTitleKey))) continue;
            if (rid) seenIds.add(rid);
            seenProvTitle.add(rTitleKey);
            const tCount = typeof r.trackCount === 'number'
              ? r.trackCount
              : (Array.isArray(r.tracks) ? r.tracks.length : 0);
            const artUrl = r.artworkUrl || r.cover || (r.tracks?.[0]?.artworkUrl || r.tracks?.[0]?.cover || '');
            remoteMapped.push({
              ...r,
              id: rid || `${provKey}-pl-${remoteMapped.length}`,
              kind: 'playlist',
              provider: r.provider || provKey,
              title: r.title || r.name || 'Untitled',
              artworkUrl: artUrl,
              cover: artUrl,
              artistName: r.artistName || `${tCount} ${tCount === 1 ? 'track' : 'tracks'}`,
              trackCount: tCount,
            });
          }
        }

        const act = playlistActivity || {};
        const getPlaylistRecency = (pl) => {
          const pid = String(pl.id || pl.playlistId || '').trim();
          const ptitle = String(pl.title || pl.name || '').trim().toLowerCase();
          const purl = String(pl.url || pl.trackUrl || '').trim();
          const idMatch = pid.match(/^pl-(\d{10,15})$/);
          const createdFromId = idMatch ? Number(idMatch[1]) : 0;
          return Math.max(
            Number(pid && act[pid]) || 0,
            Number(ptitle && act[`title::${ptitle}`]) || 0,
            Number(purl && act[`url::${purl}`]) || 0,
            Number(pl.updatedAt) || 0,
            Number(pl.lastModified) || 0,
            Number(pl.playedAt) || 0,
            Number(pl.viewedAt) || 0,
            Number(pl.createdAt) || 0,
            createdFromId
          );
        };

        const allPlaylists = [...localMapped, ...remoteMapped].sort((a, b) => {
          const diff = getPlaylistRecency(b) - getPlaylistRecency(a);
          return diff !== 0 ? diff : 0;
        });

        const plCols = homeLayout.cols || HOME_TITLES_PER_ROW;
        const plViewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        const plRows = homeSectionRows?.['home-playlists'] ?? DEFAULT_HOME_SECTION_ROWS;
        const plPageSize = Math.max(0, Number(plRows) || 0) * (plViewMode === 'list' ? HOME_TITLES_PER_ROW : plCols);
        if (allPlaylists.length === 0 || plPageSize <= 0) return null;

        if (expandedSectionKey === 'home-playlists') {
          const visibleItems = allPlaylists.slice(0, expandedVisibleCount);
          return (
            <section className="home-section">
              <div className="section-title">
                <span onClick={() => toggleExpandSection('home-playlists')} style={{ cursor: 'pointer' }}>
                  ← Playlists
                </span>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  {allPlaylists.length}
                </span>
              </div>
              <AccountItemList items={visibleItems} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
              {expandedVisibleCount < allPlaylists.length && (
                <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
              )}
            </section>
          );
        }

        const plPages = [];
        for (let i = 0; i < allPlaylists.length; i += plPageSize) {
          plPages.push(allPlaylists.slice(i, i + plPageSize));
        }

        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-playlists')} style={{ cursor: 'pointer' }}>Playlists</span>
            </div>
            {plPages.length <= 1 ? (
              <AccountItemList items={plPages[0] || []} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
            ) : (
              <CatalogSwipeRow
                sectionKey="home-playlists"
                pages={plPages}
                renderPage={(pageItems) => (
                  <AccountItemList items={pageItems} view={plViewMode} cols={plCols} onOpenPlaylist={openPlaylistSheet} />
                )}
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 1.15 — COMMUNITY (FAN-TO-FAN SHARES: ALBUMS, TITLES, ARTISTS & LABELS — UNDER PLAYLISTS, ABOVE NEW ON BANDCAMP) ═══ */}
      {showFeatured && (!expandedSectionKey || expandedSectionKey === 'home-community') && (() => {
        const currentUserName =
          localStorage.getItem('kyoyu-profile-display-name') ||
          user?.displayName ||
          user?.user_metadata?.display_name ||
          user?.user_metadata?.username ||
          (user?.email ? user.email.split('@')[0] : '') ||
          'You';

        const userPosts = (communityPosts || [])
          .filter(p => p && !p.isNativeUpload && !String(p.postId || '').startsWith('seed-comm-'))
          .map(p => ({
            ...p,
            sharedByName: (!p.sharedByName || p.sharedByName === 'You') ? currentUserName : p.sharedByName,
          }));

        const seenCommKeys = new Set();
        const allCommunityItems = [];
        for (const item of userPosts) {
          const k = `${String(item.entityType || 'album').toLowerCase()}|${String(item.title || '').toLowerCase()}|${String(item.artist || '').toLowerCase()}`;
          if (seenCommKeys.has(k)) continue;
          seenCommKeys.add(k);
          allCommunityItems.push(item);
        }

        if (allCommunityItems.length === 0) return null;

        return (
          <section className="home-section featured-hero-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('home-community')} style={{ cursor: 'pointer' }}>
                {expandedSectionKey === 'home-community' ? '← Community' : 'Community'}
              </span>
            </div>
            <HeroSwipeRow sectionKey="hero-community" itemCount={Math.min(18, allCommunityItems.length)}>
              {allCommunityItems.slice(0, 18).map((post, idx) => {
                const entityType = String(post.entityType || 'album').toLowerCase();
                const releaseUrl = post.albumUrl || post.url || '';
                const lookupKey = String(post.postId || post.id || releaseUrl || `comm-${idx}`);
                const rich = heroMetaMap[lookupKey] || (releaseUrl ? heroMetaMap[releaseUrl] : null) || {};
                const displayRawTitle = post.album || post.title || '';
                const meta = splitCleanMetadata(
                  rich.title || displayRawTitle,
                  rich.artist || post.artist || '',
                  rich.label || post.label || ''
                );
                const displayTitle = entityType === 'artist' || entityType === 'label'
                  ? (post.title || post.artist || post.label || 'Untitled')
                  : (meta.title || rich.title || displayRawTitle || 'Untitled');
                const displayArtist = entityType === 'artist'
                  ? 'Artist'
                  : entityType === 'label'
                    ? 'Label'
                    : (meta.artist || rich.artist || post.artist || '');
                const rawCover = post.cover || rich.cover || '';
                const cleanCover = rawCover ? pinImageInMemory(rawCover, lookupKey) : '';
                const richCover = rich.cover ? pinImageInMemory(rich.cover, `${lookupKey}-rich`) : '';
                const showCover = (cleanCover && !brokenCovers[cleanCover])
                  ? cleanCover
                  : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                const showLabel = entityType === 'artist' || entityType === 'label'
                  ? cleanHeroLabel(post.label || '', '', '')
                  : cleanHeroLabel(meta.label || rich.label || post.label || '', displayArtist, displayTitle);
                const releaseDateStr = formatHeroReleaseDate(post.releaseDate || rich.releaseDate || '', post.createdAt);
                const locationStr = String(post.location || rich.location || '').trim();
                const rawFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                  ? rich.formats
                  : (post.formats || (entityType === 'artist' ? ['Artist'] : entityType === 'label' ? ['Label'] : []));
                const formatsList = normalizeHeroFormats(rawFormats, entityType !== 'artist' && entityType !== 'label');
                const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                const sharerName = post.sharedByName || currentUserName;

                return (
                  <div
                    key={lookupKey}
                    role="button"
                    tabIndex={0}
                    className="featured-hero-card"
                    {...bindLongPress({
                      id: post.id || lookupKey,
                      title: displayTitle,
                      artist: displayArtist,
                      artworkUrl: showCover || post.cover,
                      provider: post.provider || 'bandcamp',
                      kind: entityType,
                      url: releaseUrl,
                    }, () => {
                      if (entityType === 'artist') {
                        const aName = post.artist || post.title || '';
                        if (window.__kyoyuOpenArtist) {
                          window.__kyoyuOpenArtist(aName);
                        } else {
                          try {
                            window.webkit?.messageHandlers?.player?.postMessage({
                              openArtist: true,
                              artistName: aName,
                            });
                          } catch {}
                        }
                      } else if (entityType === 'label') {
                        const lName = post.label || post.title || '';
                        if (window.__kyoyuOpenLabel) {
                          window.__kyoyuOpenLabel(lName);
                        } else {
                          try {
                            window.webkit?.messageHandlers?.player?.postMessage({
                              openLabel: true,
                              labelName: lName,
                            });
                          } catch {}
                        }
                      } else if (Array.isArray(post.tracks) && post.tracks.length > 0 && !releaseUrl.includes('bandcamp.com')) {
                        setSelectedAlbum(openNativeAlbumFast({
                          ...post,
                          id: post.id || lookupKey,
                          title: displayTitle,
                          artist: displayArtist,
                          cover: showCover || post.cover,
                          label: showLabel || post.label,
                          releaseDate: releaseDateStr || post.releaseDate,
                          location: locationStr || post.location,
                          formats: formatsList,
                        }));
                      } else {
                        openPlaylistSheet({
                          ...post,
                          kind: 'album',
                          title: displayTitle,
                          artistName: displayArtist,
                          artworkUrl: showCover || post.cover,
                          cover: showCover || post.cover,
                          label: showLabel || post.label,
                          releaseDate: releaseDateStr || post.releaseDate,
                          location: locationStr || post.location,
                          formats: formatsList,
                          url: releaseUrl,
                          trackUrl: releaseUrl,
                        });
                      }
                    })}
                  >
                    <div className="featured-hero-art">
                      {showCover
                        ? <img src={showCover} alt={displayTitle} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                        : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                    </div>
                    <div className="featured-hero-info">
                      <HeroMarqueeRow className="featured-hero-title">{displayTitle}</HeroMarqueeRow>
                      {displayArtist && (
                        <HeroMarqueeRow
                          className="featured-hero-artist"
                          onClick={entityType !== 'artist' && entityType !== 'label' ? (e) => openArtistFromHomeTap(e, displayArtist, { ...post, url: releaseUrl, title: displayTitle }) : undefined}
                        >
                          {displayArtist}
                        </HeroMarqueeRow>
                      )}
                      {showLabel && entityType !== 'label' && (
                        <HeroMarqueeRow
                          className="featured-hero-label"
                          onClick={(e) => openLabelFromHomeTap(e, showLabel, { ...post, url: releaseUrl })}
                        >
                          {showLabel}
                        </HeroMarqueeRow>
                      )}
                      {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                      {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                      <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                      <HeroMarqueeRow className="featured-hero-sharer">Shared by {sharerName}</HeroMarqueeRow>
                    </div>
                  </div>
                );
              })}
            </HeroSwipeRow>
          </section>
        );
      })()}

      {/* ═══ 1.2 — LIBRARY PER PROVIDER: NEW STUFF, COLLECTION / LIKES, WISHLIST & PLAYLISTS (SWIPEABLE PAGES OF N ROWS × 3 TITLES) ═══ */}
      {showFeatured && (() => {
        const activeHomeCols = homeLayout.mode === 'list' ? HOME_TITLES_PER_ROW : (homeLayout.cols || HOME_TITLES_PER_ROW);
        const limitFor = (sectionKey) => {
          const rows = homeSectionRows?.[sectionKey] ?? DEFAULT_HOME_SECTION_ROWS;
          return Math.max(0, Number(rows) || 0) * activeHomeCols;
        };

        const likedUploads = getLikedUploads(user?.id) || [];
        const ytLocalLikes = likedUploads.filter(t => {
          const p = historyReplayInfo(t).provider || t.provider || '';
          return p === 'youtube' || String(t.id || '').startsWith('yt-');
        });
        const ytAcctLikes = acct.youtube?.likes || [];
        const mergeProviderPlaylists = (remoteList, provKey) => {
          const base = Array.isArray(remoteList) ? remoteList : [];
          const localMatching = (playlists || [])
            .filter(p => p.provider === provKey || (Array.isArray(p.providers) && p.providers.includes(provKey)))
            .filter(p => !base.some(r => String(r.title || '').trim().toLowerCase() === String(p.title || '').trim().toLowerCase()))
            .map(p => ({
              ...p,
              kind: 'playlist',
              provider: provKey,
              artworkUrl: (p.cover && p.cover !== '/album1.png') ? p.cover : (p.tracks?.[0]?.cover || ''),
              artistName: `${p.tracks?.length || 0} tracks`,
            }));
          return [...localMatching, ...base];
        };
        const ytPlaylists = mergeProviderPlaylists(acct.youtube?.playlists || [], 'youtube');

        const sectionsByProvider = {
          bandcamp: [
            { key: 'bandcamp-new',  title: 'New on Bandcamp',       provider: 'bandcamp', category: 'newStuff',  items: acct.bandcamp?.newStuff || [],   pageSize: limitFor('bandcamp-new'),  type: 'acct' },
            { key: 'bandcamp-col',  title: 'Bandcamp · Collection', provider: 'bandcamp', category: 'purchases', items: acct.bandcamp?.collection || [], pageSize: limitFor('bandcamp-col'),  type: 'acct' },
            { key: 'bandcamp-wish', title: 'Bandcamp · Wishlist',   provider: 'bandcamp', category: 'wishlist',  items: acct.bandcamp?.wishlist || [],   pageSize: limitFor('bandcamp-wish'), type: 'acct' },
            { key: 'bandcamp-pl',   title: 'Bandcamp · Playlists',  provider: 'bandcamp', category: 'playlists', items: mergeProviderPlaylists(acct.bandcamp?.playlists || [], 'bandcamp'), pageSize: limitFor('bandcamp-pl'), type: 'acct' },
          ],
          discogs: [
            { key: 'discogs-new',   title: 'Discogs · New Stuff',   provider: 'discogs',  category: 'newStuff',  items: acct.discogs?.newStuff || [],    pageSize: limitFor('discogs-new'),   type: 'acct' },
            { key: 'discogs-col',   title: 'Discogs · Collection',  provider: 'discogs',  category: 'purchases', items: acct.discogs?.collection || [],  pageSize: limitFor('discogs-col'),   type: 'acct' },
            { key: 'discogs-wish',  title: 'Discogs · Wishlist',    provider: 'discogs',  category: 'wishlist',  items: acct.discogs?.wishlist || [],    pageSize: limitFor('discogs-wish'),  type: 'acct' },
          ],
          soundcloud: [
            { key: 'soundcloud-new',   title: 'SoundCloud · New Stuff', provider: 'soundcloud', category: 'newStuff',  items: acct.soundcloud?.newStuff || [],  pageSize: limitFor('soundcloud-new'),   type: 'acct' },
            { key: 'soundcloud-likes', title: 'SoundCloud · Likes',     provider: 'soundcloud', category: 'titles',    items: acct.soundcloud?.likes || [],     pageSize: limitFor('soundcloud-likes'), type: 'acct' },
            { key: 'soundcloud-pl',    title: 'SoundCloud · Playlists', provider: 'soundcloud', category: 'playlists', items: mergeProviderPlaylists(acct.soundcloud?.playlists || [], 'soundcloud'), pageSize: limitFor('soundcloud-pl'), type: 'acct' },
          ],
          youtube: [
            { key: 'youtube-new',   title: 'YouTube · New Stuff', provider: 'youtube', category: 'newStuff',  items: acct.youtube?.newStuff || [],                        pageSize: limitFor('youtube-new'),   type: 'acct' },
            { key: 'youtube-likes', title: 'YouTube · Likes',     provider: 'youtube', category: 'titles',    items: ytAcctLikes.length > 0 ? ytAcctLikes : ytLocalLikes, pageSize: limitFor('youtube-likes'), type: ytAcctLikes.length > 0 ? 'acct' : 'uploads' },
            { key: 'youtube-pl',    title: 'YouTube · Playlists', provider: 'youtube', category: 'playlists', items: ytPlaylists,                                         pageSize: limitFor('youtube-pl'),    type: 'acct' },
          ],
          spotify: [
            { key: 'spotify-new',   title: 'Spotify · New Stuff', provider: 'spotify', category: 'newStuff',  items: acct.spotify?.newStuff || [],  pageSize: limitFor('spotify-new'),   type: 'acct' },
            { key: 'spotify-likes', title: 'Spotify · Likes',     provider: 'spotify', category: 'titles',    items: acct.spotify?.likes || [],     pageSize: limitFor('spotify-likes'), type: 'acct' },
            { key: 'spotify-pl',    title: 'Spotify · Playlists', provider: 'spotify', category: 'playlists', items: mergeProviderPlaylists(acct.spotify?.playlists || [], 'spotify'), pageSize: limitFor('spotify-pl'), type: 'acct' },
          ],
          applemusic: [
            { key: 'applemusic-new',   title: 'Apple Music · New Stuff', provider: 'applemusic', category: 'newStuff',  items: acct.applemusic?.newStuff || [],  pageSize: limitFor('applemusic-new'),   type: 'acct' },
            { key: 'applemusic-likes', title: 'Apple Music · Likes',     provider: 'applemusic', category: 'titles',    items: acct.applemusic?.likes || [],     pageSize: limitFor('applemusic-likes'), type: 'acct' },
            { key: 'applemusic-pl',    title: 'Apple Music · Playlists', provider: 'applemusic', category: 'playlists', items: mergeProviderPlaylists(acct.applemusic?.playlists || [], 'applemusic'), pageSize: limitFor('applemusic-pl'), type: 'acct' },
          ],
          tidal: [
            { key: 'tidal-new',   title: 'TIDAL · New Stuff', provider: 'tidal', category: 'newStuff',  items: acct.tidal?.newStuff || [],  pageSize: limitFor('tidal-new'),   type: 'acct' },
            { key: 'tidal-likes', title: 'TIDAL · Likes',     provider: 'tidal', category: 'titles',    items: acct.tidal?.likes || [],     pageSize: limitFor('tidal-likes'), type: 'acct' },
            { key: 'tidal-pl',    title: 'TIDAL · Playlists', provider: 'tidal', category: 'playlists', items: mergeProviderPlaylists(acct.tidal?.playlists || [], 'tidal'), pageSize: limitFor('tidal-pl'), type: 'acct' },
          ],
        };

        const orderedSections = providerPriority
          .flatMap(p => sectionsByProvider[p] || [])
          .filter(s => s && s.pageSize > 0 && s.items.length > 0 && (!followingOnly || s.category === 'newStuff'))
          .filter(s => !expandedSectionKey || expandedSectionKey === s.key);

        if (orderedSections.length === 0) return null;

        const viewMode = homeLayout.mode === 'list' ? 'list' : 'grid';
        const gridCols = homeLayout.cols || 3;

        return (
          <>
            {orderedSections.map(sec => {
              const isExpanded = expandedSectionKey === sec.key;
              if (isExpanded) {
                const visibleItems = sec.items.slice(0, expandedVisibleCount);
                return (
                  <section key={sec.key} className="home-section">
                    <div className="section-title">
                      <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>
                        ← {sec.title}
                      </span>
                      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {sec.items.length}
                      </span>
                    </div>
                    {sec.type === 'uploads' ? (
                      viewMode === 'list'
                        ? <UploadExpandedList uploads={visibleItems} />
                        : <UploadGridView uploads={visibleItems} cols={gridCols} />
                    ) : (
                      <AccountItemList items={visibleItems} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                    )}
                    {expandedVisibleCount < sec.items.length && (
                      <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                    )}
                  </section>
                );
              }

              // Render "New on Bandcamp" using the Featured hero carousel layout (featuring new releases/albums from followings)
              if (sec.key === 'bandcamp-new') {
                const sortedBcReleases = [...(sec.items || [])].filter(it => !isItemHidden(it)).sort((a, b) => {
                  const ua = String(a.albumUrl || a.trackUrl || a.url || '');
                  const ub = String(b.albumUrl || b.trackUrl || b.url || '');
                  const isAlbA = a.kind === 'album' || ua.includes('/album/') ? 1 : 0;
                  const isAlbB = b.kind === 'album' || ub.includes('/album/') ? 1 : 0;
                  const tsA = Number(a.releaseTimestamp || 0);
                  const tsB = Number(b.releaseTimestamp || 0);
                  if (tsA && tsB && tsA !== tsB) return tsB - tsA;
                  if (isAlbA !== isAlbB) return isAlbB - isAlbA;
                  const yrA = parseInt(a.year, 10) || 0;
                  const yrB = parseInt(b.year, 10) || 0;
                  if (yrA !== yrB) return yrB - yrA;
                  return 0;
                });
                const bcHeroItems = sortedBcReleases.slice(0, sec.pageSize || 9);
                return (
                  <section key={sec.key} className="home-section">
                    <div className="section-title">
                      <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>{sec.title}</span>
                    </div>
                    <HeroSwipeRow sectionKey="hero-bandcamp-new" itemCount={bcHeroItems.length}>
                      {bcHeroItems.map((it, idx) => {
                        const releaseUrl = it.albumUrl || it.trackUrl || it.url || '';
                        const rawTitleCandidate = it.album || it.releaseTitle || it.title || '';
                        const prelimMeta = splitCleanMetadata(rawTitleCandidate, it.artistName || it.artist || '', it.label || it.labelName || '');
                        const prelimKey = `${(prelimMeta.artist || '').toLowerCase()}::${(prelimMeta.title || '').toLowerCase()}`;
                        const rich = (releaseUrl && heroMetaMap[releaseUrl]) || (it.id && heroMetaMap[it.id]) || heroMetaMap[prelimKey] || {};
                        const displayRawTitle = (rich.title && (/^[A-Z]{1,8}\s*[-#.]?\s*\d{1,5}[A-Z]?$/i.test(prelimMeta.title) || !prelimMeta.title))
                          ? rich.title
                          : (rawTitleCandidate || rich.title || '');
                        const displayRawArtist = prelimMeta.artist || rich.artist || it.artistName || it.artist || '';
                        const meta = splitCleanMetadata(displayRawTitle, displayRawArtist, it.label || it.labelName || rich.label || '');
                        const albumTitle = meta.title || rich.title || displayRawTitle || it.title || '';
                        const artistDisplay = meta.artist || rich.artist || it.artistName || it.artist || '';
                        const rawCover = it.artworkUrl || it.cover || rich.cover || '';
                        const cleanCover = rawCover ? pinImageInMemory(rawCover, it.id || `bc-new-${idx}`) : '';
                        const richCover = rich.cover ? pinImageInMemory(rich.cover, `${it.id || `bc-new-${idx}`}-rich`) : '';
                        const showCover = (cleanCover && !brokenCovers[cleanCover])
                          ? cleanCover
                          : ((richCover && !brokenCovers[richCover]) ? richCover : '');
                        const showLabel = cleanHeroLabel(meta.label || rich.label || it.label || it.labelName || '', artistDisplay, albumTitle);
                        const releaseDateStr = formatHeroReleaseDate(it.releaseDate || rich.releaseDate || it.year || '', it.releaseTimestamp);
                        const locationStr = String(it.location || rich.location || it.country || '').trim();
                        const rawBcFormats = (Array.isArray(rich.formats) && rich.formats.length > 0)
                          ? rich.formats
                          : (typeof rich.formats === 'string' && rich.formats.trim() ? rich.formats : (it.formats || it.format));
                        const formatsList = normalizeHeroFormats(rawBcFormats, true);
                        const formatsText = Array.isArray(formatsList) ? formatsList.join(', ') : String(formatsList || 'Digital');
                        return (
                          <div
                            key={it.id || `bc-new-${idx}`}
                            role="button"
                            tabIndex={0}
                            className="featured-hero-card"
                            {...bindLongPress({
                              id: it.id || `bc-new-${idx}`,
                              title: albumTitle,
                              artist: artistDisplay,
                              artworkUrl: showCover || cleanCover || it.artworkUrl,
                              provider: 'bandcamp',
                              kind: 'album',
                              url: releaseUrl,
                            }, () => {
                              openPlaylistSheet({
                                ...it,
                                kind: 'album',
                                title: albumTitle,
                                artistName: artistDisplay,
                                artworkUrl: showCover || cleanCover || it.artworkUrl,
                                cover: showCover || cleanCover || it.cover,
                                label: showLabel || meta.label || it.label,
                                releaseDate: releaseDateStr || it.releaseDate,
                                location: locationStr || it.location,
                                formats: formatsList,
                                url: releaseUrl,
                                trackUrl: releaseUrl,
                              });
                            })}
                          >
                            <div className="featured-hero-art">
                              {showCover
                                ? <img src={showCover} alt={albumTitle} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                                : <div className="featured-hero-art-ph"><Music2 size={36} strokeWidth={1.2} /></div>}
                            </div>
                            {/* Info on the right of artwork: 1. Album, 2. Artist, 3. Label, 4. Release Date, 5. Location, 6. Formats */}
                            <div className="featured-hero-info">
                              <HeroMarqueeRow className="featured-hero-title">{albumTitle}</HeroMarqueeRow>
                              <HeroMarqueeRow
                                className="featured-hero-artist"
                                onClick={artistDisplay ? (e) => openArtistFromHomeTap(e, artistDisplay, { ...it, url: releaseUrl, title: albumTitle }) : undefined}
                              >
                                {artistDisplay}
                              </HeroMarqueeRow>
                              {showLabel && (
                                <HeroMarqueeRow
                                  className="featured-hero-label"
                                  onClick={(e) => openLabelFromHomeTap(e, showLabel, { ...it, url: releaseUrl })}
                                >
                                  {showLabel}
                                </HeroMarqueeRow>
                              )}
                              {releaseDateStr && <HeroMarqueeRow className="featured-hero-date">{releaseDateStr}</HeroMarqueeRow>}
                              {locationStr && <HeroMarqueeRow className="featured-hero-location">{locationStr}</HeroMarqueeRow>}
                              <HeroMarqueeRow className="featured-hero-formats">{formatsText}</HeroMarqueeRow>
                            </div>
                          </div>
                        );
                      })}
                    </HeroSwipeRow>
                  </section>
                );
              }

              const pages = [];
              for (let i = 0; i < sec.items.length; i += sec.pageSize) {
                pages.push(sec.items.slice(i, i + sec.pageSize));
              }
              return (
                <section key={`${sec.key}-${sec.pageSize}`} className="home-section">
                  <div className="section-title">
                    <span onClick={() => toggleExpandSection(sec.key)} style={{ cursor: 'pointer' }}>{sec.title}</span>
                  </div>
                  {pages.length <= 1 ? (
                    sec.type === 'uploads' ? (
                      viewMode === 'list'
                        ? <UploadExpandedList uploads={pages[0] || []} />
                        : <UploadGridView uploads={pages[0] || []} cols={gridCols} />
                    ) : (
                      <AccountItemList items={pages[0] || []} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                    )
                  ) : (
                    <CatalogSwipeRow
                      key={`${sec.key}-${sec.pageSize}`}
                      sectionKey={`${sec.key}-${sec.pageSize}`}
                      pages={pages}
                      renderPage={(pageItems) =>
                        sec.type === 'uploads' ? (
                          viewMode === 'list'
                            ? <UploadExpandedList uploads={pageItems} />
                            : <UploadGridView uploads={pageItems} cols={gridCols} />
                        ) : (
                          <AccountItemList items={pageItems} view={viewMode} cols={gridCols} onOpenPlaylist={openPlaylistSheet} />
                        )
                      }
                    />
                  )}
                </section>
              );
            })}
          </>
        );
      })()}

      {/* ═══ 1.5 — HISTORY ═══ */}
      {showFeatured && playHistory.filter(it => !isItemHidden(it)).length > 0 && (!expandedSectionKey || expandedSectionKey === 'history') && (() => {
        const visibleHistory = playHistory.filter(it => !isItemHidden(it));
        const isHistoryList = historyColsMode === 'list';
        const safeCols = isHistoryList ? 1 : Math.min(5, Math.max(1, Number(historyColsMode) || 3));
        const safeRows = Math.min(10, Math.max(1, Number(historyRows) || 5));
        const pageSize = isHistoryList ? safeRows : safeRows * safeCols;
        const historyPages = [];
        for (let i = 0; i < visibleHistory.length; i += pageSize) {
          historyPages.push(visibleHistory.slice(i, i + pageSize));
        }

        const renderHistoryListPage = (pageItems, pageIdx = 0) => (
          <div className="history-album-sheet-list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pageItems.map((item, idx) => {
              const globalIdx = pageIdx * pageSize + idx;
              const cleanCover = pinImageInMemory(item.cover || item.artworkUrl, item.id);
              const showCover = cleanCover && !brokenCovers[cleanCover] ? cleanCover : '';
              const isPlayingThis = Boolean(
                playerState?.currentTrack &&
                ((playerState.currentTrack.id && item.id && String(playerState.currentTrack.id) === String(item.id)) ||
                 (playerState.currentTrack.title && item.title &&
                  String(playerState.currentTrack.title).toLowerCase() === String(item.title).toLowerCase()))
              );
              return (
                <div
                  key={item._hkey || `${item.id}-${globalIdx}`}
                  className={`history-album-track-row${isPlayingThis ? ' active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '7px 6px',
                    borderRadius: 10,
                    background: isPlayingThis ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  {...bindLongPress({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    artworkUrl: showCover || item.cover || item.artworkUrl,
                    provider: item.provider || 'bandcamp',
                    kind: 'track',
                    url: item.url || item.trackUrl || '',
                  }, () => playFromHistory(item))}
                >
                  <span style={{
                    width: 22,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: isPlayingThis ? 'var(--text-primary)' : 'var(--text-muted)',
                    textAlign: 'center',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {globalIdx + 1}
                  </span>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 7,
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'var(--grey-800)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {showCover ? (
                      <img
                        src={showCover}
                        alt={item.title}
                        loading="eager"
                        decoding="sync"
                        onError={() => markCoverBroken(showCover)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Music2 size={16} strokeWidth={1.3} color="var(--text-dim)" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.title}
                    </div>
                    {item.artist ? (
                      <div
                        data-subtap="artist"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => openArtistFromHomeTap(e, item.artist, item)}
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-dim)',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          width: 'fit-content',
                          maxWidth: '100%',
                        }}
                      >
                        {item.artist}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Add to Queue"
                    data-subtap="queue"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => queueHistoryItem(e, item)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      border: 'none',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <ListMusic size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        );

        const renderHistoryGridPage = (pageItems) => (
          <div
            className={`upl-grid upl-grid-${safeCols}`}
            style={{ gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))` }}
          >
            {pageItems.map(item => {
              const cleanCover = pinImageInMemory(item.cover || item.artworkUrl, item.id);
              const showCover = cleanCover && !brokenCovers[cleanCover] ? cleanCover : '';
              return (
                <div
                  key={item._hkey || item.id}
                  role="button"
                  tabIndex={0}
                  className="upl-grid-cell"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  {...bindLongPress({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    artworkUrl: showCover || item.cover || item.artworkUrl,
                    provider: item.provider || 'bandcamp',
                    kind: 'track',
                    url: item.url || item.trackUrl || '',
                  }, () => playFromHistory(item))}
                >
                  <div className="upl-grid-art">
                    {showCover ? (
                      <img src={showCover} alt={item.title} loading="eager" decoding="sync" onError={() => markCoverBroken(showCover)} />
                    ) : (
                      <div className="upl-grid-art-ph"><Music2 size={safeCols >= 4 ? 14 : 22} strokeWidth={1.2} /></div>
                    )}
                  </div>
                  <div className="upl-grid-title">{item.title}</div>
                  {item.artist ? (
                    <div
                      className="upl-grid-artist"
                      data-subtap="artist"
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => openArtistFromHomeTap(e, item.artist, item)}
                    >
                      {item.artist}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );

        return (
          <section className="home-section">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span onClick={() => toggleExpandSection('history')} style={{ cursor: 'pointer' }}>
                {expandedSectionKey === 'history' ? '← History' : 'History'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* Layout / Icons-per-row selector: List | 1 | 2 | 3 | 4 | 5 */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 999,
                  padding: 2,
                  gap: 2,
                }}>
                  {[
                    { key: 'list', label: 'List' },
                    { key: 1, label: '1' },
                    { key: 2, label: '2' },
                    { key: 3, label: '3' },
                    { key: 4, label: '4' },
                    { key: 5, label: '5' },
                  ].map(opt => {
                    const active = historyColsMode === opt.key;
                    return (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => updateHistoryColsMode(opt.key)}
                        style={{
                          border: 'none',
                          background: active ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                          color: active ? '#fff' : 'rgba(255, 255, 255, 0.58)',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '3px 7px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          lineHeight: 1.2,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Rows count selector (1 to 10 rows maximum) */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 999,
                  padding: '2px 4px',
                  gap: 4,
                }}>
                  <button
                    type="button"
                    onClick={() => updateHistoryRows(safeRows - 1)}
                    disabled={safeRows <= 1}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: safeRows <= 1 ? 'rgba(255,255,255,0.25)' : '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      cursor: safeRows <= 1 ? 'default' : 'pointer',
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums' }}>
                    {safeRows} {safeRows === 1 ? 'row' : 'rows'}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateHistoryRows(safeRows + 1)}
                    disabled={safeRows >= 10}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: safeRows >= 10 ? 'rgba(255,255,255,0.25)' : '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      cursor: safeRows >= 10 ? 'default' : 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            {expandedSectionKey === 'history' ? (
              <>
                {isHistoryList
                  ? renderHistoryListPage(visibleHistory.slice(0, expandedVisibleCount), 0)
                  : renderHistoryGridPage(visibleHistory.slice(0, expandedVisibleCount))}
                {expandedVisibleCount < visibleHistory.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : historyPages.length <= 1 ? (
              isHistoryList
                ? renderHistoryListPage(historyPages[0] || [], 0)
                : renderHistoryGridPage(historyPages[0] || [])
            ) : (
              <CatalogSwipeRow
                key={`home-history-${historyColsMode}-${safeRows}`}
                sectionKey={`home-history-${historyColsMode}-${safeRows}`}
                pages={historyPages}
                renderPage={(pageItems, pIdx) =>
                  isHistoryList
                    ? renderHistoryListPage(pageItems, pIdx)
                    : renderHistoryGridPage(pageItems)
                }
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 2 — MY UPLOADS (private) ═══ */}
      {showReleases && myUploads.length > 0 && (!expandedSectionKey || expandedSectionKey === 'my-uploads') && (() => {
        const isExpanded = expandedSectionKey === 'my-uploads';
        const uploadPageSize = Math.max(3, (homeLayout.cols || 3) * 2);
        const uploadPages = [];
        for (let i = 0; i < myUploads.length; i += uploadPageSize) {
          uploadPages.push(myUploads.slice(i, i + uploadPageSize));
        }
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('my-uploads')} style={{ cursor: 'pointer' }}>
                {isExpanded ? '← ' : ''}<Lock size={14} style={{marginRight:5,verticalAlign:'middle'}}/> My Uploads
              </span>
              <span style={{fontSize:'.72rem',color:'var(--text-muted)'}}>{myUploads.length} tracks</span>
            </div>
            {isExpanded ? (
              <>
                {homeLayout.mode === 'list'
                  ? <UploadExpandedList uploads={myUploads.slice(0, expandedVisibleCount)}/>
                  : <UploadGridView uploads={myUploads.slice(0, expandedVisibleCount)} cols={homeLayout.cols}/>}
                {expandedVisibleCount < myUploads.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : uploadPages.length <= 1 ? (
              homeLayout.mode === 'list'
                ? <UploadExpandedList uploads={myUploads}/>
                : <UploadGridView uploads={myUploads} cols={homeLayout.cols}/>
            ) : (
              <CatalogSwipeRow
                sectionKey="my-uploads"
                pages={uploadPages}
                renderPage={(pageItems) =>
                  homeLayout.mode === 'list'
                    ? <UploadExpandedList uploads={pageItems}/>
                    : <UploadGridView uploads={pageItems} cols={homeLayout.cols}/>
                }
              />
            )}
          </section>
        );
      })()}

      {/* ═══ 3 — RELEASES ═══ */}
      {showReleases && (!expandedSectionKey || expandedSectionKey === 'releases') && (() => {
        const isExpanded = expandedSectionKey === 'releases';
        const releasePageSize = Math.max(3, (homeLayout.cols || 3) * 2);
        const releasePages = [];
        for (let i = 0; i < publicAlbums.length; i += releasePageSize) {
          releasePages.push(publicAlbums.slice(i, i + releasePageSize));
        }
        const renderReleaseGrid = (albumsSlice) => (
          <div className={`upl-grid upl-grid-${homeLayout.cols || 3}`}>
            {albumsSlice.map(album => {
              const cleanCover = album.cover ? pinImageInMemory(album.cover, album.id) : '';
              return (
                <div
                  key={album.id}
                  role="button"
                  tabIndex={0}
                  className="upl-grid-cell"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  {...bindLongPress({
                    id: album.id,
                    title: album.title,
                    artist: album.artist,
                    artworkUrl: cleanCover || album.cover,
                    provider: 'kyoyu',
                    kind: 'album',
                    url: album.url || album.trackUrl || '',
                  }, () => {
                    const isSingle = String(album.id || '').startsWith('single::') && album.tracks?.length === 1;
                    if (isSingle) {
                      playTrack(album.tracks[0]);
                    } else {
                      setSelectedAlbum(openNativeAlbumFast(album));
                    }
                  })}
                >
                  <div className="upl-grid-art">
                    {cleanCover
                      ? <img src={cleanCover} alt={album.title} loading="eager" decoding="sync"/>
                      : <div className="upl-grid-art-ph"><Music2 size={22} strokeWidth={1.2}/></div>}
                  </div>
                  <div className="upl-grid-title">{album.title}</div>
                  <div
                    className="upl-grid-artist"
                    data-subtap={album.artist ? 'artist' : undefined}
                    onTouchStart={album.artist ? (e) => e.stopPropagation() : undefined}
                    onTouchEnd={album.artist ? (e) => e.stopPropagation() : undefined}
                    onPointerDown={album.artist ? (e) => e.stopPropagation() : undefined}
                    onClick={album.artist ? (e) => openArtistFromHomeTap(e, album.artist, album) : undefined}
                  >
                    {album.artist}
                  </div>
                </div>
              );
            })}
          </div>
        );
        return (
          <section className="home-section">
            <div className="section-title">
              <span onClick={() => toggleExpandSection('releases')} style={{ cursor: 'pointer' }}>
                {isExpanded ? '← Releases' : 'Releases'}
              </span>
              {isExpanded && (
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{publicAlbums.length}</span>
              )}
            </div>
            {publicAlbums.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '16px 0' }}>No public releases yet.</p>
            ) : isExpanded ? (
              <>
                {renderReleaseGrid(publicAlbums.slice(0, expandedVisibleCount))}
                {expandedVisibleCount < publicAlbums.length && (
                  <div ref={loadMoreSentinelRef} style={{ height: 32 }} />
                )}
              </>
            ) : releasePages.length <= 1 ? (
              renderReleaseGrid(releasePages[0] || [])
            ) : (
              <CatalogSwipeRow
                sectionKey="releases"
                pages={releasePages}
                renderPage={(pageAlbums) => renderReleaseGrid(pageAlbums)}
              />
            )}
          </section>
        );
      })()}

      {/* Album detail sheet */}
      {!window.webkit?.messageHandlers?.player && selectedAlbum && (
        <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}

    </div>
  );
}
