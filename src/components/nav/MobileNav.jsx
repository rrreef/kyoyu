import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { Home, Library, Search, MessageCircle, ShoppingBag } from 'lucide-react';
import './Sidebar.css';

const mobileItems = [
  { to: '/',         label: 'Home',     icon: Home          },
  { to: '/library',  label: 'Library',  icon: Library       },
  { to: '/search',   label: 'Search',   icon: Search        },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/shop',     label: 'Shop',     icon: ShoppingBag   },
];

export default function MobileNav() {
  return createPortal(
    <>
      {/* SVG lens distortion filter — creates spatial deformation of backdrop content */}
      <svg
        aria-hidden="true"
        style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      >
        <defs>
          <filter id="mob-nav-lens" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            {/* Radial lens warp — magnifies/pushes content outward from centre */}
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.032" numOctaves="2" seed="5" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped"
            />
            <feBlend in="warped" in2="SourceGraphic" mode="normal" />
          </filter>
        </defs>
      </svg>

      <nav className="mobile-nav">
        {mobileItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
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
