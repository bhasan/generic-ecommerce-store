import React, { useState, useEffect } from 'react';
import './AnnouncementModal.css';
import { X, Megaphone } from 'lucide-react';

function AnnouncementModal({ isOpen, onClose, onSave, announcement = null }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('INFO');
  const [dismissible, setDismissible] = useState(true);
  const [enabled, setEnabled] = useState(true);

  // Initialize form with announcement data if editing
  useEffect(() => {
    if (announcement) {
      setMessage(announcement.message || '');
      setType(announcement.type || 'INFO');
      setDismissible(announcement.dismissible !== undefined ? announcement.dismissible : true);
      setEnabled(announcement.enabled !== undefined ? announcement.enabled : true);
    } else {
      // Reset form for new announcement
      setMessage('');
      setType('INFO');
      setDismissible(true);
      setEnabled(true);
    }
  }, [announcement, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!message.trim()) {
      return;
    }

    onSave({
      message: message.trim(),
      type,
      dismissible,
      enabled
    });

    // Reset form
    setMessage('');
    setType('INFO');
    setDismissible(true);
    setEnabled(true);
  };

  const handleCancel = () => {
    // Reset form
    setMessage('');
    setType('INFO');
    setDismissible(true);
    setEnabled(true);
    onClose();
  };

  const title = announcement ? 'Edit Announcement' : 'Create Announcement';

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="announcement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon-wrapper">
              <Megaphone size={24} />
            </div>
            <div>
              <h3 className="modal-title">{title}</h3>
              <p className="modal-subtitle">
                {announcement ? 'Update announcement details' : 'Create a new announcement to display to users'}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={handleCancel} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="announcement-message" className="form-label">
                Message <span className="required">*</span>
              </label>
              <textarea
                id="announcement-message"
                className="form-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter announcement message..."
                rows={4}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="announcement-type" className="form-label">
                Type
              </label>
              <select
                id="announcement-type"
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="SUCCESS">Success</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={dismissible}
                  onChange={(e) => setDismissible(e.target.checked)}
                />
                <span>Allow users to dismiss this announcement</span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>Enabled (visible to users)</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-modal-save">
              {announcement ? 'Update' : 'Create'} Announcement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AnnouncementModal;

