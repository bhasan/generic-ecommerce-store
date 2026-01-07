import React, { useState, useEffect, useCallback } from 'react';
import './UsersPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import { User, Mail, Shield, Calendar, Trash2, Edit, X, Check } from 'lucide-react';

function UsersPage() {
  const { currentUser, showNotification } = useApp();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRoles, setEditingRoles] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);

  const loadUsers = useCallback(async () => {
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
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const rolesData = await usersApi.getAllRoles();
      setAvailableRoles(rolesData);
    } catch (err) {
      console.error('Failed to load roles:', err);
      // Fallback to default roles if API fails
      setAvailableRoles(['CUSTOMER', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER', 'GUEST']);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [loadUsers, loadRoles]);

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

  const handleEditRoles = (user) => {
    setEditingUserId(user.id);
    setEditingRoles([...user.roles] || []);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditingRoles([]);
  };

  const handleSaveRoles = async (userId) => {
    try {
      await usersApi.updateUser(userId, { roles: editingRoles });
      showNotification('User roles updated successfully', 'success');
      setEditingUserId(null);
      setEditingRoles([]);
      loadUsers(); // Reload users list
    } catch (err) {
      const errorMessage = err.message || 'Failed to update user roles';
      showNotification(errorMessage, 'error');
    }
  };

  const toggleRole = (role) => {
    if (editingRoles.includes(role)) {
      setEditingRoles(editingRoles.filter(r => r !== role));
    } else {
      setEditingRoles([...editingRoles, role]);
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

  const getRoleBadgeClass = (role) => {
    const roleName = Array.isArray(role) ? role[0] : role;
    switch (roleName) {
      case 'ADMIN':
        return 'role-badge role-badge-admin';
      case 'MANAGEMENT':
        return 'role-badge role-badge-management';
      case 'DELIVERY_DRIVER':
        return 'role-badge role-badge-delivery-driver';
      case 'GUEST':
        return 'role-badge role-badge-guest';
      case 'CUSTOMER':
      default:
        return 'role-badge role-badge-customer';
    }
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
                      {editingUserId === user.id ? (
                        <div className="role-editor">
                          <div className="role-checkboxes">
                            {availableRoles.map(role => (
                              <label key={role} className="role-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={editingRoles.includes(role)}
                                  onChange={() => toggleRole(role)}
                                />
                                <span className={getRoleBadgeClass(role)}>{role}</span>
                              </label>
                            ))}
                          </div>
                          <div className="role-editor-actions">
                            <button
                              onClick={() => handleSaveRoles(user.id)}
                              className="btn-save-roles"
                              title="Save roles"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="btn-cancel-roles"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="user-roles-cell">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role, idx) => (
                              <span key={idx} className={getRoleBadgeClass(role)}>
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="role-badge role-badge-customer">CUSTOMER</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="user-date-cell">
                        <Calendar size={16} />
                        <span>{formatDate(user.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="user-actions-cell">
                        {editingUserId !== user.id && (
                          <>
                            <button
                              onClick={() => handleEditRoles(user)}
                              className="btn-edit-roles"
                              title="Edit roles"
                            >
                              <Edit size={16} />
                            </button>
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
                          </>
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

