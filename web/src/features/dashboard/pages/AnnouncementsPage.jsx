import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as announcementsApi from '../../../services/announcementsApi';
import { formatDate } from '../../../utils/dateUtils';
import AnnouncementsSection from '../components/AnnouncementsSection';
import AnnouncementModal from '../../../components/common/AnnouncementModal';
import ConfirmationModal from '../../../components/common/ConfirmationModal';
import useModalState from '../../../hooks/useModalState';

function AnnouncementsPage() {
  const { showNotification } = useApp();
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const announcementModal = useModalState();
  const deleteModal = useModalState();

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
      if (announcementModal.data) {
        await announcementsApi.updateAnnouncement(announcementModal.data.id, data);
        showNotification('Announcement updated successfully', 'success');
      } else {
        await announcementsApi.createAnnouncement(data);
        showNotification('Announcement created successfully', 'success');
      }
      announcementModal.closeModal();
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
    if (!deleteModal.data) return;
    try {
      await announcementsApi.deleteAnnouncement(deleteModal.data.id);
      showNotification('Announcement deleted successfully', 'success');
      deleteModal.closeModal();
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to delete announcement', 'error');
      deleteModal.closeModal();
    }
  };

  return (
    <>
      <AnnouncementsSection
        isLoading={isLoading}
        announcements={announcements}
        formatDate={formatDate}
        onCreate={() => announcementModal.openModal(null)}
        onToggle={handleToggle}
        onEdit={(a) => announcementModal.openModal(a)}
        onDelete={(id, message) => deleteModal.openModal({ id, message })}
      />

      <AnnouncementModal
        isOpen={announcementModal.isOpen}
        onClose={() => announcementModal.closeModal()}
        onSave={handleSave}
        announcement={announcementModal.data}
      />

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => deleteModal.closeModal()}
        onConfirm={handleDeleteConfirm}
        title="Delete Announcement"
        message={
          <>
            Are you sure you want to delete this announcement?
            {deleteModal.data?.message && <><br /><br /><strong>"{deleteModal.data.message}"</strong></>}
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
