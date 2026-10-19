import React, { useRef, useEffect, useCallback } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useTheme, THEMES, CUSTOM_BASE_THEMES } from '../../hooks/useTheme';

const MODE_PREVIEWS = {
  white:  { bg: '#f8f8f8', surface: 'rgba(0,0,0,0.07)',       bar: 'rgba(0,0,0,0.05)' },
  dark:   { bg: '#060606', surface: 'rgba(255,255,255,0.09)', bar: 'rgba(255,255,255,0.06)' },
  custom: { bg: 'linear-gradient(135deg, #060606 0%, #7c7c7c 50%, #f8f8f8 100%)', surface: 'rgba(255,255,255,0.22)', bar: 'rgba(255,255,255,0.16)' },
};

const BASE_PREVIEWS = {
  white: { bg: '#f8f8f8', fg: '#0f0f0f', border: 'rgba(0,0,0,0.14)',       sub: 'Bright & crisp' },
  grey:  { bg: '#7c7c7c', fg: '#ffffff', border: 'rgba(255,255,255,0.24)', sub: 'Exact midpoint' },
  dark:  { bg: '#060606', fg: '#ffffff', border: 'rgba(255,255,255,0.16)', sub: 'Deep obsidian'  },
};

function hslToHex(h, s, l) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * Convert normalized (x, y) in [0..1] on the 2D spectrum into a hex color:
 * - x (0..1) -> Hue (0..360)
 * - y (0..1) -> Lightness (82% at top -> 52% at middle -> 26% at bottom), Saturation 92%
 */
function coordsToHex(x, y) {
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  const hue = clampedX * 360;
  const sat = 92;
  const light = 82 - clampedY * 56; // 82% down to 26%
  return hslToHex(hue, sat, light);
}

export default function AppearanceCustomizer({ compact = false }) {
  const [, , appearance] = useTheme();
  const {
    mode,
    setMode,
    customBase,
    setCustomBase,
    glassTint,
    setGlassTint,
    tintPos,
  } = appearance;

  const canvasRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);

  // Draw the 2D color spectrum on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. Horizontal rainbow hue gradient (0° -> 360°, saturation 92%, lightness 54%)
    const hueGrad = ctx.createLinearGradient(0, 0, width, 0);
    const stops = 12;
    for (let i = 0; i <= stops; i++) {
      const ratio = i / stops;
      hueGrad.addColorStop(ratio, `hsl(${Math.round(ratio * 360)}, 92%, 54%)`);
    }
    ctx.fillStyle = hueGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Top-to-middle white fade (for lighter/pastel tints at top)
    const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
    topGrad.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
    topGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, height * 0.5);

    // 3. Middle-to-bottom dark fade (for deeper jewel tints at bottom)
    const botGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
    botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);
  }, [mode]);

  const pickAtClientPoint = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const hex = coordsToHex(x, y);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setGlassTint(hex, { x, y });
    });
  }, [setGlassTint]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    pickAtClientPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    pickAtClientPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const activeTintColor = mode === 'custom' && glassTint ? glassTint : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 14 : 18, width: '100%' }}>
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
          const cardTintPreview = id === 'custom' && glassTint ? glassTint : null;
          return (
            <button
              key={id}
              type="button"
              data-kyoyu-injected="1"
              className={`s-theme-card ${active ? 'active' : ''}`}
              onClick={() => setMode(id)}
              style={{
                '--th-bg': p.bg,
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
                  background: p.bg,
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

      {/* 2. Customized Controls (Base Theme: Light / Gray / Dark + 2D Color Spectrum for Glass Lens UI) */}
      {mode === 'custom' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: compact ? 14 : 18,
            borderRadius: 18,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            animation: 'fadeIn 0.2s ease forwards',
          }}
        >
          {/* Base Theme Picker: Light / Gray (exact midpoint) / Dark */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Base Theme
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Gray is halfway between Dark & Light
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {CUSTOM_BASE_THEMES.map(({ id, label }) => {
                const bp = BASE_PREVIEWS[id];
                const isSelected = customBase === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-kyoyu-injected="1"
                    onClick={() => setCustomBase(id)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      border: isSelected
                        ? `1.5px solid ${activeTintColor || 'var(--text-primary)'}`
                        : '1px solid var(--glass-border)',
                      background: isSelected ? 'var(--glass-bg-active)' : 'transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 20,
                        borderRadius: 6,
                        background: bp.bg,
                        border: `1px solid ${bp.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 4,
                          borderRadius: 2,
                          background: activeTintColor || bp.fg,
                          opacity: 0.75,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {isSelected && <Check size={10} strokeWidth={3} />}
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border-subtle)' }} />

          {/* Glass Lens UI Tint Color Spectrum */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Glass Lens UI Tint
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  Tap or drag anywhere on the spectrum to tint buttons, filters, tab bar & sheets
                </div>
              </div>
              {glassTint && (
                <button
                  type="button"
                  data-kyoyu-injected="1"
                  onClick={() => setGlassTint('', tintPos)}
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

            {/* 2D Interactive Color Spectrum Field */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: 'relative',
                width: '100%',
                height: compact ? 136 : 156,
                borderRadius: 16,
                overflow: 'hidden',
                cursor: 'crosshair',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                border: '1px solid var(--glass-border-light)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
                marginTop: 8,
              }}
            >
              <canvas
                ref={canvasRef}
                width={360}
                height={160}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />

              {/* Draggable Loupe / Cursor */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(tintPos?.x ?? 0.58) * 100}%`,
                  top: `${(tintPos?.y ?? 0.45) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: glassTint || coordsToHex(tintPos?.x ?? 0.58, tintPos?.y ?? 0.45),
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.25)',
                  pointerEvents: 'none',
                  transition: draggingRef.current ? 'none' : 'left 0.08s ease, top 0.08s ease',
                }}
              />
            </div>

            {/* Live Discreet Glass Lens Preview */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 999,
                background: glassTint
                  ? `color-mix(in srgb, ${glassTint} 20%, var(--glass-bg))`
                  : 'var(--glass-bg)',
                border: glassTint
                  ? `1px solid color-mix(in srgb, ${glassTint} 40%, var(--glass-border))`
                  : '1px solid var(--glass-border)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: glassTint || 'transparent',
                    border: glassTint ? '1px solid rgba(255,255,255,0.5)' : '1px dashed var(--text-muted)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {glassTint ? 'Discreet Glass Lens Tint Active' : 'Neutral Glass (Tap spectrum to tint)'}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.70rem',
                  fontFamily: 'monospace',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {glassTint || 'NONE'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
