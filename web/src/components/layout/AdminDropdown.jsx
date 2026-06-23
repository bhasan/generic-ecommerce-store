import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Settings, ChevronDown, LayoutDashboard, Wallet, CheckCircle, Globe } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const ACTIVE_PATHS = ['/dashboard', '/users', '/rejected-users', '/order-history', '/store-credit', '/website-management'];

function AdminDropdown({ isAdmin, variant = 'desktop' }) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setShowMenu(false); }, [location.pathname]);

  useEffect(() => {
    if (!showMenu) return;
    function handleOutside(e) {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setShowMenu(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMenu]);

  useEffect(() => {
    if (showMenu && variant === 'desktop' && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [showMenu, variant]);

  const isActive = ACTIVE_PATHS.includes(location.pathname);

  const go = (path) => { navigate(path); setShowMenu(false); };

  const menu = (
    <div
      ref={menuRef}
      className="admin-menu"
      style={variant === 'desktop' ? { position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 'var(--z-fixed)' } : undefined}
    >
      <button type="button" onClick={() => go('/dashboard')} className={`admin-menu-item ${location.pathname === '/dashboard' ? 'admin-menu-item-active' : ''}`}>
        <LayoutDashboard size={16} /><span>Dashboard</span>
      </button>
      <button type="button" onClick={() => go('/store-credit')} className={`admin-menu-item ${location.pathname === '/store-credit' ? 'admin-menu-item-active' : ''}`}>
        <Wallet size={16} /><span>Store Credit</span>
      </button>
      <button type="button" onClick={() => go('/order-history')} className={`admin-menu-item ${location.pathname === '/order-history' ? 'admin-menu-item-active' : ''}`}>
        <CheckCircle size={16} /><span>Orders History</span>
      </button>
      {isAdmin && (
        <button type="button" onClick={() => go('/website-management')} className={`admin-menu-item ${location.pathname === '/website-management' ? 'admin-menu-item-active' : ''}`}>
          <Globe size={16} /><span>Website Management</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="admin-dropdown" ref={triggerRef}>
      <button
        className={`nav-link ${isActive ? 'nav-link-active' : ''}`}
        onClick={() => setShowMenu(v => !v)}
        aria-label="Management menu"
        aria-expanded={showMenu}
      >
        <Settings size={18} />
        <span>{isAdmin ? 'Admin' : 'Manager'}</span>
        <ChevronDown size={16} className={`admin-chevron ${showMenu ? 'admin-chevron-open' : ''}`} />
      </button>
      {showMenu && (
        variant === 'desktop'
          ? ReactDOM.createPortal(menu, document.body)
          : menu
      )}
    </div>
  );
}

export default AdminDropdown;
