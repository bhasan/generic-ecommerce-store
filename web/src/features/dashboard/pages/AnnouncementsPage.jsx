import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as announcementsApi from '../../../services/announcementsApi';
import { formatDate } from '../../../utils/dateUtils';
import AnnouncementsSection from '../components/AnnouncementsSection';
import AnnouncementModal from '../../../components/common/AnnouncementModal';
import ConfirmationModal from '../../../components/common/ConfirmationModal';

function AnnouncementsPage() {
  const { showNotification } = useApp();
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, item: null });

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setAnnouncements(await announcementsApi.getAllAnnouncements());
    } catch (error) {
      showNotification(error.message || 'Failed to load announcements', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      if (editing) {
        await announcementsApi.updateAnnouncement(editing.id, data);
        showNotification('Announcement updated successfully', 'success');
      } else {
        await announcementsApi.createAnnouncement(data);
        showNotification('Announcement created successfully', 'success');
      }
      setModalOpen(false);
      setEditing(null);
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to save announcement', 'error');
    }
  };

  const handleToggle = async (announcement) => {
    try {
      await announcementsApi.updateAnnouncement(announcement.id, { enabled: !announcement.enabled });
      showNotification(
        announcement.enabled ? 'Announcement disabled successfully' : 'Announcement enabled successfully',
        'success'
      );
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to toggle announcement', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.item) return;
    try {
      await announcementsApi.deleteAnnouncement(deleteModal.item.id);
      showNotification('Announcement deleted successfully', 'success');
      setDeleteModal({ open: false, item: null });
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to delete announcement', 'error');
      setDeleteModal({ open: false, item: null });
    }
  };

  return (
    <>
      <AnnouncementsSection
        isLoading={isLoading}
        announcements={announcements}
        formatDate={formatDate}
        onCreate={() => { setEditing(null); setModalOpen(true); }}
        onToggle={handleToggle}
        onEdit={(a) => { setEditing(a); setModalOpen(true); }}
        onDelete={(id, message) => setDeleteModal({ open: true, item: { id, message } })}
      />

      <AnnouncementModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        announcement={editing}
      />

      <ConfirmationModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, item: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Announcement"
        message={
          <>
            Are you sure you want to delete this announcement?
            {deleteModal.item?.message && <><br /><br /><strong>"{deleteModal.item.message}"</strong></>}
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

export default AnnouncementsPage;
