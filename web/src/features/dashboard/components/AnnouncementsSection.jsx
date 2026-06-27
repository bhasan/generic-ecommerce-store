import React from 'react';
import { Megaphone, Clock, Power, PowerOff, Edit, Trash2 } from 'lucide-react';
import LoadingState from '../../../components/common/LoadingState';
import EmptyState from '../../../components/common/EmptyState';

function AnnouncementsSection({
  isLoading,
  announcements,
  formatDate,
  onCreate,
  onToggle,
  onEdit,
  onDelete
}) {
  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <Megaphone size={24} />
          Announcements
        </h3>
        <button
          onClick={onCreate}
          className="btn-action btn-primary"
        >
          <Megaphone size={16} />
          <span>Create Announcement</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading announcements..." />
      ) : announcements.length === 0 ? (
        <EmptyState icon={<Megaphone size={64} />} message="No announcements created yet. Create one to display to users!" />
      ) : (
        <div className="announcements-list">
          {announcements.map(announcement => (
            <div key={announcement.id} className={`announcement-card ${!announcement.enabled ? 'announcement-disabled' : ''}`}>
              <div className="announcement-card-header">
                <div className="announcement-card-info">
                  <div className={`announcement-type-badge announcement-type-badge-${announcement.type.toLowerCase()}`}>
                    <span>{announcement.type}</span>
                  </div>
                  <span className={`announcement-status-badge ${announcement.enabled ? 'status-enabled' : 'status-disabled'}`}>
                    {announcement.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {announcement.dismissible && (
                    <span className="announcement-dismissible-badge">
                      Dismissible
                    </span>
                  )}
                </div>
                <div className="announcement-card-actions">
                  <button
                    onClick={() => onToggle(announcement)}
                    className="btn-action btn-toggle"
                    title={announcement.enabled ? 'Disable' : 'Enable'}
                  >
                    {announcement.enabled ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                  <button
                    onClick={() => onEdit(announcement)}
                    className="btn-action btn-edit"
                  >
                    <Edit size={16} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => onDelete(announcement.id, announcement.message)}
                    className="btn-action btn-delete"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div className="announcement-card-body">
                <p className="announcement-message-display">{announcement.message}</p>
                <div className="announcement-card-footer">
                  <span className="announcement-date">
                    Created: {formatDate(announcement.createdAt)}
                  </span>
                  {announcement.updatedAt !== announcement.createdAt && (
                    <span className="announcement-date">
                      Updated: {formatDate(announcement.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AnnouncementsSection;
