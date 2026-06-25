import React, { useState, useEffect, useCallback, useRef } from 'react';
import './DashboardPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import * as announcementsApi from '../../services/announcementsApi';
import * as contactMessagesApi from '../../services/contactMessagesApi';
import * as landingPageSettingsApi from '../../services/landingPageSettingsApi';
import AnnouncementModal from '../../components/common/AnnouncementModal';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { useLocation } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import AdminDashboardTabs from '../../components/layout/AdminDashboardTabs';
import DashboardHeader from './components/DashboardHeader';
import PendingRegistrationsSection from './components/PendingRegistrationsSection';
import UsersSection from './components/UsersSection';
import AnnouncementsSection from './components/AnnouncementsSection';
import RejectedUsersSection from './components/RejectedUsersSection';
import MessagesSection from './components/MessagesSection';
import LandingPageSection from './components/LandingPageSection';
import VIPManagementSection from './components/VIPManagementSection';
import * as productsApi from '../../services/productsApi';
import { hasRole, ROLES } from '../../utils/roles';

const DASHBOARD_SECTIONS = {
  PENDING_REGISTRATIONS: 'pending-registrations',
  USERS: 'users',
  REJECTED_USERS: 'rejected-users',
  ANNOUNCEMENTS: 'announcements',
  MESSAGES: 'messages',
  LANDING_PAGE: 'landing-page',
  VIP_MANAGEMENT: 'vip-management',
};

