import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import * as usersApi from '../../../services/usersApi';
import { formatDateShort } from '../../../utils/dateUtils';
import { getRoleBadgeClass, ROLES } from '../../../utils/roles';
import UsersSection from '../components/UsersSection';
import ConfirmationModal from '../../../components/common/ConfirmationModal';

function UsersPage() {
  const { showNotification, currentUser } = useApp();
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRoles, setEditingRoles] = useState([]);
  const [sortField, setSortField] = useState('id');
  const [sortDirection, setSortDirection] = useState('asc');
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setAllUsers(await usersApi.getAllUsers());
    } catch (error) {
      showNotification(error.message || 'Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const loadRoles = useCallback(async () => {
    try {
      setAvailableRoles(await usersApi.getAllRoles());
    } catch {
      setAvailableRoles([ROLES.CUSTOMER, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER, ROLES.GUEST]);
    }
  }, []);

  useEffect(() => { loadUsers(); loadRoles(); }, [loadUsers, loadRoles]);

  const sortedUsers = useMemo(() => {
    return [...allUsers].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'id': aVal = a.id; bVal = b.id; break;
        case 'name': aVal = a.username?.toLowerCase() || ''; bVal = b.username?.toLowerCase() || ''; break;
        case 'email': aVal = a.email?.toLowerCase() || ''; bVal = b.email?.toLowerCase() || ''; break;
        case 'roles':
          aVal = (a.roles?.length > 0) ? a.roles.join(',') : (a.role || ROLES.CUSTOMER);
          bVal = (b.roles?.length > 0) ? b.roles.join(',') : (b.role || ROLES.CUSTOMER);
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt || 0).getTime();
          bVal = new Date(b.createdAt || 0).getTime();
          break;
        default: return 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allUsers, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleEditRoles = (user) => {
    setEditingUserId(user.id);
    setEditingRoles([...(user.roles || (user.role ? [user.role] : []))]);
  };

  const handleSaveRoles = async (userId) => {
    try {
      await usersApi.updateUser(userId, { roles: editingRoles });
      const message = editingRoles.length === 0
        ? 'All roles removed. User will appear in Pending Registrations.'
        : 'User roles updated successfully';
      showNotification(message, 'success');
      setEditingUserId(null);
      setEditingRoles([]);
      loadUsers();
    } catch (error) {
      showNotification(error.message || 'Failed to update user roles', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.user) return;
    try {
      await usersApi.deleteUser(deleteModal.user.id);
      showNotification('User deleted successfully', 'success');
      setDeleteModal({ open: false, user: null });
      loadUsers();
    } catch (error) {
      showNotification(error.message || 'Failed to delete user', 'error');
      setDeleteModal({ open: false, user: null });
    }
  };

  const toggleRole = (role) => {
    setEditingRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  return (
    <>
      <UsersSection
        isLoading={isLoading}
        users={allUsers}
        sortedUsers={sortedUsers}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentUserId={currentUser?.id}
        availableRoles={availableRoles}
        editingUserId={editingUserId}
        editingRoles={editingRoles}
        onToggleRole={toggleRole}
        onSaveRoles={handleSaveRoles}
        onCancelEdit={() => { setEditingUserId(null); setEditingRoles([]); }}
        onEditRoles={handleEditRoles}
        onDeleteUser={(id, name) => setDeleteModal({ open: true, user: { id, name } })}
        formatDateShort={formatDateShort}
        getRoleBadgeClass={getRoleBadgeClass}
      />

      <ConfirmationModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, user: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete User"
        message={
          <>
            Are you sure you want to delete user <strong>"{deleteModal.user?.name || ''}"</strong>?
            <br /><br />This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}

export default UsersPage;
