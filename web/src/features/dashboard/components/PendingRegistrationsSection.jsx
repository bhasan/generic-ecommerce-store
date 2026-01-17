import React from 'react';
import { UserPlus, Mail, Phone, DollarSign, Clock, X, MapPin, Check } from 'lucide-react';

function PendingRegistrationsSection({
  isLoading,
  pendingRegistrations,
  formatDate,
  onApprove,
  onReject
}) {
  return (
    <div className="dashboard-content-section">
      <div className="section-header">
        <h3 className="section-title">
          <UserPlus size={24} />
          Pending Registrations
        </h3>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading pending registrations...</p>
        </div>
      ) : pendingRegistrations.length === 0 ? (
        <div className="empty-state">
          <Check size={64} className="empty-icon" />
          <p>No pending registrations. All users are approved!</p>
        </div>
      ) : (
        <div className="pending-registrations-list">
          {pendingRegistrations.map(user => (
            <div key={user.id} className="pending-registration-card">
              <div className="pending-registration-header">
                <div>
                  <h4 className="pending-user-name">{user.name}</h4>
                  <div className="pending-user-info">
                    <div className="pending-info-item">
                      <Mail size={16} />
                      <span>{user.email}</span>
                    </div>
                    <div className="pending-info-item">
                      <MapPin size={16} />
                      <span className="info-label">Address:</span>
                      <span className={user.address ? "info-value" : "info-value-empty"}>
                        {user.address || "Not provided"}
                      </span>
                    </div>
                    <div className="pending-info-item">
                      <DollarSign size={16} />
                      <span className="payment-method-label">Payment Method:</span>
                      <span className={user.cashapp ? "payment-method-value" : "payment-method-value-empty"}>
                        {user.cashapp || "Not provided"}
                      </span>
                    </div>
                    {user.phoneNumber && (
                      <div className="pending-info-item">
                        <Phone size={16} />
                        <span>{user.phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="pending-badge">
                  <Clock size={16} />
                  Pending
                </span>
              </div>

              <div className="pending-registration-footer">
                <div className="pending-date">
                  Registered: {formatDate(user.createdAt)}
                </div>
                <div className="pending-actions">
                  <button
                    onClick={() => onApprove(user.id, user.name)}
                    className="btn-action btn-approve"
                  >
                    <Check size={16} />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => onReject(user.id, user.name)}
                    className="btn-action btn-reject"
                  >
                    <X size={16} />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PendingRegistrationsSection;
