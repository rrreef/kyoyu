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
    </nav>,
    document.body  // outside app-layout — fixed now anchors to true viewport
  );
}
