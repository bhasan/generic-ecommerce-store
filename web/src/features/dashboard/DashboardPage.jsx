import React, { useState, useEffect, useCallback } from 'react';
import './DashboardPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import RejectUserModal from '../../components/common/RejectUserModal';
import { Flag, Star, Trash2, Check, UserPlus, Mail, Phone, DollarSign, Clock, X, MapPin } from 'lucide-react';

function DashboardPage() {
  const { products, updateReview, deleteReview, showNotification } = useApp();
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState(null);
  
  const loadPendingRegistrations = useCallback(async () => {
    try {
      setIsLoadingPending(true);
      const pending = await usersApi.getPendingRegistrations();
      setPendingRegistrations(pending);
    } catch (error) {
      showNotification(error.message || 'Failed to load pending registrations', 'error');
    } finally {
      setIsLoadingPending(false);
    }
  }, []);

  // Load pending registrations
  useEffect(() => {
    loadPendingRegistrations();
  }, [loadPendingRegistrations]);

  const handleApproveUser = async (userId, userName) => {
    if (!window.confirm(`Approve registration for "${userName}"?`)) {
      return;
    }

    try {
      await usersApi.approveUser(userId);
      showNotification('User approved successfully', 'success');
      loadPendingRegistrations(); // Reload list
    } catch (error) {
      showNotification(error.message || 'Failed to approve user', 'error');
    }
  };

  const handleRejectClick = (userId, userName) => {
    setUserToReject({ id: userId, name: userName });
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async (rejectionNote) => {
    if (!userToReject) return;

    try {
      await usersApi.rejectUser(userToReject.id, rejectionNote);
      showNotification('User registration rejected', 'success');
      setRejectModalOpen(false);
      setUserToReject(null);
      loadPendingRegistrations(); // Reload list
    } catch (error) {
      showNotification(error.message || 'Failed to reject user', 'error');
    }
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setUserToReject(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };
  
  // Collect all flagged reviews from all products
  const flaggedReviews = [];
  products.forEach(product => {
    if (product.reviews) {
      product.reviews
        .filter(review => review.flagged)
        .forEach(review => {
          flaggedReviews.push({
            ...review,
            productId: product.id,
            productName: product.name
          });
        });
    }
  });

  const handleUnflag = (productId, reviewId) => {
    updateReview(productId, reviewId, { flagged: false });
  };

  const handleDeleteReview = (productId, reviewId, productName) => {
    if (window.confirm(`Delete this review from "${productName}"?`)) {
      deleteReview(productId, reviewId);
    }
  };

  return (
    <div className="dashboard-page-container">
      <div className="dashboard-header">
        <div>
          <h2 className="page-title">Store Dashboard</h2>
          <p className="page-subtitle">Store management and analytics</p>
        </div>
      </div>

      {/* Pending Registrations Section */}
      <div className="pending-registrations-section">
        <h3 className="section-title">
          <UserPlus size={24} />
          Pending Registrations
        </h3>
        
        {isLoadingPending ? (
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
                      onClick={() => handleApproveUser(user.id, user.name)}
                      className="btn-action btn-approve"
                    >
                      <Check size={16} />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleRejectClick(user.id, user.name)}
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

      {/* Reject User Modal */}
      <RejectUserModal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        onConfirm={handleRejectConfirm}
        userName={userToReject?.name || ''}
      />

      {/* HIDDEN: Flagged Reviews Stats - may re-enable later */}
      {/* <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">
            <Flag size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{flaggedReviews.length}</span>
            <span className="stat-label">Flagged Reviews</span>
          </div>
        </div>
      </div> */}

      {/* HIDDEN: Flagged Reviews Section - may re-enable later */}
      {/* <div className="flagged-reviews-section">
        <h3 className="section-title">Flagged Reviews</h3>
        
        {flaggedReviews.length === 0 ? (
          <div className="empty-state">
            <Flag size={64} className="empty-icon" />
            <p>No flagged reviews. All reviews are in good standing!</p>
          </div>
        ) : (
          <div className="flagged-reviews-list">
            {flaggedReviews.map(review => (
              <div key={`${review.productId}-${review.id}`} className="flagged-review-card">
                <div className="flagged-review-header">
                  <div>
                    <h4 className="product-link">{review.productName}</h4>
                    <div className="reviewer-info">
                      <span className="reviewer-name">{review.userName}</span>
                      <div className="review-rating">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star
                            key={i}
                            size={14}
                            fill={i <= review.rating ? '#fbbf24' : 'none'}
                            color={i <= review.rating ? '#fbbf24' : '#9ca3af'}
                          />
                        ))}
                      </div>
                      <span className="review-date">{review.date}</span>
                    </div>
                  </div>
                  <span className="flagged-badge-large">
                    <Flag size={16} />
                    Flagged
                  </span>
                </div>

                <div className="flagged-review-content">
                  <p className="review-comment">{review.comment}</p>
                </div>

                <div className="flagged-review-stats">
                  <div className="review-votes-display">
                    <span className="vote-stat vote-helpful">
                      👍 {review.helpful} helpful
                    </span>
                    <span className="vote-stat vote-not-helpful">
                      👎 {review.notHelpful} not helpful
                    </span>
                  </div>
                </div>

                <div className="flagged-review-actions">
                  <button
                    onClick={() => handleUnflag(review.productId, review.id)}
                    className="btn-action btn-approve"
                  >
                    <Check size={16} />
                    <span>Approve Review</span>
                  </button>
                  <button
                    onClick={() => handleDeleteReview(review.productId, review.id, review.productName)}
                    className="btn-action btn-delete-flagged"
                  >
                    <Trash2 size={16} />
                    <span>Delete Review</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div> */}
    </div>
  );
}

export default DashboardPage;