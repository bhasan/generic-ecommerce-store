import React from 'react';
import { UserX, Mail, Phone, DollarSign, Clock, MapPin, Calendar, UserPlus, FileText } from 'lucide-react';

function RejectedUsersSection({
  isLoading,
  rejectedUsers,
  formatDate,
  onMoveToPending
}) {
  return (
    <div className="dashboard-content-section">
      <div className="section-header">
        <h3 className="section-title">
          <UserX size={24} />
          Rejected Users
        </h3>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading rejected users...</p>
        </div>
      ) : rejectedUsers.length === 0 ? (
        <div className="empty-state">
          <UserX size={64} className="empty-icon" />
          <p>No rejected users found.</p>
        </div>
      ) : (
        <div className="rejected-users-list">
          {rejectedUsers.map(user => (
            <div key={user.id} className="rejected-user-card">
              <div className="rejected-user-header">
                <div>
                  <h4 className="rejected-user-name">{user.name}</h4>
                  <div className="rejected-user-info">
                    <div className="rejected-info-item">
                      <Mail size={16} />
                      <span>{user.email}</span>
                    </div>
                    <div className="rejected-info-item">
                      <MapPin size={16} />
                      <span className="info-label">Address:</span>
                      <span className={user.address ? "info-value" : "info-value-empty"}>
                        {user.address || "Not provided"}
                      </span>
                    </div>
                    <div className="rejected-info-item">
                      <DollarSign size={16} />
                      <span className="payment-method-label">Payment Method:</span>
                      <span className={user.cashapp ? "payment-method-value" : "payment-method-value-empty"}>
                        {user.cashapp || "Not provided"}
                      </span>
                    </div>
                    {user.phoneNumber && (
                      <div className="rejected-info-item">
                        <Phone size={16} />
                        <span>{user.phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="rejected-badge">
                  <UserX size={16} />
                  Rejected
                </span>
              </div>

              {user.rejectionNote && (
                <div className="rejection-note-section">
                  <div className="rejection-note-header">
                    <FileText size={16} />
                    <span className="rejection-note-label">Rejection Note:</span>
                  </div>
                  <p className="rejection-note-text">{user.rejectionNote}</p>
                </div>
              )}

              <div className="rejected-user-footer">
                <div className="rejected-date">
                  <Calendar size={16} />
                  <span>Rejected: {formatDate(user.createdAt)}</span>
                </div>
                <button
                  onClick={() => onMoveToPending(user.id, user.name)}
                  className="btn-action btn-approve"
                >
                  <UserPlus size={16} />
                  <span>Move to Pending</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RejectedUsersSection;
