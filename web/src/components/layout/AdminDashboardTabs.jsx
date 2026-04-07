import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, UserPlus, Users, UserX, MessageSquare, CreditCard, Store, ShoppingCart, LayoutDashboard } from 'lucide-react';
import './AdminDashboardTabs.css';

const SECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  PENDING_REGISTRATIONS: 'pending-registrations',
  USERS: 'users',
  REJECTED_USERS: 'rejected-users',
  MESSAGES: 'messages',
  PAYMENT_SETTINGS: 'payment-settings',
  STORE_SETTINGS: 'store-settings',
  ORDERING_CONSTRAINTS: 'ordering-constraints',
  LANDING_PAGE: 'landing-page',
};

function AdminDashboardTabs({ activeSection, currentTab = 'dashboard', onSectionChange }) {
  const navigate = useNavigate();

  const handleSelect = (section) => {
    const nextUrl = `/dashboard?section=${section}`;
    navigate(nextUrl);
    if (onSectionChange) {
      onSectionChange(section);
    }
  };

  const isActive = (section) =>
    currentTab === 'dashboard' && activeSection === section ? 'active' : '';

  return (
    <aside className="dashboard-sidebar">
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.MESSAGES)}`}
          onClick={() => handleSelect(SECTIONS.MESSAGES)}
        >
          <MessageSquare size={20} />
          <span>Messages</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.PENDING_REGISTRATIONS)}`}
          onClick={() => handleSelect(SECTIONS.PENDING_REGISTRATIONS)}
        >
          <UserPlus size={20} />
          <span>Pending Registrations</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.ANNOUNCEMENTS)}`}
          onClick={() => handleSelect(SECTIONS.ANNOUNCEMENTS)}
        >
          <Megaphone size={20} />
          <span>Announcements</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.USERS)}`}
          onClick={() => handleSelect(SECTIONS.USERS)}
        >
          <Users size={20} />
          <span>Users</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.REJECTED_USERS)}`}
          onClick={() => handleSelect(SECTIONS.REJECTED_USERS)}
        >
          <UserX size={20} />
          <span>Rejected Users</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.PAYMENT_SETTINGS)}`}
          onClick={() => handleSelect(SECTIONS.PAYMENT_SETTINGS)}
        >
          <CreditCard size={20} />
          <span>Payment Settings</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.STORE_SETTINGS)}`}
          onClick={() => handleSelect(SECTIONS.STORE_SETTINGS)}
        >
          <Store size={20} />
          <span>Store Settings</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.ORDERING_CONSTRAINTS)}`}
          onClick={() => handleSelect(SECTIONS.ORDERING_CONSTRAINTS)}
        >
          <ShoppingCart size={20} />
          <span>Ordering Constraints</span>
        </button>
        <button
          className={`sidebar-nav-item ${isActive(SECTIONS.LANDING_PAGE)}`}
          onClick={() => handleSelect(SECTIONS.LANDING_PAGE)}
        >
          <LayoutDashboard size={20} />
          <span>Landing Page</span>
        </button>
      </nav>
    </aside>
  );
}

export default AdminDashboardTabs;
