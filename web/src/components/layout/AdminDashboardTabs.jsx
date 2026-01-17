import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Megaphone, UserPlus, Users, UserX } from 'lucide-react';
import './AdminDashboardTabs.css';

const SECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  PENDING_REGISTRATIONS: 'pending-registrations',
  USERS: 'users',
  REJECTED_USERS: 'rejected-users'
};

function AdminDashboardTabs({ activeSection, currentTab = 'dashboard', onSectionChange }) {
  const navigate = useNavigate();

  const handleSelect = (section) => {
    if (section === 'categories') {
      navigate('/categories');
      return;
    }

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
          className={`dashboard-tab ${currentTab === 'categories' ? 'active' : ''}`}
          onClick={() => handleSelect('categories')}
        >
          <Layers size={20} />
          <span>Categories</span>
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
            currentTab === 'dashboard' && activeSection === SECTIONS.PENDING_REGISTRATIONS ? 'active' : ''
          }`}
          onClick={() => handleSelect(SECTIONS.PENDING_REGISTRATIONS)}
        >
          <UserPlus size={20} />
          <span>Pending Registrations</span>
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
      </div>
    </div>
  );
}

export default AdminDashboardTabs;
