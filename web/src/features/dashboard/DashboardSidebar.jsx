import React from 'react';
import { NavLink } from 'react-router-dom';
import { Megaphone, UserPlus, Users, UserX, MessageSquare, LayoutDashboard, Crown } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard/pending-registrations', icon: UserPlus, label: 'Pending Registrations' },
  { to: '/dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  { to: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/dashboard/vip-management', icon: Crown, label: 'VIP Management' },
  { to: '/dashboard/landing-page', icon: LayoutDashboard, label: 'Landing Page' },
  { to: '/dashboard/users', icon: Users, label: 'Users' },
  { to: '/dashboard/rejected-users', icon: UserX, label: 'Rejected Users' },
];

function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default DashboardSidebar;
