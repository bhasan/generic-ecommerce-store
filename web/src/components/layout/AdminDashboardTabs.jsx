import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, UserPlus, Users, UserX, MessageSquare, CreditCard, Store, ShoppingCart } from 'lucide-react';
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

  return (
    <div className="dashboard-section-tabs">
      <div className="dashboard-tabs">
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.MESSAGES ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.MESSAGES)}
        >
          <MessageSquare size={20} />
          <span>Messages</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.PENDING_REGISTRATIONS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.PENDING_REGISTRATIONS)}
        >
          <UserPlus size={20} />
          <span>Pending Registrations</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.ANNOUNCEMENTS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.ANNOUNCEMENTS)}
        >
          <Megaphone size={20} />
          <span>Announcements</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.USERS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.USERS)}
        >
          <Users size={20} />
          <span>Users</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.REJECTED_USERS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.REJECTED_USERS)}
        >
          <UserX size={20} />
          <span>Rejected Users</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.PAYMENT_SETTINGS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.PAYMENT_SETTINGS)}
        >
          <CreditCard size={20} />
          <span>Payment Settings</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.STORE_SETTINGS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.STORE_SETTINGS)}
        >
          <Store size={20} />
          <span>Store Settings</span>
        </button>
        <button
          className={`dashboard-tab ${
            currentTab === 'dashboard' && activeSection === SECTIONS.ORDERING_CONSTRAINTS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.ORDERING_CONSTRAINTS)}
        >
          <ShoppingCart size={20} />
          <span>Ordering Constraints</span>
        </button>
      </div>
    </div>
  );
}

export default AdminDashboardTabs;
