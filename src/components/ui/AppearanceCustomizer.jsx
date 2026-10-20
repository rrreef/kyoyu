import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useTheme, THEMES, DEFAULT_CUSTOM_BG } from '../../hooks/useTheme';

const MODE_PREVIEWS = {
  white:  { bg: '#f8f8f8', surface: 'rgba(0,0,0,0.07)',       bar: 'rgba(0,0,0,0.05)' },
  dark:   { bg: '#060606', surface: 'rgba(255,255,255,0.09)', bar: 'rgba(255,255,255,0.06)' },
  custom: { bg: '#7c7c7c', surface: 'rgba(255,255,255,0.22)', bar: 'rgba(255,255,255,0.16)' },
};

// ── Color Conversion Utilities (matching ivanvmat/color-picker) ──────────────

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function hsvToRgb(h, s, v) {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = clamp(s, 0, 100) / 100;
  const vNorm = clamp(v, 0, 100) / 100;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = vNorm - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hNorm >= 0 && hNorm < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (hNorm >= 60 && hNorm < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (hNorm >= 120 && hNorm < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (hNorm >= 180 && hNorm < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (hNorm >= 240 && hNorm < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return {
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  };
}

function rgbToHsv(r, g, b) {
  const rNorm = clamp(r, 0, 255) / 255;
  const gNorm = clamp(g, 0, 255) / 255;
  const bNorm = clamp(b, 0, 255) / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rNorm) {
      h = 60 * (((gNorm - bNorm) / d) % 6);
    } else if (max === gNorm) {
      h = 60 * ((bNorm - rNorm) / d + 2);
    } else {
      h = 60 * ((rNorm - gNorm) / d + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hexToRgb(hexStr) {
  const clean = (hexStr || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

// ── Scrubbable + Click-to-Edit Range Bar (RGB / HSV rows) ────────────────────

function ScrubRangeRow({ label, value, min, max, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const barRef = useRef(null);
  const inputRef = useRef(null);
  const dragStateRef = useRef({ active: false, moved: false, startX: 0 });

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const updateFromClientX = (clientX) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextVal = min + ratio * (max - min);
    onChange(nextVal);
  };

  const handlePointerDown = (e) => {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = { active: true, moved: false, startX: e.clientX };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    e.preventDefault();
    e.stopPropagation();
    if (Math.abs(e.clientX - st.startX) > 3) {
      st.moved = true;
    }
    if (st.moved) {
      updateFromClientX(e.clientX);
    }
  };

  const handlePointerUp = (e) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    st.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (!st.moved) {
      setDraft(Number(value).toFixed(2));
      setEditing(true);
    }
  };

  const commitDraft = () => {
    setEditing(false);
    const num = parseFloat(draft);
    if (!Number.isNaN(num)) {
      onChange(clamp(num, min, max));
    }
  };

  const pct = clamp(((value - min) / (max - min)) * 100, 0, 100);

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        width: '100%',
        height: 24,
        background: '#404040',
        borderBottom: '1px solid #303030',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        cursor: editing ? 'text' : 'ew-resize',
        overflow: 'hidden',
        fontFamily: 'var(--font-body), sans-serif',
        fontSize: 12,
        color: '#ffffff',
      }}
    >
      {!editing && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${pct}%`,
              background: '#606060',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '100%',
              padding: '0 8px',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>{label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#ffffff' }}>
              {Number(value).toFixed(2)}
            </span>
          </div>
        </>
      )}

      {editing && (
        <input
          ref={inputRef}
          type="number"
          step="any"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: '100%',
            height: '100%',
            background: '#2c2c2c',
            color: '#ffffff',
            border: 'none',
            outline: 'none',
            padding: '0 8px',
            textAlign: 'center',
            fontSize: '16px',
            fontFamily: 'inherit',
          }}
        />
      )}
    </div>
  );
}

// ── Flat RGB / HSV / HEX Color Picker (ivanvmat/color-picker architecture) ───

function FlatColorPicker({ value, onChange }) {
  const initialRgb = hexToRgb(value) || hexToRgb(DEFAULT_CUSTOM_BG);
  const initialHsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);

  const [hsv, setHsv] = useState(initialHsv);
  const [activeTab, setActiveTab] = useState('HSV'); // 'RGB' | 'HSV' | 'HEX'
  const [hexEditing, setHexEditing] = useState(false);
  const [hexDraft, setHexDraft] = useState('');

  const offscreenWheelRef = useRef(null);
  const wheelCanvasRef = useRef(null);
  const wheelWrapRef = useRef(null);
  const brightnessBarRef = useRef(null);
  const draggingWheelRef = useRef(false);
  const draggingBrightRef = useRef(false);
  const hexInputRef = useRef(null);

  // Sync internal HSV if parent value changes to a different hex externally (e.g. Reset/Clear)
  useEffect(() => {
    const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase();
    const propHex = (value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(propHex) && propHex !== currentHex) {
      const rgb = hexToRgb(propHex);
      if (rgb) {
        setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
      }
    }
  }, [value]);

  // 1. Pre-render the 272x272 offscreen Hue/Saturation wheel once
  useEffect(() => {
    const size = 272;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const radius = size / 2;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px + 0.5 - radius;
        const dy = py + 0.5 - radius;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius) {
          // Match ivanvmat/color-picker angle convention: atan2(dy, dx) * 180/PI - 90
          const angle = (((Math.atan2(dy, dx) * 180) / Math.PI) - 90 + 360) % 360;
          const sat = clamp((dist / radius) * 100, 0, 100);
          const { r, g, b } = hsvToRgb(angle, sat, 100);
          // Smooth 1px anti-aliased edge
          const edgeAlpha = clamp(radius - dist, 0, 1);
          const idx = (py * size + px) * 4;
          data[idx] = Math.round(r);
          data[idx + 1] = Math.round(g);
          data[idx + 2] = Math.round(b);
          data[idx + 3] = Math.round(edgeAlpha * 255);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    offscreenWheelRef.current = offscreen;

    // Draw initial frame
    const canvas = wheelCanvasRef.current;
    if (canvas) {
      const vCtx = canvas.getContext('2d');
      vCtx.clearRect(0, 0, size, size);
      vCtx.drawImage(offscreen, 0, 0);
      const darkAlpha = clamp(1 - hsv.v / 100, 0, 1);
      if (darkAlpha > 0) {
        vCtx.save();
        vCtx.globalCompositeOperation = 'source-atop';
        vCtx.fillStyle = `rgba(0, 0, 0, ${darkAlpha})`;
        vCtx.fillRect(0, 0, size, size);
        vCtx.restore();
      }
    }
  }, []);

  // 2. Redraw wheel canvas whenever Brightness (V) changes
  useEffect(() => {
    const canvas = wheelCanvasRef.current;
    const offscreen = offscreenWheelRef.current;
    if (!canvas || !offscreen) return;
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(offscreen, 0, 0);
    const darkAlpha = clamp(1 - hsv.v / 100, 0, 1);
    if (darkAlpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0, 0, 0, ${darkAlpha})`;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }
  }, [hsv.v]);

  const applyHsv = useCallback((nextHsv) => {
    const clean = {
      h: ((nextHsv.h % 360) + 360) % 360,
      s: clamp(nextHsv.s, 0, 100),
      v: clamp(nextHsv.v, 0, 100),
    };
    setHsv(clean);
    onChange(hsvToHex(clean.h, clean.s, clean.v));
  }, [onChange]);

  // ── Wheel Pointer Handlers ──
  const pickWheelAt = (clientX, clientY) => {
    const el = wheelWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = rect.width / 2;
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const h = (((Math.atan2(dy, dx) * 180) / Math.PI) - 90 + 360) % 360;
    const s = clamp((dist / radius) * 100, 0, 100);
    applyHsv({ h, s, v: hsv.v });
  };

  const onWheelPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingWheelRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    pickWheelAt(e.clientX, e.clientY);
  };

  const onWheelPointerMove = (e) => {
    if (!draggingWheelRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    pickWheelAt(e.clientX, e.clientY);
  };

  const onWheelPointerUp = (e) => {
    if (!draggingWheelRef.current) return;
    draggingWheelRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // ── Brightness Slider Pointer Handlers ──
  const pickBrightnessAt = (clientY) => {
    const el = brightnessBarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.height) return;
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    applyHsv({ h: hsv.h, s: hsv.s, v });
  };

  const onBrightPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingBrightRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    pickBrightnessAt(e.clientY);
  };

  const onBrightPointerMove = (e) => {
    if (!draggingBrightRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    pickBrightnessAt(e.clientY);
  };

  const onBrightPointerUp = (e) => {
    if (!draggingBrightRef.current) return;
    draggingBrightRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  useEffect(() => {
    if (hexEditing && hexInputRef.current) {
      hexInputRef.current.focus();
      hexInputRef.current.select();
    }
  }, [hexEditing]);

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const pureBrightnessHex = hsvToHex(hsv.h, hsv.s, 100);

  // Wheel thumb coordinates (in % of wheel container)
  const angleRad = ((hsv.h + 90) * Math.PI) / 180;
  const distRatio = hsv.s / 100;
  const thumbLeftPct = 50 + distRatio * 50 * Math.cos(angleRad);
  const thumbTopPct = 50 + distRatio * 50 * Math.sin(angleRad);

  // Brightness thumb vertical position (in % from top)
  const brightTopPct = clamp(100 - hsv.v, 0, 100);

  const commitHexDraft = () => {
    setHexEditing(false);
    const cleaned = hexDraft.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      const parsed = hexToRgb(cleaned);
      if (parsed) {
        applyHsv(rgbToHsv(parsed.r, parsed.g, parsed.b));
      }
    }
  };

  return (
    <div
      style={{
        width: '100%',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#202020',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
      }}
    >
      {/* 1. Top Control Group: Circular Hue/Saturation Wheel + Vertical Brightness Slider */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          height: 158,
          padding: 12,
          gap: 16,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Circular Color Wheel */}
        <div
          ref={wheelWrapRef}
          onPointerDown={onWheelPointerDown}
          onPointerMove={onWheelPointerMove}
          onPointerUp={onWheelPointerUp}
          onPointerCancel={onWheelPointerUp}
          style={{
            position: 'relative',
            width: 134,
            height: 134,
            borderRadius: '50%',
            cursor: 'crosshair',
            touchAction: 'none',
            flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
          }}
        >
          <canvas
            ref={wheelCanvasRef}
            width={272}
            height={272}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              borderRadius: '50%',
              pointerEvents: 'none',
            }}
          />
          {/* Wheel Thumb */}
          <div
            style={{
              position: 'absolute',
              left: `${thumbLeftPct}%`,
              top: `${thumbTopPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 13,
              height: 13,
              borderRadius: '50%',
              backgroundColor: currentHex,
              border: '1.5px solid rgba(255,255,255,0.92)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Vertical Brightness Control Bar */}
        <div
          ref={brightnessBarRef}
          onPointerDown={onBrightPointerDown}
          onPointerMove={onBrightPointerMove}
          onPointerUp={onBrightPointerUp}
          onPointerCancel={onBrightPointerUp}
          style={{
            position: 'relative',
            width: 11,
            height: 134,
            borderRadius: 6,
            background: `linear-gradient(to bottom, ${pureBrightnessHex} 0%, #000000 100%)`,
            border: '1px solid rgba(255,255,255,0.25)',
            cursor: 'ns-resize',
            touchAction: 'none',
            flexShrink: 0,
          }}
        >
          {/* Brightness Thumb */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: `${brightTopPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 13,
              height: 13,
              borderRadius: '50%',
              backgroundColor: currentHex,
              border: '1.5px solid rgba(255,255,255,0.92)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* 2. Bottom Control Group: RGB | HSV | HEX Tabs + Scrubbable/Editable Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Tab Headers */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            background: '#2b2b2b',
            borderTop: '1px solid #333333',
            borderBottom: '1px solid #1a1a1a',
          }}
        >
          {['RGB', 'HSV', 'HEX'].map((tabId) => {
            const isTabActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                data-kyoyu-injected="1"
                onClick={() => setActiveTab(tabId)}
                style={{
                  flex: 1,
                  height: 28,
                  border: 'none',
                  outline: 'none',
                  background: isTabActive ? '#505050' : '#303030',
                  color: isTabActive ? '#ffffff' : 'rgba(255,255,255,0.68)',
                  fontSize: 12,
                  fontWeight: isTabActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                }}
              >
                {tabId}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{ padding: 6, background: '#202020' }}>
          <div style={{ borderRadius: 5, overflow: 'hidden', border: '1px solid #303030' }}>
            {activeTab === 'RGB' && (
              <>
                <ScrubRangeRow
                  label="R:"
                  value={rgb.r}
                  min={0}
                  max={255}
                  onChange={(nextR) => applyHsv(rgbToHsv(nextR, rgb.g, rgb.b))}
                />
                <ScrubRangeRow
                  label="G:"
                  value={rgb.g}
                  min={0}
                  max={255}
                  onChange={(nextG) => applyHsv(rgbToHsv(rgb.r, nextG, rgb.b))}
                />
                <ScrubRangeRow
                  label="B:"
                  value={rgb.b}
                  min={0}
                  max={255}
                  onChange={(nextB) => applyHsv(rgbToHsv(rgb.r, rgb.g, nextB))}
                />
              </>
            )}

            {activeTab === 'HSV' && (
              <>
                <ScrubRangeRow
                  label="H:"
                  value={hsv.h}
                  min={0}
                  max={360}
                  onChange={(nextH) => applyHsv({ h: nextH, s: hsv.s, v: hsv.v })}
                />
                <ScrubRangeRow
                  label="S:"
                  value={hsv.s}
                  min={0}
                  max={100}
                  onChange={(nextS) => applyHsv({ h: hsv.h, s: nextS, v: hsv.v })}
                />
                <ScrubRangeRow
                  label="V:"
                  value={hsv.v}
                  min={0}
                  max={100}
                  onChange={(nextV) => applyHsv({ h: hsv.h, s: hsv.s, v: nextV })}
                />
              </>
            )}

            {activeTab === 'HEX' && (
              <div
                onClick={() => {
                  if (!hexEditing) {
                    setHexDraft(currentHex.replace(/^#/, ''));
                    setHexEditing(true);
                  }
                }}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 26,
                  background: '#404040',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: hexEditing ? 0 : '0 8px',
                  cursor: 'text',
                  fontSize: 12,
                  color: '#ffffff',
                }}
              >
                {!hexEditing ? (
                  <>
                    <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>Hex:</span>
                    <span style={{ fontFamily: 'monospace', textTransform: 'lowercase' }}>
                      {currentHex.replace(/^#/, '')}
                    </span>
                  </>
                ) : (
                  <input
                    ref={hexInputRef}
                    type="text"
                    maxLength={7}
                    value={hexDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHexDraft(v);
                      const clean = v.trim().replace(/^#/, '');
                      if (/^[0-9a-fA-F]{6}$/.test(clean)) {
                        const parsed = hexToRgb(clean);
                        if (parsed) {
                          applyHsv(rgbToHsv(parsed.r, parsed.g, parsed.b));
                        }
                      }
                    }}
                    onBlur={commitHexDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitHexDraft();
                      if (e.key === 'Escape') setHexEditing(false);
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      background: '#2c2c2c',
                      color: '#ffffff',
                      border: 'none',
                      outline: 'none',
                      textAlign: 'center',
                      fontSize: '16px',
                      fontFamily: 'monospace',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main AppearanceCustomizer Component ──────────────────────────────────────

export default function AppearanceCustomizer({ compact = false }) {
  const [, , appearance] = useTheme();
  const {
    mode,
    setMode,
    customBg,
    setCustomBg,
    glassTint,
    setGlassTint,
  } = appearance;

  const activeCustomBg = customBg || DEFAULT_CUSTOM_BG;

  return (
    <div
      className="kyoyu-appearance-customizer"
      style={{ display: 'flex', flexDirection: 'column', gap: compact ? 14 : 18, width: '100%' }}
    >
      {/* 1. Top-level Mode Selector: Light / Dark / Customized */}
      <div
        className="s-theme-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: compact ? 8 : 10,
          width: '100%',
        }}
      >
        {THEMES.map(({ id, label }) => {
          const p = MODE_PREVIEWS[id] || MODE_PREVIEWS.white;
          const active = mode === id;
          const cardBgPreview = id === 'custom' ? activeCustomBg : p.bg;
          const cardTintPreview = id === 'custom' && glassTint ? glassTint : null;
          return (
            <button
              key={id}
              type="button"
              data-kyoyu-injected="1"
              className={`s-theme-card ${active ? 'active' : ''}`}
              onClick={() => setMode(id)}
              style={{
                '--th-bg': cardBgPreview,
                '--th-surface': p.surface,
                minWidth: 0,
                width: '100%',
                borderColor: active
                  ? (cardTintPreview || 'var(--text-primary)')
                  : 'var(--glass-border)',
              }}
            >
              <div
                className="s-theme-preview"
                style={{
                  height: compact ? 54 : 76,
                  background: cardBgPreview,
                }}
              >
                <div
                  className="s-theme-preview-bar"
                  style={
                    cardTintPreview
                      ? { background: `color-mix(in srgb, ${cardTintPreview} 35%, ${p.bar})` }
                      : undefined
                  }
                />
                <div
                  className="s-theme-preview-card"
                  style={
                    cardTintPreview
                      ? {
                          background: `color-mix(in srgb, ${cardTintPreview} 32%, ${p.surface})`,
                          borderColor: cardTintPreview,
                        }
                      : undefined
                  }
                />
                <div
                  className="s-theme-preview-card s-theme-preview-card--2"
                  style={
                    cardTintPreview
                      ? {
                          background: `color-mix(in srgb, ${cardTintPreview} 26%, ${p.surface})`,
                          borderColor: cardTintPreview,
                        }
                      : undefined
                  }
                />
              </div>
              <div
                className="s-theme-label"
                style={{
                  padding: compact ? '7px 6px' : '9px 8px',
                  fontSize: compact ? '0.72rem' : '0.78rem',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {active ? <Check size={11} strokeWidth={3} /> : null}
                {label}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Customized Theme Pickers: Background Main Color + Glass Lens Elements */}
      {mode === 'custom' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: compact ? 14 : 18,
            borderRadius: 18,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            animation: 'fadeIn 0.2s ease forwards',
          }}
        >
          {/* Picker 1: Background Main Color (defaults to #7c7c7c gray) */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: activeCustomBg,
                    border: '1.5px solid rgba(255,255,255,0.65)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Background Main Color
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Default gray ({DEFAULT_CUSTOM_BG}) — pick via wheel, brightness, RGB, HSV or HEX
                  </div>
                </div>
              </div>

              {activeCustomBg.toLowerCase() !== DEFAULT_CUSTOM_BG && (
                <button
                  type="button"
                  data-kyoyu-injected="1"
                  onClick={() => setCustomBg(DEFAULT_CUSTOM_BG)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg-active)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={10} />
                  Reset Gray
                </button>
              )}
            </div>

            <FlatColorPicker
              value={activeCustomBg}
              onChange={(hex) => setCustomBg(hex)}
            />
          </div>

          <div style={{ height: 1, background: 'var(--glass-border-subtle)' }} />

          {/* Picker 2: Glass Lens Elements */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: glassTint || 'transparent',
                    border: glassTint
                      ? '1.5px solid rgba(255,255,255,0.65)'
                      : '1.5px dashed var(--text-muted)',
                    boxShadow: glassTint ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Glass Lens Elements
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {glassTint
                      ? `Tinted (${glassTint.toUpperCase()}) across buttons, filters, dock & sheets`
                      : 'Neutral glass — use wheel, brightness, RGB, HSV or HEX to tint'}
                  </div>
                </div>
              </div>

              {glassTint && (
                <button
                  type="button"
                  data-kyoyu-injected="1"
                  onClick={() => setGlassTint('')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg-active)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={10} />
                  Clear
                </button>
              )}
            </div>

            <FlatColorPicker
              value={glassTint || '#64d2ff'}
              onChange={(hex) => setGlassTint(hex)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