function DashboardPage() {
  const MESSAGES_REFRESH_INTERVAL_MS = 60000;
  const { showNotification, currentUser, loadLandingPageData } = useApp();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(() => {
    const section = new URLSearchParams(location.search).get('section');
    return Object.values(DASHBOARD_SECTIONS).includes(section)
      ? section
      : DASHBOARD_SECTIONS.PENDING_REGISTRATIONS;
  });
  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section');
    if (Object.values(DASHBOARD_SECTIONS).includes(section)) {
      // Keep deep-linked admin tabs and in-app tab clicks on the same section state.
      setActiveSection(section);
    }
  }, [location.search]);

  
  // Pending Registrations State
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  // Announcements State
  const [announcements, setAnnouncements] = useState([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [deleteAnnouncementModalOpen, setDeleteAnnouncementModalOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  
  // Users State
  const [allUsers, setAllUsers] = useState([]);
  const allUsersRef = useRef([]);
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

  // Landing Page Settings State
  const [localLandingPageSettings, setLocalLandingPageSettings] = useState(null);
  const [isLoadingLandingPageSettings, setIsLoadingLandingPageSettings] = useState(false);

  // VIP Management State
  const [vipProducts, setVipProducts] = useState([]);
  const [isLoadingVip, setIsLoadingVip] = useState(false);

  // Contact Messages State
  const [contactMessages, setContactMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesStatusFilter, setMessagesStatusFilter] = useState('');
  const [deleteMessageModalOpen, setDeleteMessageModalOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [isReplyingToMessage, setIsReplyingToMessage] = useState(false);

  // Check if user is admin
  const isAdmin = hasRole(currentUser, ROLES.ADMIN);

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
      allUsersRef.current = usersData;
      setAllUsers(usersData);
    } catch (error) {
      showNotification(error.message || 'Failed to load users', 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [showNotification]);

  // Load VIP management data — reuse already-loaded users if available, only fetch products
  const loadVipData = useCallback(async () => {
    try {
      setIsLoadingVip(true);
      const fetches = [productsApi.getAllProducts()];
      const needsUsers = allUsersRef.current.length === 0;
      if (needsUsers) fetches.unshift(usersApi.getAllUsers());

      const results = await Promise.all(fetches);
      if (needsUsers) {
        allUsersRef.current = results[0];
        setAllUsers(results[0]);
        setVipProducts(results[1]);
      } else {
        setVipProducts(results[0]);
      }
    } catch (error) {
      showNotification(error.message || 'Failed to load VIP data', 'error');
    } finally {
      setIsLoadingVip(false);
    }
  }, [showNotification]);

  // Load available roles
  const loadRoles = useCallback(async () => {
    try {
      const rolesData = await usersApi.getAllRoles();
      setAvailableRoles(rolesData);
    } catch (error) {
      console.error('Failed to load roles:', error);
      setAvailableRoles([ROLES.CUSTOMER, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER, ROLES.GUEST]);
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

  // Load contact messages
  const loadContactMessages = useCallback(async (statusFilter = '') => {
    try {
      setIsLoadingMessages(true);
      const filters = statusFilter ? { status: statusFilter } : {};
      const messages = await contactMessagesApi.getAllMessages(filters);
      setContactMessages(messages);
    } catch (error) {
      showNotification(error.message || 'Failed to load contact messages', 'error');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [showNotification]);

  // Load landing page settings
  const loadLandingPageSettings = useCallback(async () => {
    try {
      setIsLoadingLandingPageSettings(true);
      const settings = await landingPageSettingsApi.getLandingPageSettings();
      setLocalLandingPageSettings(settings);
    } catch (error) {
      showNotification(error.message || 'Failed to load landing page settings', 'error');
    } finally {
      setIsLoadingLandingPageSettings(false);
    }
  }, [showNotification]);

  const handleSaveLandingPageSettings = async (data) => {
    try {
      await landingPageSettingsApi.updateLandingPageSettings(data);
      showNotification('Landing page settings updated successfully', 'success');
      loadLandingPageData();
    } catch (error) {
      showNotification(error.message || 'Failed to save landing page settings', 'error');
    }
  };

  // Load data based on active section
  useEffect(() => {
    // Section-scoped loading keeps admin requests targeted instead of refetching every dashboard dataset at once.
    if (activeSection === DASHBOARD_SECTIONS.PENDING_REGISTRATIONS) {
      loadPendingRegistrations();
    } else if (activeSection === DASHBOARD_SECTIONS.ANNOUNCEMENTS) {
      loadAnnouncements();
    } else if (activeSection === DASHBOARD_SECTIONS.USERS) {
      loadUsers();
      loadRoles();
    } else if (activeSection === DASHBOARD_SECTIONS.REJECTED_USERS) {
      loadRejectedUsers();
    } else if (activeSection === DASHBOARD_SECTIONS.MESSAGES) {
      loadContactMessages(messagesStatusFilter);
    } else if (activeSection === DASHBOARD_SECTIONS.LANDING_PAGE) {
      loadLandingPageSettings();
    } else if (activeSection === DASHBOARD_SECTIONS.VIP_MANAGEMENT) {
      loadVipData();
    }
  }, [activeSection, loadPendingRegistrations, loadAnnouncements, loadUsers, loadRoles, loadRejectedUsers, loadContactMessages, messagesStatusFilter, loadLandingPageSettings, loadVipData]);

  useEffect(() => {
    if (activeSection !== DASHBOARD_SECTIONS.MESSAGES) return undefined;

    const interval = setInterval(() => {
      loadContactMessages(messagesStatusFilter);
    }, MESSAGES_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeSection, loadContactMessages, messagesStatusFilter]);

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

  // Pending registration handlers (called by PendingRegistrationsSection after user confirms in modal)
  const handleApprove = async (userId) => {
    try {
      await usersApi.approveUser(userId);
      showNotification('User approved successfully', 'success');
      loadPendingRegistrations();
    } catch (error) {
      showNotification(error.message || 'Failed to approve user', 'error');
      throw error;
    }
  };

  const handleReject = async (userId, rejectionNote) => {
    try {
      await usersApi.rejectUser(userId, rejectionNote);
      showNotification('User registration rejected', 'success');
      loadPendingRegistrations();
    } catch (error) {
      showNotification(error.message || 'Failed to reject user', 'error');
      throw error;
    }
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
      // Refill pending registrations when roles are cleared because that moves the user back into approval flow.
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

  // VIP handlers — optimistic updates: mutate local state immediately, revert on error
  const handleToggleVipUser = async (user) => {
    const currentRoles = user.roles
      ? user.roles.map((r) => (typeof r === 'string' ? r : r.name))
      : [];
    const isCurrentlyVip = currentRoles.includes(ROLES.VIP);
    const newRoles = isCurrentlyVip
      ? currentRoles.filter((r) => r !== ROLES.VIP)
      : [...currentRoles, ROLES.VIP];

    // Apply optimistic update
    setAllUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, roles: newRoles } : u))
    );

    try {
      await usersApi.updateUser(user.id, { roles: newRoles });
      showNotification(
        isCurrentlyVip ? `VIP access removed from ${user.username}` : `${user.username} is now VIP`,
        'success'
      );
    } catch (error) {
      // Revert on failure
      setAllUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, roles: currentRoles } : u))
      );
      showNotification(error.message || 'Failed to update VIP status', 'error');
    }
  };

  const handleToggleVipProduct = async (product) => {
    const newVipOnly = !product.vipOnly;

    // Apply optimistic update
    setVipProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, vipOnly: newVipOnly } : p))
    );

    try {
      await productsApi.updateProduct(product.id, { vipOnly: newVipOnly });
      showNotification(
        product.vipOnly
          ? `"${product.name}" is no longer VIP-only`
          : `"${product.name}" is now VIP-only`,
        'success'
      );
    } catch (error) {
      // Revert on failure
      setVipProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, vipOnly: product.vipOnly } : p))
      );
      showNotification(error.message || 'Failed to update product VIP status', 'error');
    }
  };

  // Contact message handlers
  const handleMessagesStatusFilterChange = (status) => {
    setMessagesStatusFilter(status);
  };

  const handleMarkMessageAsRead = async (messageId) => {
    try {
      await contactMessagesApi.markAsRead(messageId);
      showNotification('Message marked as read', 'success');
      loadContactMessages(messagesStatusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to mark message as read', 'error');
    }
  };

  const handleMarkMessageAsResolved = async (messageId) => {
    try {
      await contactMessagesApi.markAsResolved(messageId);
      showNotification('Message marked as resolved', 'success');
      loadContactMessages(messagesStatusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to mark message as resolved', 'error');
    }
  };

  const handleDeleteMessageClick = (messageId, subject) => {
    setMessageToDelete({ id: messageId, subject });
    setDeleteMessageModalOpen(true);
  };

  const handleDeleteMessageConfirm = async () => {
    if (!messageToDelete) return;

    try {
      await contactMessagesApi.deleteMessage(messageToDelete.id);
      showNotification('Message deleted successfully', 'success');
      setDeleteMessageModalOpen(false);
      setMessageToDelete(null);
      loadContactMessages(messagesStatusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to delete message', 'error');
      setDeleteMessageModalOpen(false);
      setMessageToDelete(null);
    }
  };

  const handleDeleteMessageCancel = () => {
    setDeleteMessageModalOpen(false);
    setMessageToDelete(null);
  };

  const handleReplyToMessage = async (messageId, replyText) => {
    try {
      setIsReplyingToMessage(true);
      const result = await contactMessagesApi.replyToMessage(messageId, replyText);
      if (result?.emailDelivered === false) {
        showNotification(
          result.message || 'Reply recorded, but email delivery failed.',
          'warning'
        );
      } else {
        showNotification('Reply sent successfully via email', 'success');
      }
      loadContactMessages(messagesStatusFilter);
      return true;
    } catch (error) {
      showNotification(error.message || 'Failed to send reply', 'error');
      return false;
    } finally {
      setIsReplyingToMessage(false);
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
      case ROLES.ADMIN:
        return 'role-badge role-badge-admin';
      case ROLES.MANAGEMENT:
        return 'role-badge role-badge-management';
      case ROLES.DELIVERY_DRIVER:
        return 'role-badge role-badge-delivery-driver';
      case ROLES.GUEST:
        return 'role-badge role-badge-guest';
      case ROLES.CUSTOMER:
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
          aValue = a.username?.toLowerCase() || '';
          bValue = b.username?.toLowerCase() || '';
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'roles':
          aValue = (a.roles && a.roles.length > 0) ? a.roles.join(',') : (a.role || ROLES.CUSTOMER);
          bValue = (b.roles && b.roles.length > 0) ? b.roles.join(',') : (b.role || ROLES.CUSTOMER);
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

  // Render active content
  const renderContent = () => {
    // The active section decides which API set and management workflow the dashboard exposes.
    switch (activeSection) {
      case DASHBOARD_SECTIONS.PENDING_REGISTRATIONS:
        return (
          <PendingRegistrationsSection
            isLoading={isLoadingPending}
            pendingRegistrations={pendingRegistrations}
            formatDate={formatDate}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        );
      case DASHBOARD_SECTIONS.USERS:
        return (
          <UsersSection
            isLoading={isLoadingUsers}
            users={allUsers}
            sortedUsers={getSortedUsers()}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            currentUserId={currentUser?.id}
            availableRoles={availableRoles}
            editingUserId={editingUserId}
            editingRoles={editingRoles}
            onToggleRole={toggleRole}
            onSaveRoles={handleSaveRoles}
            onCancelEdit={handleCancelEdit}
            onEditRoles={handleEditRoles}
            onDeleteUser={handleDeleteUserClick}
            formatDateShort={formatDateShort}
            getRoleBadgeClass={getRoleBadgeClass}
          />
        );
      case DASHBOARD_SECTIONS.REJECTED_USERS:
        return (
          <RejectedUsersSection
            isLoading={isLoadingRejected}
            rejectedUsers={rejectedUsers}
            formatDate={formatDate}
            onMoveToPending={handleUnRejectClick}
          />
        );
      case DASHBOARD_SECTIONS.ANNOUNCEMENTS:
        return (
          <AnnouncementsSection
            isLoading={isLoadingAnnouncements}
            announcements={announcements}
            formatDate={formatDate}
            onCreate={handleCreateAnnouncement}
            onToggle={handleToggleAnnouncement}
            onEdit={handleEditAnnouncement}
            onDelete={handleDeleteAnnouncementClick}
          />
        );
      case DASHBOARD_SECTIONS.MESSAGES:
        return (
          <MessagesSection
            isLoading={isLoadingMessages}
            messages={contactMessages}
            formatDate={formatDate}
            statusFilter={messagesStatusFilter}
            onStatusFilterChange={handleMessagesStatusFilterChange}
            onMarkAsRead={handleMarkMessageAsRead}
            onMarkAsResolved={handleMarkMessageAsResolved}
            onDelete={handleDeleteMessageClick}
            onReply={handleReplyToMessage}
            isReplying={isReplyingToMessage}
            currentUserId={currentUser?.id}
            isAdmin={isAdmin}
          />
        );
      case DASHBOARD_SECTIONS.LANDING_PAGE:
        return (
          <LandingPageSection
            isLoading={isLoadingLandingPageSettings}
            landingPageSettings={localLandingPageSettings}
            onSave={handleSaveLandingPageSettings}
          />
        );
      case DASHBOARD_SECTIONS.VIP_MANAGEMENT:
        return (
          <VIPManagementSection
            isLoading={isLoadingVip}
            users={allUsers}
            products={vipProducts}
            onToggleVipUser={handleToggleVipUser}
            onToggleVipProduct={handleToggleVipProduct}
          />
        );
      default:
        return (
          <PendingRegistrationsSection
            isLoading={isLoadingPending}
            pendingRegistrations={pendingRegistrations}
            formatDate={formatDate}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        );
    }
  };

  return (
    <AdminLayout>
      <div className="dashboard-page-container">
        <DashboardHeader />

        <div className="dashboard-layout">
          <AdminDashboardTabs
            currentTab="dashboard"
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          <div className="dashboard-main-content">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Modals */}
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
            Move <strong>{userToUnReject?.username || ''}</strong> back to pending registrations?
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
            Are you sure you want to delete user <strong>"{userToDelete?.username || ''}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Delete Message Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteMessageModalOpen}
        onClose={handleDeleteMessageCancel}
        onConfirm={handleDeleteMessageConfirm}
        title="Delete Message"
        message={
          <>
            Are you sure you want to delete this contact message?
            {messageToDelete?.subject && (
              <>
                <br />
                <br />
                Subject: <strong>"{messageToDelete.subject}"</strong>
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
    </AdminLayout>
  );
}

export default DashboardPage;
