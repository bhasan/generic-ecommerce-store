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
  const [isApprovingUser, setIsApprovingUser] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);
  const [isRejectingUser, setIsRejectingUser] = useState(false);

  const handleApproveClick = (userId, userName) => {
    setUserToApprove({ id: userId, name: userName });
    setApproveModalOpen(true);
  };

  const handleApproveConfirm = async () => {
    if (!userToApprove) return;
    setIsApprovingUser(true);
    try {
      await onApprove(userToApprove.id);
      setApproveModalOpen(false);
      setUserToApprove(null);
    } catch {
      setApproveModalOpen(false);
      setUserToApprove(null);
    } finally {
      setIsApprovingUser(false);
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
    setIsRejectingUser(true);
    try {
      await onReject(userToReject.id, rejectionNote);
      setRejectModalOpen(false);
      setUserToReject(null);
    } catch {
      setRejectModalOpen(false);
      setUserToReject(null);
    } finally {
      setIsRejectingUser(false);
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
                    {(user.deliveryStatus || user.deliverySource === 'ZIP_FALLBACK') && (
                      <div className="pending-info-item pending-info-item-zone">
                        <MapPin size={16} />
                        <span className="info-label">Delivery zone:</span>
                        <span className="pending-zone-badges">
                          {user.deliveryStatus && (
                            <span className={`pending-zone-badge pending-zone-badge-${user.deliveryStatus.toLowerCase().replace(/_/g, '-')}`}>
                              {formatDeliveryZoneLabel(user.deliveryStatus)}
                            </span>
                          )}
                          {user.deliverySource === 'ZIP_FALLBACK' && (
                            <span className="pending-zone-badge pending-zone-badge-fallback">
                              ZIP fallback
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {(user.deliveryCheckedAt || user.deliveryDistanceMiles !== undefined) && (
                      <div className="pending-info-item pending-info-item-zone-meta">
                        <Clock size={16} />
                        <span className="info-label">Zone check:</span>
                        <span className="info-value">
                          {[
                            user.deliveryDistanceMiles !== undefined && user.deliveryDistanceMiles !== null
                              ? `${user.deliveryDistanceMiles.toFixed(2)} miles`
                              : null,
                            formatCheckedAt(user.deliveryCheckedAt),
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
        confirmText="Approve User"
        cancelText="Cancel"
        type="success"
        isSubmitting={isApprovingUser}
      />

      <RejectUserModal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        onConfirm={handleRejectConfirm}
        userName={userToReject?.username || ''}
        isSubmitting={isRejectingUser}
      />
    </div>
  );
}

export default PendingRegistrationsSection;
