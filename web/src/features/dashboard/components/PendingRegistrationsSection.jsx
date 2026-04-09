import React, { useState } from 'react';
import { UserPlus, Phone, DollarSign, Clock, X, MapPin, Check } from 'lucide-react';
import ConfirmationModal from '../../../components/common/ConfirmationModal';
import RejectUserModal from '../../../components/common/RejectUserModal';

const formatDeliveryZoneLabel = (status) => {
  switch (status) {
    case 'IN_ZONE':
      return 'In zone';
    case 'OUT_OF_ZONE':
      return 'Out of zone';
    case 'UNVERIFIED':
      return 'Unverified';
    default:
      return '';
  }
};

const formatCheckedAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

function PendingRegistrationsSection({
  isLoading,
  pendingRegistrations,
  formatDate,
  onApprove,
  onReject
}) {
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [userToApprove, setUserToApprove] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);

  const handleApproveClick = (userId, userName) => {
    setUserToApprove({ id: userId, name: userName });
    setApproveModalOpen(true);
  };

  const handleApproveConfirm = async () => {
    if (!userToApprove) return;
    try {
      await onApprove(userToApprove.id);
      setApproveModalOpen(false);
      setUserToApprove(null);
    } catch {
      setApproveModalOpen(false);
      setUserToApprove(null);
    }
  };

  const handleApproveCancel = () => {
    setApproveModalOpen(false);
    setUserToApprove(null);
  };

  const handleRejectClick = (userId, userName) => {
    setUserToReject({ id: userId, name: userName });
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async (rejectionNote) => {
    if (!userToReject) return;
    try {
      await onReject(userToReject.id, rejectionNote);
      setRejectModalOpen(false);
      setUserToReject(null);
    } catch {
      setRejectModalOpen(false);
      setUserToReject(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setUserToReject(null);
  };

  return (
    <div className="dashboard-content-section surface-card">
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
                  <h4 className="pending-user-name">{user.username}</h4>
                  <div className="pending-user-info">
                    <div className="pending-info-item">
                      <MapPin size={16} />
                      <span className="info-label">Address:</span>
                      <span className={user.address ? "info-value" : "info-value-empty"}>
                        {user.address || "Not provided"}
                      </span>
                    </div>
                    {(user.deliveryZoneStatus || user.deliveryZoneSource === 'ZIP_FALLBACK') && (
                      <div className="pending-info-item pending-info-item-zone">
                        <MapPin size={16} />
                        <span className="info-label">Delivery zone:</span>
                        <span className="pending-zone-badges">
                          {user.deliveryZoneStatus && (
                            <span className={`pending-zone-badge pending-zone-badge-${user.deliveryZoneStatus.toLowerCase().replace(/_/g, '-')}`}>
                              {formatDeliveryZoneLabel(user.deliveryZoneStatus)}
                            </span>
                          )}
                          {user.deliveryZoneSource === 'ZIP_FALLBACK' && (
                            <span className="pending-zone-badge pending-zone-badge-fallback">
                              ZIP fallback
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {(user.deliveryZoneCheckedAt || user.deliveryZoneDistanceMiles !== undefined) && (
                      <div className="pending-info-item pending-info-item-zone-meta">
                        <Clock size={16} />
                        <span className="info-label">Zone check:</span>
                        <span className="info-value">
                          {[
                            user.deliveryZoneDistanceMiles !== undefined && user.deliveryZoneDistanceMiles !== null
                              ? `${user.deliveryZoneDistanceMiles.toFixed(2)} miles`
                              : null,
                            formatCheckedAt(user.deliveryZoneCheckedAt),
                          ].filter(Boolean).join(' | ') || 'Recorded'}
                        </span>
                      </div>
                    )}
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
                    onClick={() => handleApproveClick(user.id, user.username)}
                    className="btn-action btn-approve"
                  >
                    <Check size={16} />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleRejectClick(user.id, user.username)}
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

      <ConfirmationModal
        isOpen={approveModalOpen}
        onClose={handleApproveCancel}
        onConfirm={handleApproveConfirm}
        title="Approve User Registration"
        message={
          <>
            Are you sure you want to approve registration for <strong>{userToApprove?.name || ''}</strong>?
            <br />
            <br />
            This will grant them access to the system.
          </>
        }
        confirmText="Approve"
        cancelText="Cancel"
        type="success"
      />

      <RejectUserModal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        onConfirm={handleRejectConfirm}
        userName={userToReject?.username || ''}
      />
    </div>
  );
}

export default PendingRegistrationsSection;
