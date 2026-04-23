import { useNavigate } from 'react-router-dom';
import { Eye, X, Bell, BellOff, ExternalLink, MapPin, Globe, Pencil } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVIStore } from '../lib/visualIdentityStore';
import './ListenerPreview.css';

/* ─── Interactive artwork card (creator preview — same logic as VisualIdentity) ── */
function ResizableArtworkCard({ artwork, scale, otherCards, onMoveEnd, onResizeEnd }) {
  const cardRef     = useRef(null);
  const dragRef     = useRef(null);      // { startX, startY, startCx, startCy }
  const resizingRef = useRef(null);      // { corner, startX/Y, startW/H, startCx/Y }

  const initW = artwork.cw ?? 150;
  const initH = Math.round(initW / (artwork.displayAr || 1));
  const [pos,  setPos]  = useState({ x: artwork.cx ?? 0, y: artwork.cy ?? 0 });
  const [size, setSize] = useState({ w: initW, h: initH });

  // Sync when store updates (e.g. after persist)
  useEffect(() => { setPos({ x: artwork.cx ?? 0, y: artwork.cy ?? 0 }); }, [artwork.cx, artwork.cy]);
  useEffect(() => {
    const w = artwork.cw ?? 150;
    setSize({ w, h: Math.round(w / (artwork.displayAr || 1)) });
  }, [artwork.cw, artwork.displayAr]);

  // ── Snap to other cards (align, touch, or 10px gap) ──────────────────────
  // All coordinates in canvas (source) space; threshold compensates for scale.
  const snapPos = (rawX, rawY) => {
    const { w, h } = size;
    const THRESH = 14 / Math.max(0.1, scale);
    const GAP = 10;

    // LEFT-edge targets for card A
    const xLeft = [
      0,
      ...otherCards.flatMap(o => [
        o.cx,              // align: A.left = B.left
        o.cx + o.cw,       // touch: A.left = B.right  (0px gap)
        o.cx + o.cw + GAP, // gap:   A.left = B.right + 10
      ]),
    ];
    // RIGHT-edge targets for card A
    const xRight = [
      ...otherCards.flatMap(o => [
        o.cx + o.cw,       // align: A.right = B.right
        o.cx,              // touch: A.right = B.left   (0px gap)
        o.cx - GAP,        // gap:   A.right = B.left - 10
      ]),
    ];
    // TOP-edge targets
    const yTop = [
      0,
      ...otherCards.flatMap(o => [
        o.cy,              // align: A.top = B.top
        o.cy + o.ch,       // touch: A.top = B.bottom   (0px gap)
        o.cy + o.ch + GAP, // gap:   A.top = B.bottom + 10
      ]),
    ];
    // BOTTOM-edge targets
    const yBot = [
      ...otherCards.flatMap(o => [
        o.cy + o.ch,       // align: A.bottom = B.bottom
        o.cy,              // touch: A.bottom = B.top   (0px gap)
        o.cy - GAP,        // gap:   A.bottom = B.top - 10
      ]),
    ];

    let sx = rawX, bestX = THRESH;
    for (const l of xLeft)  { const d = Math.abs(rawX - l);     if (d < bestX) { bestX = d; sx = l; } }
    for (const l of xRight) { const d = Math.abs(rawX + w - l); if (d < bestX) { bestX = d; sx = l - w; } }

    let sy = rawY, bestY = THRESH;
    for (const l of yTop) { const d = Math.abs(rawY - l);     if (d < bestY) { bestY = d; sy = l; } }
    for (const l of yBot) { const d = Math.abs(rawY + h - l); if (d < bestY) { bestY = d; sy = l - h; } }

    return { x: Math.max(0, sx), y: Math.max(0, sy) };
  };

  // ── Drag to move ──
  const onDragPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.lp-resize-handle')) return;
    if (resizingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCx: pos.x, startCy: pos.y };
  };
  const onDragPointerMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, startCx, startCy } = dragRef.current;
    const sc = Math.max(0.01, scale);
    const rawX = startCx + (e.clientX - startX) / sc;
    const rawY = startCy + (e.clientY - startY) / sc;
    setPos(snapPos(rawX, rawY));
  };
  const onDragPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    onMoveEnd(pos.x, pos.y);
  };

  // ── 4-corner resize ──
  const CORNERS = ['tl', 'tr', 'bl', 'br'];
  const CURSOR  = { tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize' };
  const CSTYLE  = { tl: { top:-6, left:-6 }, tr: { top:-6, right:-6 }, bl: { bottom:-6, left:-6 }, br: { bottom:-6, right:-6 } };

  const onResizePointerDown = (e, corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingRef.current = {
      corner, startX: e.clientX, startY: e.clientY,
      startW: size.w, startH: size.h, startCx: pos.x, startCy: pos.y,
    };
  };
  const onResizePointerMove = (e) => {
    if (!resizingRef.current) return;
    const { corner, startX, startY, startW, startH, startCx, startCy } = resizingRef.current;
    const sc = Math.max(0.01, scale);
    const dx = (e.clientX - startX) / sc;
    const dy = (e.clientY - startY) / sc;

    // Raw new dimensions from mouse delta
    let nW = startW, nH = startH, nCx = startCx, nCy = startCy;
    if (corner === 'br') { nW = startW + dx; nH = startH + dy; }
    if (corner === 'bl') { nW = startW - dx; nH = startH + dy; nCx = startCx + (startW - nW); }
    if (corner === 'tr') { nW = startW + dx; nH = startH - dy; nCy = startCy + (startH - nH); }
    if (corner === 'tl') { nW = startW - dx; nH = startH - dy; nCx = startCx + (startW - nW); nCy = startCy + (startH - nH); }

    // Snap the moving edge to other cards (align, touch, or 10px gap)
    const THRESH = 14 / sc;
    const GAP = 10;
    const xLines = [
      0,
      ...otherCards.flatMap(o => [o.cx, o.cx + o.cw, o.cx - GAP, o.cx + o.cw + GAP]),
    ];
    const yLines = [
      0,
      ...otherCards.flatMap(o => [o.cy, o.cy + o.ch, o.cy - GAP, o.cy + o.ch + GAP]),
    ];
    const snapL  = (v, ls) => { let b = v, bd = THRESH; for (const l of ls) { const d = Math.abs(v - l); if (d < bd) { bd = d; b = l; } } return b; };

    const isLeft = corner === 'tl' || corner === 'bl';
    const isTop  = corner === 'tl' || corner === 'tr';
    const fixedR = startCx + startW;   // right edge anchored when left moves
    const fixedB = startCy + startH;   // bottom edge anchored when top moves

    if (isLeft) { nCx = snapL(nCx, xLines); nW = fixedR - nCx; }          // snap left edge
    else        { nW  = snapL(nCx + nW, xLines) - nCx; }                  // snap right edge
    if (isTop)  { nCy = snapL(nCy, yLines); nH = fixedB - nCy; }          // snap top edge
    else        { nH  = snapL(nCy + nH, yLines) - nCy; }                  // snap bottom edge

    nW = Math.max(60, Math.round(nW)); nH = Math.max(40, Math.round(nH));
    nCx = Math.max(0, Math.round(nCx)); nCy = Math.max(0, Math.round(nCy));
    setSize({ w: nW, h: nH });
    setPos({ x: nCx, y: nCy });
  };
  const onResizePointerUp = () => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    onResizeEnd(size.w / size.h, size.w, pos.x, pos.y);
  };

  const handleMove   = (e) => resizingRef.current ? onResizePointerMove(e) : onDragPointerMove(e);
  const handleUp     = (e) => resizingRef.current ? onResizePointerUp(e)   : onDragPointerUp(e);

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute', left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        overflow: 'visible', cursor: 'grab',
        userSelect: 'none', touchAction: 'none', zIndex: 10,
      }}
      onPointerDown={onDragPointerDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {/* Clipped content area */}
      <div style={{ position:'absolute', inset:0, borderRadius:10, overflow:'hidden' }}>
        <img
          src={artwork.url} alt={artwork.label} className="lp-artwork-img"
          style={{
            width:'100%', height:'100%', objectFit:'cover',
            objectPosition: `${artwork.position?.x ?? 50}% ${artwork.position?.y ?? 50}%`,
          }}
        />
        {artwork.label && <div className="lp-artwork-label">{artwork.label}</div>}
      </div>

      {/* 4 corner handles */}
      {CORNERS.map(c => (
        <div
          key={c}
          className="lp-resize-handle"
          style={{
            position: 'absolute', ...CSTYLE[c],
            width: 14, height: 14, borderRadius: '50%',
            background: 'rgba(155,109,255,0.9)', border: '2px solid white',
            cursor: CURSOR[c], touchAction: 'none', zIndex: 20,
          }}
          onPointerDown={(e) => onResizePointerDown(e, c)}
        />
      ))}
    </div>
  );
}

