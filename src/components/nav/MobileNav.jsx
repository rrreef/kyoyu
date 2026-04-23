import { createPortal } from 'react-dom';
import { useEffect, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Library, Search, MessageCircle, ShoppingBag } from 'lucide-react';
import './MobileNav.css';

const mobileItems = [
  { to: '/',         label: 'Home',     icon: Home          },
  { to: '/library',  label: 'Library',  icon: Library       },
  { to: '/search',   label: 'Search',   icon: Search        },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/shop',     label: 'Shop',     icon: ShoppingBag   },
];

export default function MobileNav() {
  const navRef = useRef(null);
  const glareRaf = useRef(null);
  const currentGlare = useRef(22); // start glare at 22%

  /* ── Smooth glare interpolation ─────────────────────────── */
  const animateGlareTo = useCallback((targetX) => {
    if (glareRaf.current) cancelAnimationFrame(glareRaf.current);
    const nav = navRef.current;
    if (!nav) return;

    const tick = () => {
      const diff = targetX - currentGlare.current;
      if (Math.abs(diff) < 0.1) {
        currentGlare.current = targetX;
        nav.style.setProperty('--glare-x', `${targetX}%`);
        return;
      }
      currentGlare.current += diff * 0.12; // spring ease
      nav.style.setProperty('--glare-x', `${currentGlare.current}%`);
      glareRaf.current = requestAnimationFrame(tick);
    };
    glareRaf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    /* ── Pointer / touch glare tracking ─────────────────── */
    const handlePointerMove = (e) => {
      const rect = nav.getBoundingClientRect();
      const x = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
      animateGlareTo(x);
    };

    /* ── Press: pill squishes elastically ───────────────── */
    const handlePointerDown = () => nav.classList.add('is-pressed');
    const handlePointerUp   = () => nav.classList.remove('is-pressed');

    /* ── Device orientation glare (gyro on mobile) ──────── */
    const handleOrientation = (e) => {
      if (e.gamma == null) return;
      const x = Math.min(90, Math.max(10, 50 + e.gamma * 2.2));
      animateGlareTo(x);
    };

    nav.addEventListener('pointermove',   handlePointerMove, { passive: true });
    nav.addEventListener('pointerdown',   handlePointerDown, { passive: true });
    nav.addEventListener('pointerup',     handlePointerUp,   { passive: true });
    nav.addEventListener('pointercancel', handlePointerUp,   { passive: true });
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });

    return () => {
      nav.removeEventListener('pointermove',   handlePointerMove);
      nav.removeEventListener('pointerdown',   handlePointerDown);
      nav.removeEventListener('pointerup',     handlePointerUp);
      nav.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('deviceorientation', handleOrientation);
      if (glareRaf.current) cancelAnimationFrame(glareRaf.current);
    };
  }, [animateGlareTo]);

  return createPortal(
    <>
      {/* SVG lens distortion filter */}
      <svg
        aria-hidden="true"
        style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      >
        <defs>
          <filter id="mob-nav-lens" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves="2" seed="5" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="20" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <nav ref={navRef} className="mobile-nav">
        {mobileItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>,
    document.body
  );
}
