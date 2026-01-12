import React, { useState, useEffect, useCallback } from 'react';
import './DashboardPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import * as announcementsApi from '../../services/announcementsApi';
import RejectUserModal from '../../components/common/RejectUserModal';
import AnnouncementModal from '../../components/common/AnnouncementModal';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { UserPlus, Mail, Phone, DollarSign, Clock, X, MapPin, Megaphone, Edit, Power, PowerOff, Trash2, Check, Users, LayoutDashboard, Calendar, User, ChevronUp, ChevronDown, UserX, FileText } from 'lucide-react';

const DASHBOARD_SECTIONS = {
  PENDING_REGISTRATIONS: 'pending-registrations',
  USERS: 'users',
  REJECTED_USERS: 'rejected-users',
  ANNOUNCEMENTS: 'announcements'
};

function DashboardPage() {
  const { showNotification, currentUser } = useApp();
  const [activeSection, setActiveSection] = useState(DASHBOARD_SECTIONS.PENDING_REGISTRATIONS);
  
  // Pending Registrations State
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [userToApprove, setUserToApprove] = useState(null);
  
  // Announcements State
  const [announcements, setAnnouncements] = useState([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [deleteAnnouncementModalOpen, setDeleteAnnouncementModalOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  
  // Users State
  const [allUsers, setAllUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRoles, setEditingRoles] = useState([]);
  const [sortField, setSortField] = useState('id');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Rejected Users State
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [isLoadingRejected, setIsLoadingRejected] = useState(false);
  const [unRejectModalOpen, setUnRejectModalOpen] = useState(false);
  const [userToUnReject, setUserToUnReject] = useState(null);
  
  // Delete User State
  const [deleteUserModalOpen, setDeleteUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  // Load pending registrations
  const loadPendingRegistrations = useCallback(async () => {
    try {
      setIsLoadingPending(true);
      const pending = await usersApi.getPendingRegistrations();
      setPendingRegistrations(pending);
    } catch (error) {
      showNotification(error.message || 'Failed to load pending registrations', 'error');
    } finally {
      setIsLoadingPending(false);
    }
  }, [showNotification]);

  // Load announcements
  const loadAnnouncements = useCallback(async () => {
    try {
      setIsLoadingAnnouncements(true);
      const data = await announcementsApi.getAllAnnouncements();
      setAnnouncements(data);
    } catch (error) {
      showNotification(error.message || 'Failed to load announcements', 'error');
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [showNotification]);

  // Load all users
  const loadUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      const usersData = await usersApi.getAllUsers();
      setAllUsers(usersData);
    } catch (error) {
      showNotification(error.message || 'Failed to load users', 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [showNotification]);

  // Load available roles
  const loadRoles = useCallback(async () => {
    try {
      const rolesData = await usersApi.getAllRoles();
      setAvailableRoles(rolesData);
    } catch (error) {
      console.error('Failed to load roles:', error);
      setAvailableRoles(['CUSTOMER', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER', 'GUEST']);
    }
  }, []);

  // Load rejected users
  const loadRejectedUsers = useCallback(async () => {
    try {
      setIsLoadingRejected(true);
      const rejected = await usersApi.getRejectedUsers();
      setRejectedUsers(rejected);
    } catch (error) {
      showNotification(error.message || 'Failed to load rejected users', 'error');
    } finally {
      setIsLoadingRejected(false);
    }
  }, [showNotification]);

  // Load data based on active section
  useEffect(() => {
    if (activeSection === DASHBOARD_SECTIONS.PENDING_REGISTRATIONS) {
      loadPendingRegistrations();
    } else if (activeSection === DASHBOARD_SECTIONS.ANNOUNCEMENTS) {
      loadAnnouncements();
    } else if (activeSection === DASHBOARD_SECTIONS.USERS) {
      loadUsers();
      loadRoles();
    } else if (activeSection === DASHBOARD_SECTIONS.REJECTED_USERS) {
      loadRejectedUsers();
    }
  }, [activeSection, loadPendingRegistrations, loadAnnouncements, loadUsers, loadRoles, loadRejectedUsers]);

  // Announcement handlers
  const handleCreateAnnouncement = () => {
    setEditingAnnouncement(null);
    setAnnouncementModalOpen(true);
  };

  const handleEditAnnouncement = (announcement) => {
    setEditingAnnouncement(announcement);
    setAnnouncementModalOpen(true);
  };

  const handleSaveAnnouncement = async (data) => {
    try {
      if (editingAnnouncement) {
        await announcementsApi.updateAnnouncement(editingAnnouncement.id, data);
        showNotification('Announcement updated successfully', 'success');
      } else {
        await announcementsApi.createAnnouncement(data);
        showNotification('Announcement created successfully', 'success');
      }
      setAnnouncementModalOpen(false);
      setEditingAnnouncement(null);
      loadAnnouncements();
    } catch (error) {
      showNotification(error.message || 'Failed to save announcement', 'error');
    }
  };

  const handleDeleteAnnouncementClick = (id, message) => {
    setAnnouncementToDelete({ id, message });
    setDeleteAnnouncementModalOpen(true);
  };

  const handleDeleteAnnouncementConfirm = async () => {
    if (!announcementToDelete) return;

    try {
      await announcementsApi.deleteAnnouncement(announcementToDelete.id);
      showNotification('Announcement deleted successfully', 'success');
      setDeleteAnnouncementModalOpen(false);
      setAnnouncementToDelete(null);
      loadAnnouncements();
    } catch (error) {
      showNotification(error.message || 'Failed to delete announcement', 'error');
      setDeleteAnnouncementModalOpen(false);
      setAnnouncementToDelete(null);
    }
  };

  const handleDeleteAnnouncementCancel = () => {
    setDeleteAnnouncementModalOpen(false);
    setAnnouncementToDelete(null);
  };

  const handleToggleAnnouncement = async (announcement) => {
    try {
      await announcementsApi.updateAnnouncement(announcement.id, {
        enabled: !announcement.enabled
      });
      showNotification(
        announcement.enabled 
          ? 'Announcement disabled successfully' 
          : 'Announcement enabled successfully',
        'success'
      );
      loadAnnouncements();
    } catch (error) {
      showNotification(error.message || 'Failed to toggle announcement', 'error');
    }
  };

  // Pending registration handlers
  const handleApproveClick = (userId, userName) => {
    setUserToApprove({ id: userId, name: userName });
    setApproveModalOpen(true);
  };

  const handleApproveConfirm = async () => {
    if (!userToApprove) return;

    try {
      await usersApi.approveUser(userToApprove.id);
      showNotification('User approved successfully', 'success');
      setApproveModalOpen(false);
      setUserToApprove(null);
      loadPendingRegistrations();
    } catch (error) {
      showNotification(error.message || 'Failed to approve user', 'error');
      setApproveModalOpen(false);
      setUserToApprove(null);
    }
  };

  const handleApproveCancel = () => {
    setApproveModalOpen(false);
    setUserToApprove(null);
  };

  const handleRejectClick = (userId, userName) => {
    setUserToReject({ id: userId, name: userName });
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async (rejectionNote) => {
    if (!userToReject) return;

    try {
      await usersApi.rejectUser(userToReject.id, rejectionNote);
      showNotification('User registration rejected', 'success');
      setRejectModalOpen(false);
      setUserToReject(null);
      loadPendingRegistrations();
    } catch (error) {
      showNotification(error.message || 'Failed to reject user', 'error');
    }
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setUserToReject(null);
  };

  // Handle un-reject user (move back to pending)
  const handleUnRejectClick = (userId, userName) => {
    setUserToUnReject({ id: userId, name: userName });
    setUnRejectModalOpen(true);
  };

  const handleUnRejectConfirm = async () => {
    if (!userToUnReject) return;

    try {
      await usersApi.unRejectUser(userToUnReject.id);
      showNotification('User moved back to pending registrations', 'success');
      setUnRejectModalOpen(false);
      setUserToUnReject(null);
      loadRejectedUsers();
      loadPendingRegistrations(); // Refresh pending list
    } catch (error) {
      showNotification(error.message || 'Failed to move user back to pending', 'error');
      setUnRejectModalOpen(false);
      setUserToUnReject(null);
    }
  };

  const handleUnRejectCancel = () => {
    setUnRejectModalOpen(false);
    setUserToUnReject(null);
  };

  // User management handlers
  const handleDeleteUserClick = (userId, userName) => {
    setUserToDelete({ id: userId, name: userName });
    setDeleteUserModalOpen(true);
  };

  const handleDeleteUserConfirm = async () => {
    if (!userToDelete) return;

    try {
      await usersApi.deleteUser(userToDelete.id);
      showNotification('User deleted successfully', 'success');
      setDeleteUserModalOpen(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      showNotification(error.message || 'Failed to delete user', 'error');
      setDeleteUserModalOpen(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteUserCancel = () => {
    setDeleteUserModalOpen(false);
    setUserToDelete(null);
  };

  const handleEditRoles = (user) => {
    setEditingUserId(user.id);
    const userRoles = user.roles || (user.role ? [user.role] : []);
    setEditingRoles([...userRoles]);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditingRoles([]);
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
      // Also reload pending registrations in case user now appears there
      if (editingRoles.length === 0) {
        loadPendingRegistrations();
      }
    } catch (error) {
      showNotification(error.message || 'Failed to update user roles', 'error');
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
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatDateShort = (dateString) => {
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

  // Sorting functionality
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedUsers = () => {
    const sorted = [...allUsers];
    sorted.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'id':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'roles':
          aValue = (a.roles && a.roles.length > 0) ? a.roles.join(',') : (a.role || 'CUSTOMER');
          bValue = (b.roles && b.roles.length > 0) ? b.roles.join(',') : (b.role || 'CUSTOMER');
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt || 0).getTime();
          bValue = new Date(b.createdAt || 0).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) {
      return <ChevronUp size={14} className="sort-icon sort-icon-inactive" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp size={14} className="sort-icon sort-icon-active" />
      : <ChevronDown size={14} className="sort-icon sort-icon-active" />;
  };

  // Render Pending Registrations Section
  const renderPendingRegistrations = () => (
    <div className="dashboard-content-section">
      <div className="section-header">
        <h3 className="section-title">
          <UserPlus size={24} />
          Pending Registrations
        </h3>
      </div>
      
      {isLoadingPending ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading pending registrations...</p>
        </div>
      ) : pendingRegistrations.length === 0 ? (
        <div className="empty-state">
          <Check size={64} className="empty-icon" />
          <p>No pending registrations. All users are approved!</p>
        </div>
      ) : (
        <div className="pending-registrations-list">
          {pendingRegistrations.map(user => (
            <div key={user.id} className="pending-registration-card">
              <div className="pending-registration-header">
                <div>
                  <h4 className="pending-user-name">{user.name}</h4>
                  <div className="pending-user-info">
                    <div className="pending-info-item">
                      <Mail size={16} />
                      <span>{user.email}</span>
                    </div>
                    <div className="pending-info-item">
                      <MapPin size={16} />
                      <span className="info-label">Address:</span>
                      <span className={user.address ? "info-value" : "info-value-empty"}>
                        {user.address || "Not provided"}
                      </span>
                    </div>
                    <div className="pending-info-item">
                      <DollarSign size={16} />
                      <span className="payment-method-label">Payment Method:</span>
                      <span className={user.cashapp ? "payment-method-value" : "payment-method-value-empty"}>
                        {user.cashapp || "Not provided"}
                      </span>
                    </div>
                    {user.phoneNumber && (
                      <div className="pending-info-item">
                        <Phone size={16} />
                        <span>{user.phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="pending-badge">
                  <Clock size={16} />
                  Pending
                </span>
      </div>

              <div className="pending-registration-footer">
                <div className="pending-date">
                  Registered: {formatDate(user.createdAt)}
                </div>
                <div className="pending-actions">
                  <button
                    onClick={() => handleApproveClick(user.id, user.name)}
                    className="btn-action btn-approve"
                  >
                    <Check size={16} />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleRejectClick(user.id, user.name)}
                    className="btn-action btn-reject"
                  >
                    <X size={16} />
                    <span>Reject</span>
                  </button>
                </div>
          </div>
          </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render Users Section
  const renderUsers = () => {
    const sortedUsers = getSortedUsers();

    return (
      <div className="dashboard-content-section">
        <div className="section-header">
          <h3 className="section-title">
            <Users size={24} />
            Users Management
          </h3>
        </div>
        
        {isLoadingUsers ? (
          <div className="empty-state">
            <Clock size={64} className="empty-icon" />
            <p>Loading users...</p>
          </div>
        ) : allUsers.length === 0 ? (
          <div className="empty-state">
            <Users size={64} className="empty-icon" />
            <p>No users found.</p>
          </div>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th 
                    className="sortable-header"
                    onClick={() => handleSort('id')}
                  >
                    <div className="header-content">
                      <span>ID</span>
                      <SortIcon field="id" />
                    </div>
                  </th>
                  <th 
                    className="sortable-header"
                    onClick={() => handleSort('name')}
                  >
                    <div className="header-content">
                      <span>Name</span>
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th 
                    className="sortable-header"
                    onClick={() => handleSort('email')}
                  >
                    <div className="header-content">
                      <span>Email</span>
                      <SortIcon field="email" />
                    </div>
                  </th>
                  <th>Status</th>
                  <th 
                    className="sortable-header"
                    onClick={() => handleSort('roles')}
                  >
                    <div className="header-content">
                      <span>Roles</span>
                      <SortIcon field="roles" />
                    </div>
                  </th>
                  <th 
                    className="sortable-header"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="header-content">
                      <span>Created</span>
                      <SortIcon field="createdAt" />
                    </div>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
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
                      {user.approved ? (
                        <span className="status-badge status-approved">
                          <Check size={14} />
                          Approved
                        </span>
                      ) : user.rejected ? (
                        <span className="status-badge status-rejected">
                          <X size={14} />
                          Rejected
                        </span>
                      ) : (
                        <span className="status-badge status-pending">
                          <Clock size={14} />
                          Pending
                        </span>
                      )}
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
                          ) : user.role ? (
                            <span className={getRoleBadgeClass(user.role)}>
                              {user.role}
                            </span>
                          ) : (
                            <span className="role-badge role-badge-no-roles" title="No roles - appears in Pending Registrations">
                              No Roles
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="user-date-cell">
                        <Calendar size={16} />
                        <span>{formatDateShort(user.createdAt)}</span>
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
                            {user.id !== currentUser?.id && (
                              <button
                                onClick={() => handleDeleteUserClick(user.id, user.name)}
                                className="btn-delete-user"
                                title="Delete user"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {user.id === currentUser?.id && (
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
    );
  };

  // Render Announcements Section
  const renderAnnouncements = () => (
    <div className="dashboard-content-section">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <Megaphone size={24} />
          Announcements
        </h3>
        <button
          onClick={handleCreateAnnouncement}
          className="btn-action btn-primary"
        >
          <Megaphone size={16} />
          <span>Create Announcement</span>
        </button>
      </div>
      
      {isLoadingAnnouncements ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading announcements...</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="empty-state">
          <Megaphone size={64} className="empty-icon" />
          <p>No announcements created yet. Create one to display to users!</p>
                    </div>
      ) : (
        <div className="announcements-list">
          {announcements.map(announcement => (
            <div key={announcement.id} className={`announcement-card ${!announcement.enabled ? 'announcement-disabled' : ''}`}>
              <div className="announcement-card-header">
                <div className="announcement-card-info">
                  <div className={`announcement-type-badge announcement-type-badge-${announcement.type.toLowerCase()}`}>
                    <span>{announcement.type}</span>
                  </div>
                  <span className={`announcement-status-badge ${announcement.enabled ? 'status-enabled' : 'status-disabled'}`}>
                    {announcement.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {announcement.dismissible && (
                    <span className="announcement-dismissible-badge">
                      Dismissible
                    </span>
                  )}
                </div>
                <div className="announcement-card-actions">
                  <button
                    onClick={() => handleToggleAnnouncement(announcement)}
                    className="btn-action btn-toggle"
                    title={announcement.enabled ? 'Disable' : 'Enable'}
                  >
                    {announcement.enabled ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                  <button
                    onClick={() => handleEditAnnouncement(announcement)}
                    className="btn-action btn-edit"
                  >
                    <Edit size={16} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeleteAnnouncementClick(announcement.id, announcement.message)}
                    className="btn-action btn-delete"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div className="announcement-card-body">
                <p className="announcement-message-display">{announcement.message}</p>
                <div className="announcement-card-footer">
                  <span className="announcement-date">
                    Created: {formatDate(announcement.createdAt)}
                  </span>
                  {announcement.updatedAt !== announcement.createdAt && (
                    <span className="announcement-date">
                      Updated: {formatDate(announcement.updatedAt)}
                    </span>
                  )}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );

  // Render Rejected Users Section
  const renderRejectedUsers = () => (
    <div className="dashboard-content-section">
      <div className="section-header">
        <h3 className="section-title">
          <UserX size={24} />
          Rejected Users
        </h3>
      </div>
      
      {isLoadingRejected ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading rejected users...</p>
        </div>
      ) : rejectedUsers.length === 0 ? (
        <div className="empty-state">
          <UserX size={64} className="empty-icon" />
          <p>No rejected users found.</p>
        </div>
      ) : (
        <div className="rejected-users-list">
          {rejectedUsers.map(user => (
            <div key={user.id} className="rejected-user-card">
              <div className="rejected-user-header">
                <div>
                  <h4 className="rejected-user-name">{user.name}</h4>
                  <div className="rejected-user-info">
                    <div className="rejected-info-item">
                      <Mail size={16} />
                      <span>{user.email}</span>
                    </div>
                    <div className="rejected-info-item">
                      <MapPin size={16} />
                      <span className="info-label">Address:</span>
                      <span className={user.address ? "info-value" : "info-value-empty"}>
                        {user.address || "Not provided"}
                      </span>
                    </div>
                    <div className="rejected-info-item">
                      <DollarSign size={16} />
                      <span className="payment-method-label">Payment Method:</span>
                      <span className={user.cashapp ? "payment-method-value" : "payment-method-value-empty"}>
                        {user.cashapp || "Not provided"}
                      </span>
                    </div>
                    {user.phoneNumber && (
                      <div className="rejected-info-item">
                        <Phone size={16} />
                        <span>{user.phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="rejected-badge">
                  <UserX size={16} />
                  Rejected
                </span>
              </div>

              {user.rejectionNote && (
                <div className="rejection-note-section">
                  <div className="rejection-note-header">
                    <FileText size={16} />
                    <span className="rejection-note-label">Rejection Note:</span>
                  </div>
                  <p className="rejection-note-text">{user.rejectionNote}</p>
                </div>
              )}

              <div className="rejected-user-footer">
                <div className="rejected-date">
                  <Calendar size={16} />
                  <span>Rejected: {formatDate(user.createdAt)}</span>
                </div>
                <button
                  onClick={() => handleUnRejectClick(user.id, user.name)}
                  className="btn-action btn-approve"
                >
                  <UserPlus size={16} />
                  <span>Move to Pending</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render active content
  const renderContent = () => {
    switch (activeSection) {
      case DASHBOARD_SECTIONS.PENDING_REGISTRATIONS:
        return renderPendingRegistrations();
      case DASHBOARD_SECTIONS.USERS:
        return renderUsers();
      case DASHBOARD_SECTIONS.REJECTED_USERS:
        return renderRejectedUsers();
      case DASHBOARD_SECTIONS.ANNOUNCEMENTS:
        return renderAnnouncements();
      default:
        return renderPendingRegistrations();
    }
  };

  return (
    <div className="dashboard-page-container">
      <div className="dashboard-header">
        <div>
          <h2 className="page-title">
            <LayoutDashboard size={28} />
            Admin Dashboard
          </h2>
          <p className="page-subtitle">Store management and administration</p>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Sidebar Menu */}
        <aside className="dashboard-sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item ${activeSection === DASHBOARD_SECTIONS.PENDING_REGISTRATIONS ? 'active' : ''}`}
              onClick={() => setActiveSection(DASHBOARD_SECTIONS.PENDING_REGISTRATIONS)}
            >
              <UserPlus size={20} />
              <span>Pending Registrations</span>
            </button>
            <button
              className={`sidebar-nav-item ${activeSection === DASHBOARD_SECTIONS.USERS ? 'active' : ''}`}
              onClick={() => setActiveSection(DASHBOARD_SECTIONS.USERS)}
            >
              <Users size={20} />
              <span>Users</span>
            </button>
            <button
              className={`sidebar-nav-item ${activeSection === DASHBOARD_SECTIONS.REJECTED_USERS ? 'active' : ''}`}
              onClick={() => setActiveSection(DASHBOARD_SECTIONS.REJECTED_USERS)}
            >
              <UserX size={20} />
              <span>Rejected Users</span>
            </button>
            <button
              className={`sidebar-nav-item ${activeSection === DASHBOARD_SECTIONS.ANNOUNCEMENTS ? 'active' : ''}`}
              onClick={() => setActiveSection(DASHBOARD_SECTIONS.ANNOUNCEMENTS)}
            >
              <Megaphone size={20} />
              <span>Announcements</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-main-content">
          {renderContent()}
        </main>
      </div>

      {/* Modals */}
      <ConfirmationModal
        isOpen={approveModalOpen}
        onClose={handleApproveCancel}
        onConfirm={handleApproveConfirm}
        title="Approve User Registration"
        message={
          <>
            Are you sure you want to approve registration for <strong>{userToApprove?.name || ''}</strong>?
            <br />
            <br />
            This will grant them access to the system.
          </>
        }
        confirmText="Approve"
        cancelText="Cancel"
        type="success"
      />

      <RejectUserModal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        onConfirm={handleRejectConfirm}
        userName={userToReject?.name || ''}
      />

      <AnnouncementModal
        isOpen={announcementModalOpen}
        onClose={() => {
          setAnnouncementModalOpen(false);
          setEditingAnnouncement(null);
        }}
        onSave={handleSaveAnnouncement}
        announcement={editingAnnouncement}
      />

      {/* Delete Announcement Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteAnnouncementModalOpen}
        onClose={handleDeleteAnnouncementCancel}
        onConfirm={handleDeleteAnnouncementConfirm}
        title="Delete Announcement"
        message={
          <>
            Are you sure you want to delete this announcement?
            {announcementToDelete?.message && (
              <>
                <br />
                <br />
                <strong>"{announcementToDelete.message}"</strong>
              </>
            )}
            <br />
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Un-Reject User Confirmation Modal */}
      <ConfirmationModal
        isOpen={unRejectModalOpen}
        onClose={handleUnRejectCancel}
        onConfirm={handleUnRejectConfirm}
        title="Move User to Pending"
        message={
          <>
            Move <strong>{userToUnReject?.name || ''}</strong> back to pending registrations?
            <br />
            <br />
            This will allow them to be approved again.
          </>
        }
        confirmText="Move to Pending"
        cancelText="Cancel"
        type="success"
      />

      {/* Delete User Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteUserModalOpen}
        onClose={handleDeleteUserCancel}
        onConfirm={handleDeleteUserConfirm}
        title="Delete User"
        message={
          <>
            Are you sure you want to delete user <strong>"{userToDelete?.name || ''}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}

export default DashboardPage;
