import { createPortal } from 'react-dom';
import { useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  const navRef       = useRef(null);
  const indicatorRef = useRef(null);
  const glareRaf     = useRef(null);
  const currentGlare = useRef(22);
  const location     = useLocation();

  /* ── Slide indicator to active item ─────────────────────── */
  const slideIndicator = useCallback(() => {
    const nav       = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;

    const active = nav.querySelector('.mobile-nav-item.active');
    if (!active) return;

    const navRect  = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const centerX  = itemRect.left - navRect.left + itemRect.width / 2;
    indicator.style.transform = `translateX(${centerX}px) translateX(-50%)`;
  }, []);

  useEffect(() => {
    const t = setTimeout(slideIndicator, 16);
    return () => clearTimeout(t);
  }, [location.pathname, slideIndicator]);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (indicator) indicator.style.transition = 'none';
    slideIndicator();
    const t = setTimeout(() => {
      if (indicator) indicator.style.transition = '';
    }, 50);
    return () => clearTimeout(t);
  }, [slideIndicator]);

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
      currentGlare.current += diff * 0.12;
      nav.style.setProperty('--glare-x', `${currentGlare.current}%`);
      glareRaf.current = requestAnimationFrame(tick);
    };
    glareRaf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handlePointerMove = (e) => {
      const rect = nav.getBoundingClientRect();
      const x = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
      animateGlareTo(x);
    };
    const handlePointerDown = () => nav.classList.add('is-pressed');
    const handlePointerUp   = () => nav.classList.remove('is-pressed');
    const handleOrientation  = (e) => {
      if (e.gamma == null) return;
      animateGlareTo(Math.min(90, Math.max(10, 50 + e.gamma * 2.2)));
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
      {/*
        SVG lens filter — referenced by backdrop-filter: url('#mob-nav-lens')
        This applies spatial displacement to the CONTENT BEHIND the pill,
        not to the pill itself. Creates genuine lens distortion / warp effect.
      */}
      <svg
        aria-hidden="true"
        style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      >
        <defs>
          <filter
            id="mob-nav-lens"
            x="-30%" y="-30%"
            width="160%" height="160%"
            colorInterpolationFilters="sRGB"
          >
            {/* Low-frequency noise = smooth large-scale lens warps */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.012"
              numOctaves="3"
              seed="8"
              result="noise"
            />
            {/* scale=90 = very pronounced spatial distortion */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="90"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped"
            />
            {/* Boost colour of warped content — vivid "magnified glass" quality */}
            <feComponentTransfer in="warped">
              <feFuncR type="linear" slope="1.30" intercept="-0.10" />
              <feFuncG type="linear" slope="1.30" intercept="-0.10" />
              <feFuncB type="linear" slope="1.25" intercept="-0.08" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <nav ref={navRef} className="mobile-nav">
        <div ref={indicatorRef} className="nav-indicator" aria-hidden="true" />

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
