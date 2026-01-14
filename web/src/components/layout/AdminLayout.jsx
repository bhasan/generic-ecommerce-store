import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './AdminLayout.css';
import { LayoutDashboard, Users, UserX, Layers } from 'lucide-react';

function AdminLayout({ children }) {
  const { currentUser } = useApp();
  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">Admin</div>

        <NavLink to="/dashboard" className={({ isActive }) => `admin-nav-item ${isActive ? 'admin-nav-active' : ''}`}>
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/categories" className={({ isActive }) => `admin-nav-item ${isActive ? 'admin-nav-active' : ''}`}>
          <Layers size={16} />
          <span>Categories</span>
        </NavLink>

        {isAdmin && (
          <>
            <NavLink to="/users" className={({ isActive }) => `admin-nav-item ${isActive ? 'admin-nav-active' : ''}`}>
              <Users size={16} />
              <span>Users</span>
            </NavLink>

            <NavLink to="/rejected-users" className={({ isActive }) => `admin-nav-item ${isActive ? 'admin-nav-active' : ''}`}>
              <UserX size={16} />
              <span>Rejected Users</span>
            </NavLink>

          </>
        )}
      </aside>

      <section className="admin-content">
        {children}
      </section>
    </div>
  );
}

export default AdminLayout;
