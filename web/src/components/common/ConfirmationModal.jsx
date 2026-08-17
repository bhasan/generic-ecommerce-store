import React from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import './ConfirmationModal.css';
import BaseModal from './BaseModal';

function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info', // 'info', 'warning', 'success', 'danger'
  isSubmitting = false
}) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={48} className="modal-icon modal-icon-success" />;
      case 'warning':
      case 'danger':
        return <AlertCircle size={48} className="modal-icon modal-icon-warning" />;
      default:
        return <AlertCircle size={48} className="modal-icon modal-icon-info" />;
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      aria-labelledby="confirmation-modal-title"
    >
      <button className="modal-close-btn confirmation-close-btn" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className="modal-content">
        <div className="modal-icon-wrapper">
          {getIcon()}
        </div>

        <h2 className="modal-title" id="confirmation-modal-title">{title}</h2>

        <div className="modal-message">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn-modal-cancel" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className={`btn-modal-confirm btn-modal-${type}`}
          onClick={onConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Processing...' : confirmText}
        </button>
      </div>
    </BaseModal>
  );
}

export default ConfirmationModal;
