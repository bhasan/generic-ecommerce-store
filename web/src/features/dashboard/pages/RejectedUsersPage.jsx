import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as usersApi from '../../../services/usersApi';
import { formatDate } from '../../../utils/dateUtils';
import RejectedUsersSection from '../components/RejectedUsersSection';
import ConfirmationModal from '../../../components/common/ConfirmationModal';
import useModalState from '../../../hooks/useModalState';

function RejectedUsersPage() {
  const { showNotification } = useApp();
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const unRejectModal = useModalState();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setRejectedUsers(await usersApi.getRejectedUsers());
    } catch (error) {
      showNotification(error.message || 'Failed to load rejected users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  const handleUnRejectConfirm = async () => {
    if (!unRejectModal.data) return;
    try {
      await usersApi.unRejectUser(unRejectModal.data.id);
      showNotification('User moved back to pending registrations', 'success');
      unRejectModal.closeModal();
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to move user back to pending', 'error');
      unRejectModal.closeModal();
    }
  };

  return (
    <>
      <RejectedUsersSection
        isLoading={isLoading}
        rejectedUsers={rejectedUsers}
        formatDate={formatDate}
        onMoveToPending={(id, name) => unRejectModal.openModal({ id, name })}
      />

      <ConfirmationModal
        isOpen={unRejectModal.isOpen}
        onClose={() => unRejectModal.closeModal()}
        onConfirm={handleUnRejectConfirm}
        title="Move User to Pending"
        message={
          <>
            Move <strong>{unRejectModal.data?.name || ''}</strong> back to pending registrations?
            <br /><br />This will allow them to be approved again.
          </>
        }
        confirmText="Move to Pending"
        cancelText="Cancel"
        type="success"
      />
    </>
  );
}

export default RejectedUsersPage;
