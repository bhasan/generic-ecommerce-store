import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as contactMessagesApi from '../../../services/contactMessagesApi';
import { formatDate } from '../../../utils/dateUtils';
import { hasRole, ROLES } from '../../../utils/roles';
import MessagesSection from '../components/MessagesSection';
import ConfirmationModal from '../../../components/common/ConfirmationModal';

const REFRESH_INTERVAL_MS = 60000;

function MessagesPage() {
  const { showNotification, currentUser } = useApp();
  const isAdmin = hasRole(currentUser, ROLES.ADMIN);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, item: null });
  const [isReplying, setIsReplying] = useState(false);

  const load = useCallback(async (filter = '') => {
    try {
      setIsLoading(true);
      const filters = filter ? { status: filter } : {};
      setMessages(await contactMessagesApi.getAllMessages(filters));
    } catch (error) {
      showNotification(error.message || 'Failed to load contact messages', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(statusFilter); }, [load, statusFilter]);

  useEffect(() => {
    const interval = setInterval(() => load(statusFilter), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load, statusFilter]);

  const handleMarkAsRead = async (messageId) => {
    try {
      await contactMessagesApi.markAsRead(messageId);
      showNotification('Message marked as read', 'success');
      load(statusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to mark message as read', 'error');
    }
  };

  const handleMarkAsResolved = async (messageId) => {
    try {
      await contactMessagesApi.markAsResolved(messageId);
      showNotification('Message marked as resolved', 'success');
      load(statusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to mark message as resolved', 'error');
    }
  };

  const handleReply = async (messageId, replyText) => {
    try {
      setIsReplying(true);
      const result = await contactMessagesApi.replyToMessage(messageId, replyText);
      if (result?.emailDelivered === false) {
        showNotification(result.message || 'Reply recorded, but email delivery failed.', 'warning');
      } else {
        showNotification('Reply sent successfully via email', 'success');
      }
      load(statusFilter);
      return true;
    } catch (error) {
      showNotification(error.message || 'Failed to send reply', 'error');
      return false;
    } finally {
      setIsReplying(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.item) return;
    try {
      await contactMessagesApi.deleteMessage(deleteModal.item.id);
      showNotification('Message deleted successfully', 'success');
      setDeleteModal({ open: false, item: null });
      load(statusFilter);
    } catch (error) {
      showNotification(error.message || 'Failed to delete message', 'error');
      setDeleteModal({ open: false, item: null });
    }
  };

  return (
    <>
      <MessagesSection
        isLoading={isLoading}
        messages={messages}
        formatDate={formatDate}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onMarkAsRead={handleMarkAsRead}
        onMarkAsResolved={handleMarkAsResolved}
        onDelete={(id, subject) => setDeleteModal({ open: true, item: { id, subject } })}
        onReply={handleReply}
        isReplying={isReplying}
        currentUserId={currentUser?.id}
        isAdmin={isAdmin}
      />

      <ConfirmationModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, item: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Message"
        message={
          <>
            Are you sure you want to delete this contact message?
            {deleteModal.item?.subject && <><br /><br />Subject: <strong>"{deleteModal.item.subject}"</strong></>}
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

export default MessagesPage;
