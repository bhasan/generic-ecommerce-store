import React, { useState, useEffect, useCallback } from 'react';
import './RejectedUsersPage.css';
import { useApp } from '../../context/AppContext';
import * as usersApi from '../../services/usersApi';
import { UserX, Mail, Phone, DollarSign, MapPin, Clock, Calendar, FileText } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';

function RejectedUsersPage() {
  const { showNotification } = useApp();
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRejectedUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const rejected = await usersApi.getRejectedUsers();
      setRejectedUsers(rejected);
    } catch (error) {
      showNotification(error.message || 'Failed to load rejected users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []); // showNotification is stable (wrapped in useCallback in AppContext)

  useEffect(() => {
    loadRejectedUsers();
  }, [loadRejectedUsers]);

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

  return (
    <div className="rejected-users-page-container">
      <div className="rejected-users-header section-header-surface">
        <div>
          <h2 className="page-title">Rejected Users</h2>
          <p className="page-subtitle">Users who were rejected during registration</p>
        </div>
      </div>
      <HeaderDivider />

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
                  <h4 className="rejected-user-name">{user.username}</h4>
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
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
  );
}

export default RejectedUsersPage;