/* ─── Scaled canvas: interactive for creator, read-only for listeners ── */
function ArtworkScaledCanvas({ artworks, editable, onMoveCard, onResizeCard }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  // Source dimensions: bounding box of cards + symmetric 10px buffer on all sides
  // (matches the slot grid's _P=10 — so left, right, top, bottom all equal 10px visually)
  const srcW = Math.max(1, ...artworks.map(a => (a.cx ?? 0) + (a.cw ?? 150))) + 10;
  const srcH = Math.max(300, ...artworks.map(a => {
    const w = a.cw ?? 150;
    return (a.cy ?? 0) + Math.round(w / (a.displayAr || 1));
  }));

  useEffect(() => {
    if (!wrapRef.current) return;
    const update = () => {
      const cw = wrapRef.current?.clientWidth;
      if (cw > 0) setScale(cw / srcW);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [srcW]);

  return (
    <div ref={wrapRef} className="lp-artworks-canvas" style={{ height: Math.round(srcH * scale) }}>
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: srcW, height: srcH,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
      }}>
        {artworks.map((a, i) => editable ? (
          <ResizableArtworkCard
            key={i}
            artwork={a}
            scale={scale}
            otherCards={artworks.filter((_, j) => j !== i).map(o => ({
              cx: o.cx ?? 0, cy: o.cy ?? 0,
              cw: o.cw ?? 150,
              ch: Math.round((o.cw ?? 150) / (o.displayAr || 1)),
            }))}
            onMoveEnd={(x, y)              => onMoveCard?.(i, x, y)}
            onResizeEnd={(ar, w, cx, cy)   => onResizeCard?.(i, ar, w, cx, cy)}
          />
        ) : (
          <div
            key={i}
            className="lp-artwork-card"
            style={{
              position: 'absolute',
              left: `${a.cx ?? 0}px`, top: `${a.cy ?? 0}px`,
              width: `${a.cw ?? 150}px`,
              height: `${Math.round((a.cw ?? 150) / (a.displayAr || 1))}px`,
            }}
          >
            <img
              src={a.url} alt={a.label} className="lp-artwork-img"
              style={{ objectFit:'cover', objectPosition:`${a.position?.x ?? 50}% ${a.position?.y ?? 50}%` }}
            />
            {a.label && <div className="lp-artwork-label">{a.label}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}


/* ─── Static preview data ─────────────────────────────────── */
const PREVIEW_RELEASES = [];   // empty — section hidden when no real releases
const PREVIEW_BIO      = 'Crafting immersive sonic landscapes at the intersection of techno and ambient. Based in Berlin, releasing exclusively on Reef.';
const PREVIEW_GENRE    = 'Techno / Ambient / Electronic';

export default function ListenerPreview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vi, setVI] = useVIStore();

  // ── Persist card moves/resizes to the shared viStore ──
  const onMoveCard = (i, x, y) =>
    setVI(s => ({ artworks: s.artworks.map((a, j) => j === i ? { ...a, cx: x, cy: y } : a) }));
  const onResizeCard = (i, newAr, newW, newCx, newCy) =>
    setVI(s => ({ artworks: s.artworks.map((a, j) => j === i ? { ...a, displayAr: newAr, cw: newW, cx: newCx, cy: newCy } : a) }));

  const [notificationsOn, setNotificationsOn] = useState(false);

  const displayName  = user?.artistName || user?.name || 'Artist';
  const coverImage   = vi.coverImage;
  const avatarImage  = vi.avatarImage;
  const displayMode  = vi.displayMode;
  const primary      = vi.primary    || '#9b6dff';
  const secondary    = vi.secondary  || '#29b6f6';
  const pos          = vi.coverPosition  || { x: 50, y: 50 };
  const aPos         = vi.avatarPosition || { x: 50, y: 50 };
  const bgPos        = `${pos.x}% ${pos.y}%`;
  const avatarObjPos = `${aPos.x}% ${aPos.y}%`;

  /* Hero style — position from drag-to-reposition */
  const heroStyle = coverImage
    ? displayMode === 'prominent'
      ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%), url(${coverImage})`, backgroundSize:'cover', backgroundPosition: bgPos }
      : { backgroundImage: `linear-gradient(to bottom, rgba(10,8,30,0.35) 0%, rgba(10,8,30,0.65) 100%), url(${coverImage})`, backgroundSize:'cover', backgroundPosition: bgPos }
    : {};

  return (
    <div className="listener-preview-page">
      {/* Floating preview banner */}
      <div className="lp-banner">
        <div className="lp-banner-inner">
          <Eye size={14}/>
          <span>Listener Preview Mode</span>
          <span className="lp-banner-hint">This is how your profile looks to listeners</span>
        </div>
        <button className="lp-exit-btn" onClick={() => navigate('/visual-identity')}>
          <X size={13}/> Exit Preview
        </button>
      </div>

      {/* Simulated listener interface */}
      <div className="lp-content">

        {/* Hero */}
        <div className="lp-hero" style={heroStyle}>
          {/* Radial glow using the user's palette when no cover */}
          {!coverImage && (
            <div className="lp-hero-bg" style={{ background: `radial-gradient(circle at 20% 50%, ${primary}22 0%, transparent 70%)` }}/>
          )}
          <div className="lp-hero-inner">
            {/* Avatar: show uploaded photo or initials */}
            <div
              className="lp-avatar"
              style={{
                background: avatarImage ? 'transparent' : `radial-gradient(circle, ${primary}44, ${primary}11)`,
                border: `2px solid ${primary}55`,
                overflow: 'hidden',
              }}
            >
              {avatarImage
                ? <img src={avatarImage} alt={displayName} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: avatarObjPos }} />
                : displayName[0].toUpperCase()
              }
            </div>
            <div className="lp-artist-info">
              <h1>{displayName}</h1>
              <div className="lp-genre">{PREVIEW_GENRE}</div>
              <div className="lp-location"><MapPin size={11}/> Berlin, DE</div>
              <p className="lp-bio">{PREVIEW_BIO}</p>
              <div className="lp-hero-actions">
                <button className="lp-follow-btn" style={{ borderColor:`${primary}55`, background:`${primary}18`, color:`${primary}cc` }}>Follow</button>
                <button
                  className={`lp-notify-btn${notificationsOn ? ' lp-notify-btn--on' : ''}`}
                  onClick={() => setNotificationsOn(v => !v)}
                  title={notificationsOn ? 'Disable notifications' : 'Enable notifications'}
                  style={notificationsOn ? { background:`${primary}22`, borderColor:`${primary}66`, color: primary } : {}}
                >
                  {notificationsOn ? <Bell size={15} fill="currentColor" /> : <BellOff size={15} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Upload prompt if no cover yet */}
        {!coverImage && (
          <div className="lp-no-cover-hint">
            <Eye size={13}/>
            <span>No cover image set — upload one in <button onClick={() => navigate('/visual-identity')} className="lp-hint-link">Visual Identity</button> to see it here</span>
          </div>
        )}


        {/* About — bio is editable directly on this page */}
        <div className="lp-section">
          <div className="lp-section-title">
            About
            <span className="lp-edit-hint"><Pencil size={11}/> click to edit</span>
          </div>
          <div className="lp-about-card glass">
            <div
              className="lp-bio-editable"
              contentEditable
              suppressContentEditableWarning
              data-placeholder={PREVIEW_BIO}
              onBlur={e => {
                const text = e.currentTarget.innerText.trim();
                setVI(s => ({ ...s, bio: text }));
              }}
              dangerouslySetInnerHTML={{ __html: vi.bio || '' }}
            />
            {vi.links?.filter(l => l.url).length > 0 ? (
              <div className="lp-about-links">
                {vi.links.filter(l => l.url).map((l, i) => (
                  <a key={i} href={l.url} className="lp-link" target="_blank" rel="noreferrer">
                    <ExternalLink size={12}/> {l.label || l.url}
                  </a>
                ))}
              </div>
            ) : (
              <div className="lp-about-links">
                <a href="#" className="lp-link"><Globe size={12}/> Website</a>
                <a href="#" className="lp-link"><ExternalLink size={12}/> Bandcamp</a>
                <a href="#" className="lp-link"><ExternalLink size={12}/> Instagram</a>
              </div>
            )}
          </div>
        </div>

        {/* Releases — only shown when there are actual releases */}
        {PREVIEW_RELEASES.length > 0 && (
          <div className="lp-section">
            <div className="lp-section-title">Releases</div>
            <div className="lp-releases-grid">
              {PREVIEW_RELEASES.map(r => (
                <div key={r.id} className="lp-release-card" style={{ background: r.gradient }}>
                  <div className="lp-release-accent" style={{ background: r.accentColor }}/>
                  <div className="lp-release-play"><Play size={16} fill="currentColor"/></div>
                  <div className="lp-release-info">
                    <div className="lp-release-title">{r.title}</div>
                    <div className="lp-release-meta">{r.year} · {r.format}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Artworks & Promo — proportionally scaled to fill canvas */}
        {vi.artworks?.length > 0 && (
          <div className="lp-section">
            <div className="lp-section-title">Artworks &amp; Promo</div>
            <ArtworkScaledCanvas
              artworks={vi.artworks}
              editable
              onMoveCard={onMoveCard}
              onResizeCard={onResizeCard}
            />
          </div>
        )}

        {/* Stats */}
        <div className="lp-section">
          <div className="lp-section-title">Stats</div>
          <div className="lp-stats-row">
            <div className="lp-stat glass"><div className="lp-stat-val">8.3K</div><div className="lp-stat-label">Followers</div></div>
            <div className="lp-stat glass"><div className="lp-stat-val">42K</div><div className="lp-stat-label">Streams</div></div>
            <div className="lp-stat glass"><div className="lp-stat-val">4</div><div className="lp-stat-label">Releases</div></div>
          </div>
        </div>

        <div className="lp-watermark">
          <Eye size={11}/> Preview — not visible to listeners
        </div>
      </div>
    </div>
  );
}
