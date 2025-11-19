import React from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import './ConfirmationModal.css';

function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  type = 'info' // 'info', 'warning', 'success', 'danger'
}) {
  if (!isOpen) return null;

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-content">
          <div className="modal-icon-wrapper">
            {getIcon()}
          </div>
          
          <h2 className="modal-title">{title}</h2>
          
          <div className="modal-message">
            {typeof message === 'string' ? <p>{message}</p> : message}
          </div>
        </div>

        <div className="modal-actions">
          <button 
            className="btn-modal-cancel" 
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button 
            className={`btn-modal-confirm btn-modal-${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;