import React, { useState, useEffect } from 'react';
import './UsersPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import { User, Mail, Shield, Calendar, Trash2, Edit } from 'lucide-react';

function UsersPage() {
  const { currentUser, showNotification } = useApp();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError('');
      const usersData = await usersApi.getAllUsers();
      setUsers(usersData);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load users';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await usersApi.deleteUser(userId);
      showNotification('User deleted successfully', 'success');
      loadUsers(); // Reload users list
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete user';
      showNotification(errorMessage, 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  const getRoleBadgeClass = (roles) => {
    if (!roles || roles.length === 0) return 'role-badge role-badge-customer';
    if (roles.includes('ADMIN')) return 'role-badge role-badge-admin';
    if (roles.includes('MANAGEMENT')) return 'role-badge role-badge-management';
    return 'role-badge role-badge-customer';
  };

  if (isLoading) {
    return (
      <div className="users-page-container">
        <div className="users-header">
          <div>
            <h2 className="page-title">Users Management</h2>
            <p className="page-subtitle">Loading users...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="users-page-container">
      <div className="users-header">
        <div>
          <h2 className="page-title">Users Management</h2>
          <p className="page-subtitle">Manage all system users</p>
        </div>
      </div>

      {error && (
        <div className="users-error" style={{ 
          padding: '1rem', 
          margin: '1rem 0', 
          backgroundColor: '#fee2e2', 
          color: '#dc2626', 
          borderRadius: '0.5rem' 
        }}>
          {error}
        </div>
      )}

      <div className="users-content">
        {users.length === 0 ? (
          <div className="users-empty">
            <User size={48} />
            <p>No users found</p>
          </div>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>#{user.id}</td>
                    <td>
                      <div className="user-name-cell">
                        <User size={16} />
                        <span>{user.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="user-email-cell">
                        <Mail size={16} />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="user-roles-cell">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map((role, idx) => (
                            <span key={idx} className={getRoleBadgeClass([role])}>
                              {role}
                            </span>
                          ))
                        ) : (
                          <span className="role-badge role-badge-customer">CUSTOMER</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="user-date-cell">
                        <Calendar size={16} />
                        <span>{formatDate(user.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="user-actions-cell">
                        {user.id !== currentUser.id && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="btn-delete-user"
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {user.id === currentUser.id && (
                          <span className="current-user-badge">You</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default UsersPage;

