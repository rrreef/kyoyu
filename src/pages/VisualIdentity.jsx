import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Upload, Link2, Plus, X, Check, Palette, Eye, EyeOff, Move, AlignLeft, LayoutGrid, CircleUser } from 'lucide-react';
import { useVIStore, setVIState } from '../lib/visualIdentityStore';
import './VisualIdentity.css';

/* ─── Helpers ───────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ─── ResizableCard ─────────────────────────────────────────── */
/* Reads persisted height from localStorage (id-keyed) so the     */
/* layout the user set is restored on every load. No drag handles. */
function ResizableCard({ id, className = '', children, minH = 100, style, ...rest }) {
  const lsKey  = id ? `vi-card-h-${id}` : null;
  const saved  = lsKey ? Number(localStorage.getItem(lsKey)) || null : null;
  const cardStyle = saved != null ? { ...style, minHeight: saved } : style;

  return (
    <div className={`vi-card ${className}`} style={cardStyle} {...rest}>
      {children}
    </div>
  );
}

/* ─── Cover Image Field ─────────────────────────────────────── */
function CoverImageField({ image, position, onImage, onPosition, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const previewRef = useRef(null);

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    if (image) URL.revokeObjectURL(image);
    onImage(URL.createObjectURL(f));
  };

  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop     = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); };

  const onPointerDown = (e) => {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, px: position.x, py: position.y });
  };
  const onPointerMove = (e) => {
    if (!dragging || !dragStart || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width  * 100;
    const dy = (e.clientY - dragStart.y) / rect.height * 100;
    onPosition({ x: clamp(dragStart.px - dx, 0, 100), y: clamp(dragStart.py - dy, 0, 100) });
  };
  const onPointerUp = () => { setDragging(false); setDragStart(null); };

  if (!image) {
    return (
      <div className="vi-cover-zone" onDragOver={onDragOver} onDrop={onDrop}>
        <label className="vi-clickable-label">
          <input type="file" accept="image/*" className="vi-file-input-hidden" onChange={e => handleFile(e.target.files?.[0])} />
          <Upload size={22} strokeWidth={1.5} />
          <span className="vi-upload-label">Upload cover image</span>
          <span className="vi-upload-hint">JPEG, PNG, WebP · 16:9 recommended</span>
        </label>
      </div>
    );
  }

  return (
    <div className="vi-cover-zone vi-upload-zone has-preview">
      <div ref={previewRef}
        className={`vi-cover-preview ${dragging ? 'vi-cover-preview--dragging' : ''}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDragOver={onDragOver} onDrop={onDrop}
      >
        <img src={image} alt="cover" className="vi-cover-img"
          style={{ objectPosition: `${position.x}% ${position.y}%` }} />
        <div className="vi-cover-reposition-hint"><Move size={14}/> Drag to reposition</div>
        <div className="vi-cover-pos-pill">{Math.round(position.x)}% · {Math.round(position.y)}%</div>
        <div className="vi-cover-actions">
          <label className="vi-preview-btn" style={{cursor:'pointer'}}>
            <input type="file" accept="image/*" className="vi-file-input-hidden" onChange={e => handleFile(e.target.files?.[0])} />
            <Upload size={11}/> Replace
          </label>
          <button className="vi-preview-btn vi-preview-btn--remove" onClick={onRemove}><X size={11}/> Remove</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Avatar Field ──────────────────────────────────────────── */
function AvatarField({ image, position, onImage, onPosition, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const innerRef = useRef(null);

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    if (image) URL.revokeObjectURL(image);
    onImage(URL.createObjectURL(f));
  };
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop     = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); };

  const onPointerDown = (e) => {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, px: position.x, py: position.y });
  };
  const onPointerMove = (e) => {
    if (!dragging || !dragStart || !innerRef.current) return;
    const rect = innerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width  * 100;
    const dy = (e.clientY - dragStart.y) / rect.height * 100;
    onPosition({ x: clamp(dragStart.px - dx, 0, 100), y: clamp(dragStart.py - dy, 0, 100) });
  };
  const onPointerUp = () => { setDragging(false); setDragStart(null); };

  return (
    <div className="vi-avatar-zone-wrap">
      <div className={`vi-avatar-zone ${!image ? 'vi-drag-over-target' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
        {image ? (
          <>
            <div ref={innerRef}
              className={`vi-avatar-preview-inner ${dragging ? 'vi-avatar-preview-inner--dragging' : ''}`}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            >
              <img src={image} alt="avatar" className="vi-avatar-zone-img"
                style={{ objectPosition: `${position.x}% ${position.y}%` }} />
              <div className="vi-avatar-circle-guide" />
              <div className="vi-cover-reposition-hint"><Move size={13}/> Drag to reposition</div>
              <div className="vi-cover-pos-pill">{Math.round(position.x)}% · {Math.round(position.y)}%</div>
            </div>
            <div className="vi-avatar-toolbar">
              <label className="vi-avatar-toolbar-btn" style={{cursor:'pointer'}}>
                <input type="file" accept="image/*" className="vi-file-input-hidden" onChange={e => handleFile(e.target.files?.[0])} />
                <Upload size={11}/> Replace
              </label>
              <button className="vi-avatar-toolbar-btn vi-avatar-toolbar-btn--remove" onClick={onRemove}><X size={11}/> Remove</button>
            </div>
          </>
        ) : (
          <label className="vi-clickable-label" style={{zIndex:1}}>
            <input type="file" accept="image/*" className="vi-file-input-hidden" onChange={e => handleFile(e.target.files?.[0])} />
            <Upload size={20} strokeWidth={1.5}/>
            <span className="vi-upload-label">Upload avatar</span>
            <span className="vi-upload-hint">Square image recommended</span>
          </label>
        )}
      </div>
      {image && (
        <div className="vi-avatar-circle-preview">
          <img src={image} alt="preview" style={{ objectPosition: `${position.x}% ${position.y}%` }}/>
          <span className="vi-avatar-circle-label">Preview</span>
        </div>
      )}
    </div>
  );
}

/* ─── Artwork Card ───────────────────────────────────────────── */
const CARD_SIZE = 150;

function ArtworkCard({
  url, label, placement, position, fit, displayAr,
  cx, cy, cw,
  otherCards,
  slotXSnap, slotXRight, slotYSnap, slotYBottom,
  onRemove, onTogglePlacement, onOpenReposition, onToggleFit,
  onResizeEnd, onMoveEnd, onRename,
}) {
  const SNAP_THRESH = 12; // px — snap card edge to another card's edge

  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(label || '');
  const [pos,     setPos]     = useState({ x: cx, y: cy });
  // Track BOTH width and height independently for free-form rectangle resize
  const [size, setSize] = useState({ w: cw, h: Math.round(cw / (displayAr || 1)) });
  const cardRef     = useRef(null);
  const dragRef     = useRef(null);          // move-drag state (sync)
  const resizingRef = useRef(null);          // resize state (sync — no stale closure)

  // ── Snap: card edges align to valid slot positions ──
  const snapPos = (rawX, rawY) => {
    const { w, h } = size;
    const THRESH = 18;
    const GAP = 10;

    // Slot edges: exact alignment only (no gap for grid slots)
    const xLeftLines  = [...(slotXSnap || [0])];
    const xRightLines = [...(slotXRight || [])];
    const yTopLines   = [...(slotYSnap || [0])];
    const yBotLines   = [...(slotYBottom || [])];

    // Other cards: align, touch, AND 10px gap
    for (const o of otherCards) {
      const och = Math.round(o.cw / (o.displayAr || 1));
      xLeftLines.push(o.cx,              o.cx + o.cw,       o.cx + o.cw + GAP); // left targets
      xRightLines.push(o.cx + o.cw,     o.cx,               o.cx - GAP);        // right targets
      yTopLines.push(o.cy,              o.cy + och,          o.cy + och + GAP);  // top targets
      yBotLines.push(o.cy + och,        o.cy,                o.cy - GAP);        // bottom targets
    }

    let sx = rawX, bestXDist = THRESH;
    for (const l of xLeftLines)  { const d = Math.abs(rawX - l);     if (d < bestXDist) { bestXDist = d; sx = l; } }
    for (const l of xRightLines) { const d = Math.abs(rawX + w - l); if (d < bestXDist) { bestXDist = d; sx = l - w; } }

    let sy = rawY, bestYDist = THRESH;
    for (const l of yBotLines) {
      const d = Math.abs(rawY + h - l);
      if (d < bestYDist) { bestYDist = d; sy = l - h; }
    }

    return { x: Math.max(0, sx), y: Math.max(0, sy) };
  };

  // Keep pos/size in sync with props (after store persists new values)
  useEffect(() => { setPos({ x: cx, y: cy }); }, [cx, cy]);
  useEffect(() => { setSize({ w: cw, h: Math.round(cw / (displayAr || 1)) }); }, [cw, displayAr]);

  // ── Drag to move ───────────────────────────────────────
  const onDragPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.vi-artwork-btn') ||
        e.target.closest('.vi-artwork-label-input')) return;
    if (resizingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (cardRef.current) cardRef.current.style.zIndex = '999';
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCx: pos.x, startCy: pos.y };
  };
  const onDragPointerMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, startCx, startCy } = dragRef.current;
    setPos(snapPos(startCx + (e.clientX - startX), startCy + (e.clientY - startY)));
  };
  const onDragPointerUp = () => {
    if (!dragRef.current) return;
    if (cardRef.current) cardRef.current.style.zIndex = '';
    onMoveEnd(pos.x, pos.y);
    dragRef.current = null;
  };

  // ── FREE RECTANGLE corner resize ──
  //   tl → move left+top    tr → move right+top
  //   bl → move left+bottom  br → move right+bottom
  const onResizePointerDown = (e, corner) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingRef.current = {
      corner,
      startX: e.clientX, startY: e.clientY,
      startW: size.w,     startH: size.h,
      startCx: pos.x,     startCy: pos.y,
    };
  };
  const onResizePointerMove = (e) => {
    const r = resizingRef.current;
    if (!r) return;
    const dx    = e.clientX - r.startX;
    const dy    = e.clientY - r.startY;
    const isLeft = r.corner === 'tl' || r.corner === 'bl';
    const isTop  = r.corner === 'tl' || r.corner === 'tr';

    // Raw new dimensions
    let newW  = isLeft ? r.startW - dx : r.startW + dx;
    let newH  = isTop  ? r.startH - dy : r.startH + dy;
    let newCx = isLeft ? r.startCx + (r.startW - newW) : r.startCx;
    let newCy = isTop  ? r.startCy + (r.startH - newH) : r.startCy;

    // Snap the moving corner edge (slot grid + other-card edges + 10px gaps)
    const THRESH = 18;
    const GAP = 10;
    const xLines = [
      ...(slotXSnap || []), ...(slotXRight || []),
      ...otherCards.flatMap(o => [o.cx, o.cx + o.cw, o.cx - GAP, o.cx + o.cw + GAP]),
    ];
    const yLines = [
      ...(slotYSnap || []), ...(slotYBottom || []),
      ...otherCards.flatMap(o => {
        const och = Math.round(o.cw / (o.displayAr || 1));
        return [o.cy, o.cy + och, o.cy - GAP, o.cy + och + GAP];
      }),
    ];
    const snapL = (v, ls) => { let b = v, bd = THRESH; for (const l of ls) { const d = Math.abs(v - l); if (d < bd) { bd = d; b = l; } } return b; };

    const fixedR = r.startCx + r.startW;  // right edge anchored when left moves
    const fixedB = r.startCy + r.startH;  // bottom edge anchored when top moves

    if (isLeft) { newCx = snapL(newCx, xLines); newW = fixedR - newCx; }   // snap left edge
    else        { newW  = snapL(newCx + newW, xLines) - newCx; }           // snap right edge
    if (isTop)  { newCy = snapL(newCy, yLines); newH = fixedB - newCy; }   // snap top edge
    else        { newH  = snapL(newCy + newH, yLines) - newCy; }           // snap bottom edge

    setSize({ w: Math.max(60, newW), h: Math.max(40, newH) });
    setPos({ x: Math.max(0, newCx), y: Math.max(0, newCy) });
  };
  const onResizePointerUp = () => {
    if (!resizingRef.current) return;
    onResizeEnd(size.w / size.h, size.w, pos.x, pos.y); // report actual AR
    resizingRef.current = null;
  };

  // Unified handlers — check ref synchronously, no stale state
  const handleMove   = (e) => resizingRef.current ? onResizePointerMove(e) : onDragPointerMove(e);
  const handleUp     = ()  => resizingRef.current ? onResizePointerUp()    : onDragPointerUp();

  // ── Rename ──────────────────────────────────────
  const commitRename = () => { setEditing(false); onRename(draft.trim() || label); };

  return (
    <div ref={cardRef} className="vi-artwork-card"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onPointerDown={onDragPointerDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <img src={url} alt={label} className="vi-artwork-img"
        style={{ objectFit: fit === 'contain' ? 'contain' : 'cover',
                 objectPosition: `${position?.x ?? 50}% ${position?.y ?? 50}%` }} />

      <div className="vi-artwork-overlay">
        <div className="vi-artwork-overlay-top">
          {editing ? (
            <input className="vi-artwork-label-input" value={draft} autoFocus
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setDraft(label); } }}
              onClick={e => e.stopPropagation()} />
          ) : (
            <span className={`vi-artwork-overlay-label ${!label ? 'vi-artwork-label-empty' : ''}`}
              onDoubleClick={e => { e.stopPropagation(); setEditing(true); setDraft(label || ''); }}>
              {label || 'Untitled'}
            </span>
          )}
          {placement === 'featured' && <span className="vi-artwork-crop-badge">Featured</span>}
        </div>
        <div className="vi-artwork-overlay-bottom">
          <button className={`vi-artwork-btn ${placement === 'featured' ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); onTogglePlacement(); }}>
            {placement === 'featured' ? <Eye size={10}/> : <EyeOff size={10}/>}
            {placement === 'featured' ? 'Featured' : 'Background'}
          </button>
          <button className="vi-artwork-btn" onClick={e => { e.stopPropagation(); onToggleFit(); }}>
            {fit === 'cover' ? 'Cover' : 'Contain'}
          </button>
          <button className="vi-artwork-btn vi-artwork-btn--danger"
            onClick={e => { e.stopPropagation(); onRemove(); }}>
            <X size={10}/> Remove
          </button>
        </div>
      </div>

      {/* Resize handles – 4 convex corners */}
      {['tl','tr','bl','br'].map(corner => (
        <div key={corner} className="vi-artwork-resize-handle"
          style={{
            position:'absolute', width:12, height:12, borderRadius:'50%',
            background:'white',
            border:'2px solid rgba(155,109,255,0.85)',
            cursor:(corner==='tl'||corner==='br') ? 'nwse-resize' : 'nesw-resize',
            ...(corner==='tl' ? {top:-6,left:-6}  : corner==='tr' ? {top:-6,right:-6} :
                corner==='bl' ? {bottom:-6,left:-6} : {bottom:-6,right:-6}),
            zIndex:30, touchAction:'none',
            transition:'transform 0.1s, opacity 0.15s',
          }}
          onPointerDown={e => onResizePointerDown(e, corner)}
        />
      ))}
    </div>
  );
}



/* ─── Artwork upload tile (div-based drop target) ───────────── */
// IMPORTANT: must be a <div>, NOT a <label> — dropping on a label
// triggers the browser to click the associated input (opening file dialog)
// instead of processing our onDrop handler.
/* ─── shared file-processor ──────────────────────────────── */
function processDroppedFile(f, onAdd) {
  if (!f) return;
  // cx/cy/cw/displayAr are stamped by addArtwork — cards always start as uniform squares
  const url   = URL.createObjectURL(f);
  const label = f.name.replace(/\.[^.]+$/, '');
  onAdd({ url, label, placement: 'featured', position: { x:50, y:50 }, fit: 'cover', aspectRatio: 1 });
}

let _artUid = 0;
/* ─── Add-artwork tile (empty state) ─────────────────────── */
function ArtworkUpload({ onAdd }) {
  const [uid]  = useState(() => `art-${++_artUid}`);
  const [over, setOver] = useState(false);
  const handleChange = (e) => { processDroppedFile(e.target.files?.[0], onAdd); e.target.value = ''; };
  const onDragOver   = (e) => { e.preventDefault(); e.stopPropagation(); setOver(true);  };
  const onDragLeave  = (e) => { e.preventDefault(); e.stopPropagation(); setOver(false); };
  const onDrop       = (e) => { e.preventDefault(); e.stopPropagation(); setOver(false); processDroppedFile(e.dataTransfer.files?.[0], onAdd); };
  return (
    <div
      className={`vi-artwork-add vi-artwork-add--fill ${over ? 'vi-drag-over' : ''}`}
      onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      <input id={uid} type="file" accept="image/*,video/*" onChange={handleChange} className="vi-file-input-hidden" />
      <label htmlFor={uid} className="vi-artwork-add-label">
        <Plus size={28} strokeWidth={1.5} />
        <span>{over ? 'Drop to add' : 'Add artwork'}</span>
      </label>
    </div>
  );
}

/* ── Path helpers ───────────────────────────────────────────────── */
function rRect(x, y, w, h, R) {
  return [
    `M${x+R},${y}`, `H${x+w-R}`, `A${R},${R},0,0,1,${x+w},${y+R}`,
    `V${y+h-R}`,    `A${R},${R},0,0,1,${x+w-R},${y+h}`,
    `H${x+R}`,      `A${R},${R},0,0,1,${x},${y+h-R}`,
    `V${y+R}`,      `A${R},${R},0,0,1,${x+R},${y}`, 'Z',
  ].join(' ');
}
// L-shape with rounded corners (3 convex = sweep 1, 3 concave = sweep 0).
// rX = right edge of card exclusion row.  topY = top of that row.
// rY = bottom of card exclusion (= where bottom strip starts).
// W,H = canvas dims, M = margin from canvas border.
function lPath(rX, topY, rY, W, H, M, R) {
  return [
    `M${rX+R},${topY}`,
    `H${W-M-R}`,        `A${R},${R},0,0,1,${W-M},${topY+R}`,  // corner 2: convex top-right
    `V${H-M-R}`,        `A${R},${R},0,0,1,${W-M-R},${H-M}`,   // corner 3: convex btm-right
    `H${M+R}`,          `A${R},${R},0,0,1,${M},${H-M-R}`,      // corner 4: convex btm-left
    `V${rY+R}`,         `A${R},${R},0,0,0,${M+R},${rY}`,       // corner 5: concave inner-left
    `H${rX-R}`,         `A${R},${R},0,0,0,${rX},${rY-R}`,      // corner 6: concave inner-btm
    `V${topY+R}`,       `A${R},${R},0,0,0,${rX+R},${topY}`,    // corner 1: concave inner-top
    'Z',
  ].join(' ');
}

// inner "card exclusion" path for evenodd punch/* ─── Individual “+ slot” bubbles ────────────────────────── */
const MAX_ARTWORKS = 10;

function ArtworkDropZone({ onAdd, canvasW, canvasH, cards }) {
  const inputRef      = useRef(null);
  const pendingSlot   = useRef(null);
  const [dragSlot, setDragSlot] = useState(-1);

  // Add item with exact slot geometry so the card fills the bubble exactly
  const addWithSlot = (file, slot) => {
    if (!file) return;
    const url   = URL.createObjectURL(file);
    const label = file.name.replace(/\.[^.]+$/, '');
    onAdd({
      url, label, placement: 'featured',
      position: { x: 50, y: 50 }, fit: 'cover', aspectRatio: slot.w / slot.h,
      cx: slot.x, cy: slot.y, cw: slot.w, displayAr: slot.w / slot.h,
    });
  };

  // File dialog result — use the slot that was pending when dialog opened
  const handleChange = (e) => {
    addWithSlot(e.target.files?.[0], pendingSlot.current || { x:0, y:0, w:canvasW, h:canvasH });
    pendingSlot.current = null;
    e.target.value = '';
  };

  if (!canvasW || !canvasH) return null;

  if (cards.length >= MAX_ARTWORKS) return null;

  const P  = 20;        // padding from frame edges — matches other cards
  const G  = 10;        // horizontal gap between slots
  const GV = 20;        // vertical gap between rows
  const COLS = 5, ROWS = 2;

  // Square slots: height = width
  const bW = Math.floor((canvasW - 2 * P - (COLS - 1) * G)  / COLS);
  const bH = bW; // ← square
  const allSlots = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      allSlots.push({ x: P + c * (bW + G), y: P + r * (bH + GV), w: bW, h: bH });

  // Keep only slots that are NOT spatially occupied by an existing card
  // cd.ch is pre-computed in ArtworkPanel with the correct displayAr
  const safePositions = allSlots.filter(slot =>
    !cards.some(cd => {
      const ch = cd.ch ?? cd.cw; // use pre-computed ch; fall back to cw if missing
      return (
        cd.cx         < slot.x + slot.w &&
        cd.cx + cd.cw > slot.x &&
        cd.cy         < slot.y + slot.h &&
        cd.cy + ch    > slot.y
      );
    })
  );

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,video/*" onChange={handleChange}
        className="vi-file-input-hidden" />
      {safePositions.map((pos, i) => {
        const dragOver = dragSlot === i;
        return (
          <div key={i} role="button" aria-label="Add artwork"
            style={{
              position: 'absolute',
              left: pos.x, top: pos.y, width: pos.w, height: pos.h,
              borderRadius: 14,
              border: `2px dashed ${dragOver ? 'rgba(165,120,255,0.9)' : 'rgba(255,255,255,0.22)'}`,
              background: dragOver ? 'rgba(155,109,255,0.18)' : 'rgba(255,255,255,0.035)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.18s, background 0.18s, filter 0.18s',
              filter: dragOver ? 'drop-shadow(0 0 10px rgba(155,109,255,0.55))' : 'none',
              zIndex: 0,
            }}
            onClick={() => { pendingSlot.current = pos; inputRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragSlot(i); }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragSlot(i); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragSlot(-1); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation(); setDragSlot(-1);
              addWithSlot(e.dataTransfer.files?.[0], pos);
            }}
          >
            <span style={{
              fontSize: 26, fontWeight: 300, lineHeight: 1, userSelect: 'none',
              color: dragOver ? 'rgba(210,175,255,1)' : 'rgba(255,255,255,0.35)',
              fontFamily: 'Inter,system-ui,sans-serif',
              transition: 'color 0.18s',
            }}>+</span>
          </div>
        );
      })}
    </>
  );
}



/* ─── Artwork panel ───────────────────────────────────────── */


/* ─── Artwork panel ───────────────────────────────────────── */
function ArtworkPanel({ artworks, onAdd, onRemove, onTogglePlacement, onOpenReposition, onToggleFit, onResizeEnd, onMoveCard, onRenameArt }) {
  const isFull = artworks.length >= MAX_ARTWORKS;
  const GAP = 12;

  // Measure canvas dimensions via ref-callback (fires on mount + resize)
  const [canvasW, setCanvasW] = useState(0);
  const [canvasHObs, setCanvasHObs] = useState(0);
  const _roRef = useRef(null);
  const canvasRef = useCallback((el) => {
    if (_roRef.current) { _roRef.current.disconnect(); _roRef.current = null; }
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width  > 0) setCanvasW(Math.round(rect.width));
    if (rect.height > 0) setCanvasHObs(Math.round(rect.height));
    const ro = new ResizeObserver(([e]) => {
      setCanvasW(Math.round(e.contentRect.width));
      setCanvasHObs(Math.round(e.contentRect.height));
    });
    ro.observe(el);
    _roRef.current = ro;
  }, []);

  // Next empty grid slot (2-column layout)
  const nextI  = artworks.length;
  const nextCx = (nextI % 2) * (CARD_SIZE + GAP);
  const nextCy = Math.floor(nextI / 2) * (CARD_SIZE + GAP);

  // Slot grid snap lines — LEFT edges and RIGHT edges of columns, TOP and BOTTOM of rows
  const _P=20, _G=10, _GV=20, _COLS=5, _ROWS=2;
  const _bW = canvasW > 0 ? Math.floor((canvasW - 2*_P - (_COLS-1)*_G) / _COLS) : 0;
  const _bH = _bW; // square slots — height equals width
  const _requiredH = _bW > 0 ? 2*_P + (_ROWS-1)*_GV + _ROWS*_bW : 300;
  // LEFT edges only → for snapping card’s LEFT edge to slot’s LEFT edge
  const slotXSnap   = _bW > 0 ? Array.from({length:_COLS}, (_,c) => _P + c*(_bW+_G))             : [0];
  // RIGHT edges only → for snapping card’s RIGHT edge to slot’s RIGHT edge
  const slotXRight  = _bW > 0 ? Array.from({length:_COLS}, (_,c) => _P + c*(_bW+_G) + _bW)       : [];
  // TOP edges only → for snapping card’s TOP edge to slot’s TOP edge
  const slotYSnap   = _bH > 0 ? Array.from({length:_ROWS}, (_,r) => _P + r*(_bH+_GV))            : [0];
  // BOTTOM edges only → for snapping card’s BOTTOM edge to slot’s BOTTOM edge
  const slotYBottom = _bH > 0 ? Array.from({length:_ROWS}, (_,r) => _P + r*(_bH+_GV) + _bH)      : [];

  // Canvas height: use actual observed height so slots always fill the rendered area.
  // Falls back to 300 on first render (before ResizeObserver fires).
  // Also grows if a card is dragged/resized outside the grid bounds.
  const canvasH = Math.max(
    _requiredH || 300,
    canvasHObs,
    ...artworks.map(a => (a.cy ?? 0) + Math.round((a.cw ?? 150) / (a.displayAr || 1))),
  );

  // Card geometry for bubble exclusion (ch pre-computed here with correct displayAr)
  const cardRects = artworks.map(a => ({
    cx: a.cx ?? 0, cy: a.cy ?? 0,
    cw: a.cw ?? 150,
    ch: Math.round((a.cw ?? 150) / (a.displayAr || 1)),
  }));

  return (
    <div className="vi-card vi-card--artwork vi-area-artworks glass">
      <div className="vi-card-title"><LayoutGrid size={15}/> Artworks &amp; Promo Material</div>

      {artworks.length > 0 && (
        <p className="vi-card-hint">
          Drag to reposition · corners to resize · double-click label to rename.
          {isFull && <strong> (10/10 — remove one to add more)</strong>}
        </p>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="vi-artwork-canvas"
        style={{ minHeight: _requiredH || 300 }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation();
          if (!isFull) processDroppedFile(e.dataTransfer.files?.[0], onAdd);
        }}
      >
        {artworks.map((a, i) => (
          <ArtworkCard
            key={i}
            url={a.url}
            label={a.label}
            placement={a.placement}
            position={a.position || { x:50, y:50 }}
            fit={a.fit || 'cover'}
            aspectRatio={a.aspectRatio || 1}
            displayAr={a.displayAr || a.aspectRatio || 1}
            clipPoints={a.clipPoints || null}
            cx={a.cx ?? (i * 22)}
            cy={a.cy ?? (i * 22)}
            cw={a.cw ?? 150}
            otherCards={artworks.filter((_, j) => j !== i).map(o => ({
              cx: o.cx ?? 0, cy: o.cy ?? 0,
              cw: o.cw ?? 150, displayAr: o.displayAr || 1,
            }))}
            slotXSnap={slotXSnap}
            slotXRight={slotXRight}
            slotYSnap={slotYSnap}
            slotYBottom={slotYBottom}
            onRemove={() => onRemove(i)}
            onTogglePlacement={() => onTogglePlacement(i)}
            onOpenReposition={() => onOpenReposition(i)}
            onToggleFit={() => onToggleFit(i)}
            onResizeEnd={(newAr, newW, newCx, newCy) => onResizeEnd(i, newAr, newW, newCx, newCy)}
            onMoveEnd={(x, y) => onMoveCard(i, x, y)}
            onRename={(newLabel) => onRenameArt(i, newLabel)}
          />
        ))}

        {/* Remaining "+" slot bubbles */}
        {!isFull && (
          <ArtworkDropZone
            onAdd={onAdd}
            canvasW={canvasW}
            canvasH={canvasH}
            cards={cardRects}
            nextCx={nextCx}
            nextCy={nextCy}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Color presets ──────────────────────────────────────────── */
const COLOR_PRESETS = [
  { name: 'Kyoyu',    primary: '#9b6dff', secondary: '#29b6f6' },
  { name: 'Dusk',     primary: '#ff6d9b', secondary: '#ffb347' },
  { name: 'Forest',   primary: '#43d9a1', secondary: '#00bcd4' },
  { name: 'Mono',     primary: '#e0e0e0', secondary: '#9e9e9e' },
  { name: 'Solar',    primary: '#ffd740', secondary: '#ff6e40' },
  { name: 'Ocean',    primary: '#2979ff', secondary: '#ff9100' },
];

/* ─── Main Visual Identity Page ──────────────────────────────── */
export default function VisualIdentity() {
  const [vi, setVI] = useVIStore();
  const {
    coverImage, coverPosition,
    avatarImage, avatarPosition,
    displayMode, primary, secondary,
    artworks,
  } = vi;

  const [links, setLinks] = useState(vi.links || []);
  const [bio,   setBio]   = useState(vi.bio   || '');
  const [saved, setSaved] = useState(false);

  // Sync links + bio to store
  useEffect(() => { setVI(s => ({ ...s, links })); }, [links]);
  useEffect(() => { setVI(s => ({ ...s, bio   })); }, [bio]);

  /* ── Artwork handlers ── */
  const addArtwork = item => setVI(s => {
    const arr = s.artworks || [];
    // If the item was dropped on a specific slot, it already carries cx/cy/cw/displayAr
    if (item.cx !== undefined) {
      return { artworks: [...arr, item] };
    }
    // Fallback: place at the next grid position
    const i   = arr.length;
    const GAP = 12;
    const col = i % 2;
    const row = Math.floor(i / 2);
    return { artworks: [...arr, { ...item, cx: col * (CARD_SIZE + GAP), cy: row * (CARD_SIZE + GAP), cw: CARD_SIZE, displayAr: 1 }] };
  });
  const removeArt       = i    => setVI(s => ({ artworks: (s.artworks||[]).filter((_,j) => j !== i) }));
  const togglePlacement = i    => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) =>
    idx === i ? { ...a, placement: a.placement === 'featured' ? 'background' : 'featured' } : a
  )}));
  const updateArtPos    = (i, p) => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) => idx === i ? { ...a, position: p } : a) }));
  const setArtFit       = (i, f) => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) => idx === i ? { ...a, fit: f } : a) }));
  const toggleArtFit    = i     => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) =>
    idx === i ? { ...a, fit: a.fit === 'natural' ? 'cover' : a.fit === 'cover' ? 'contain' : 'cover' } : a
  )}));
  const moveCard        = (i, x, y) => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) => idx === i ? { ...a, cx: x, cy: y } : a) }));
  const renameArt       = (i, newLabel) => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) => idx === i ? { ...a, label: newLabel } : a) }));
  const resizeArt       = (i, newAr, newW, newCx, newCy) => setVI(s => ({ artworks: (s.artworks||[]).map((a, idx) =>
    idx === i ? { ...a, displayAr: newAr, cw: Math.round(newW), cx: Math.round(newCx), cy: Math.round(newCy) } : a
  )}));

  const addLink    = ()           => setLinks(prev => [...prev, { label:'', url:'' }]);
  const removeLink = i            => setLinks(prev => prev.filter((_,j) => j !== i));
  const updateLink = (i, f, val)  => setLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [f]: val } : l));

  /* Global guard — stop browser navigating when files dropped on page background */
  const handlePageDragOver = (e) => { e.preventDefault(); };
  const handlePageDrop     = (e) => { e.preventDefault(); };

  const navigate = useNavigate();
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div
      className="page visual-identity-page animate-in"
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
      <div className="vi-header">
        <div>
          <h1>Visual Identity</h1>
          <p className="vi-header-sub">Customize how your profile looks to listeners</p>
        </div>
        <div className="vi-header-actions">
          {saved && <span className="vi-saved-toast"><Check size={13}/> Saved</span>}
          <button className="vi-preview-btn" onClick={() => navigate('/preview')}>
            <Eye size={14} strokeWidth={1.8} /> Preview
          </button>
          <button className="vi-save-btn" onClick={handleSave}>Save Changes</button>
        </div>
      </div>

      <div className="vi-grid">

        {/* ── Left column (1/3): Avatar · Palette · Links · Display ─── */}
        <div className="vi-col">

          {/* Avatar */}
          <ResizableCard id="avatar" className="vi-area-avatar glass">
            <div className="vi-card-title"><CircleUser size={15}/> Artist Avatar</div>
            <AvatarField
              image={avatarImage}
              position={avatarPosition || { x:50, y:50 }}
              onImage={url => setVI(s => ({ ...s, avatarImage: url }))}
              onPosition={p => setVI(s => ({ ...s, avatarPosition: p }))}
              onRemove={() => setVI(s => ({ ...s, avatarImage: null }))}
            />
          </ResizableCard>

          {/* Color palette */}
          <ResizableCard id="palette" className="vi-area-palette glass">
            <div className="vi-card-title"><Palette size={15}/> Color Palette</div>
            <div className="vi-palette-presets">
              {COLOR_PRESETS.map(p => (
                <button key={p.name}
                  className={`vi-preset-btn ${primary === p.primary && secondary === p.secondary ? 'active' : ''}`}
                  onClick={() => setVI(s => ({ ...s, primary: p.primary, secondary: p.secondary }))}
                >
                  <span style={{ background: p.primary }} />
                  <span style={{ background: p.secondary }} />
                  <span className="vi-preset-label">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="vi-color-pickers">
              <div className="vi-color-row">
                <label>Primary</label>
                <input type="color" value={primary} onChange={e => setVI(s => ({ ...s, primary: e.target.value }))} />
                <code>{primary}</code>
              </div>
              <div className="vi-color-row">
                <label>Secondary</label>
                <input type="color" value={secondary} onChange={e => setVI(s => ({ ...s, secondary: e.target.value }))} />
                <code>{secondary}</code>
              </div>
            </div>
          </ResizableCard>

          {/* Links */}
          <ResizableCard id="links" className="vi-area-linkscard glass">
            <div className="vi-card-title"><Link2 size={15}/> Links</div>
            <div className="vi-links-list">
              {links.map((l, i) => (
                <div key={i} className="vi-link-row">
                  <input
                    placeholder="Label (e.g. Spotify)"
                    value={l.label}
                    onChange={e => updateLink(i, 'label', e.target.value)}
                  />
                  <input
                    placeholder="URL"
                    value={l.url}
                    onChange={e => updateLink(i, 'url', e.target.value)}
                  />
                  <button className="vi-link-remove" onClick={() => removeLink(i)}><X size={12}/></button>
                </div>
              ))}
            </div>
            <button className="vi-add-link-btn" onClick={addLink}><Plus size={12}/> Add link</button>
          </ResizableCard>

          {/* Display mode */}
          <ResizableCard id="display" className="vi-area-display glass">
            <div className="vi-card-title"><Eye size={15}/> Display Mode</div>
            <div className="vi-mode-pills">
              {[
                { id: 'prominent', label: 'Prominent', icon: <Eye size={13}/> },
                { id: 'minimal',   label: 'Minimal',   icon: <EyeOff size={13}/> },
              ].map(m => (
                <button
                  key={m.id}
                  className={`vi-mode-pill ${displayMode === m.id ? 'active' : ''}`}
                  onClick={() => setVI(s => ({ ...s, displayMode: m.id }))}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <p className="vi-mode-desc">
              {displayMode === 'prominent'
                ? 'Your cover and artwork are displayed prominently in the listener experience.'
                : 'Minimal display keeps focus on audio content with reduced visuals.'}
            </p>
          </ResizableCard>

        </div>{/* end left col */}

        {/* ── Right column (2/3): Cover · Artworks · About ──── */}
        <div className="vi-col">

          {/* Cover image */}
          <ResizableCard id="cover" className="vi-area-cover glass">
            <div className="vi-card-title"><Image size={15}/> Cover Image</div>
            <CoverImageField
              image={coverImage}
              position={coverPosition || { x:50, y:50 }}
              onImage={url => setVI(s => ({ ...s, coverImage: url }))}
              onPosition={p => setVI(s => ({ ...s, coverPosition: p }))}
              onRemove={() => setVI(s => ({ ...s, coverImage: null }))}
            />
          </ResizableCard>

          {/* Artworks */}
          <ArtworkPanel
            artworks={artworks || []}
            onAdd={addArtwork}
            onRemove={removeArt}
            onTogglePlacement={togglePlacement}
            onOpenReposition={updateArtPos}
            onToggleFit={toggleArtFit}
            onResizeEnd={resizeArt}
            onMoveCard={moveCard}
            onRenameArt={renameArt}
          />

          {/* About — bio only */}
          <ResizableCard id="about" className="vi-area-links glass">
            <div className="vi-card-title"><AlignLeft size={15}/> About</div>
            <textarea
              className="vi-bio-textarea"
              placeholder="Write a short bio for your listeners…"
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={5}
            />
          </ResizableCard>

        </div>{/* end right col */}


      </div>
    </div>
  );
}
