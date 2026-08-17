import React, { useState } from 'react';
import './RejectUserModal.css';
import { AlertTriangle } from 'lucide-react';
import BaseModal, { ModalHeader, ModalFooter } from './BaseModal';

function RejectUserModal({ isOpen, onClose, onConfirm, userName, isSubmitting = false }) {
  const [rejectionNote, setRejectionNote] = useState('');

  const handleConfirm = () => {
    onConfirm(rejectionNote.trim() || undefined);
    setRejectionNote('');
  };

  const handleCancel = () => {
    setRejectionNote('');
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : handleCancel}
      className="reject-user-modal"
      aria-labelledby="reject-user-title"
    >
      <ModalHeader
        title="Reject User Registration"
        subtitle="Are you sure you want to reject this registration?"
        icon={<AlertTriangle size={24} />}
        onClose={isSubmitting ? undefined : handleCancel}
      />

      <div className="modal-body">
        <div className="reject-user-info">
          <p className="reject-user-name-display">
            <strong>User:</strong> {userName}
          </p>
        </div>
        <div className="rejection-note-input-group">
          <label htmlFor="rejection-note" className="rejection-note-label">
            Rejection Note (Optional)
          </label>
          <textarea
            id="rejection-note"
            className="rejection-note-textarea"
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            placeholder="Enter a reason for rejection (optional)..."
            rows={4}
          />
          <p className="rejection-note-hint">
            This note will be stored with the rejected user record.
          </p>
        </div>
      </div>

      <ModalFooter>
        <button className="btn-modal-cancel" onClick={handleCancel}>
          Cancel
        </button>
        <button className="btn-modal-reject" onClick={handleConfirm} disabled={isSubmitting}>
          {isSubmitting ? 'Rejecting...' : 'Reject User'}
        </button>
      </ModalFooter>
    </BaseModal>
  );
}

export default RejectUserModal;
