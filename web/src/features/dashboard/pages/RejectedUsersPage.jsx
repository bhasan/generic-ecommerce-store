import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as usersApi from '../../../services/usersApi';
import { formatDate } from '../../../utils/dateUtils';
import RejectedUsersSection from '../components/RejectedUsersSection';
import ConfirmationModal from '../../../components/common/ConfirmationModal';

function RejectedUsersPage() {
  const { showNotification } = useApp();
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unRejectModal, setUnRejectModal] = useState({ open: false, user: null });

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
    if (!unRejectModal.user) return;
    try {
      await usersApi.unRejectUser(unRejectModal.user.id);
      showNotification('User moved back to pending registrations', 'success');
      setUnRejectModal({ open: false, user: null });
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to move user back to pending', 'error');
      setUnRejectModal({ open: false, user: null });
    }
  };

  return (
    <>
      <RejectedUsersSection
        isLoading={isLoading}
        rejectedUsers={rejectedUsers}
        formatDate={formatDate}
        onMoveToPending={(id, name) => setUnRejectModal({ open: true, user: { id, name } })}
      />

      <ConfirmationModal
        isOpen={unRejectModal.open}
        onClose={() => setUnRejectModal({ open: false, user: null })}
        onConfirm={handleUnRejectConfirm}
        title="Move User to Pending"
        message={
          <>
            Move <strong>{unRejectModal.user?.name || ''}</strong> back to pending registrations?
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
