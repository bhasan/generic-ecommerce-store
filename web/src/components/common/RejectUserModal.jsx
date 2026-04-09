import React, { useState } from 'react';
import './RejectUserModal.css';
import { X, AlertTriangle } from 'lucide-react';

function RejectUserModal({ isOpen, onClose, onConfirm, userName, isSubmitting = false }) {
  const [rejectionNote, setRejectionNote] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(rejectionNote.trim() || undefined);
    setRejectionNote(''); // Reset note after confirmation
  };

  const handleCancel = () => {
    setRejectionNote(''); // Reset note on cancel
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={isSubmitting ? undefined : handleCancel}>
      <div className="reject-user-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon-wrapper">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="modal-title">Reject User Registration</h3>
              <p className="modal-subtitle">Are you sure you want to reject this registration?</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={handleCancel} aria-label="Close">
            <X size={20} />
          </button>
        </div>

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

        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn-modal-reject" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Rejecting...' : 'Reject User'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RejectUserModal;

