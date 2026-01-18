import React, { useState, useEffect } from 'react';
import './ProfilePage.css';
import { useApp } from '../../context/AppContext';
import { User, Mail, Save, Shield } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';
import * as authApi from '../../services/authApi';

function ProfilePage() {
  const { currentUser, updateUserProfile, showNotification } = useApp();
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    email: currentUser.email || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState('');

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const user = await authApi.getProfile();
        setFormData({
          name: user.name || '',
          email: user.email || '',
        });
      } catch (err) {
        setError(err.message || 'Failed to load profile');
        showNotification(err.message || 'Failed to load profile', 'error');
      } finally {
        setIsLoadingProfile(false);
      }
    };

    // Only load if we have a real user (not guest)
    if (currentUser.id !== 999) {
      loadProfile();
    } else {
      setIsLoadingProfile(false);
    }
  }, [currentUser.id, showNotification]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await updateUserProfile(formData);
      // Success notification is handled in AppContext
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  // Get primary role for display
  const primaryRole = currentUser.roles?.[0] || currentUser.role || 'CUSTOMER';
  const rolesDisplay = currentUser.roles?.join(', ') || primaryRole;

  if (isLoadingProfile) {
    return (
      <div className="profile-page-container">
        <div className="profile-header section-header-surface">
          <div>
            <h2 className="page-title">Loading Profile...</h2>
          </div>
        </div>
        <HeaderDivider />
      </div>
    );
  }

  return (
    <div className="profile-page-container">
      <div className="profile-header section-header-surface">
        <div>
          <h2 className="page-title">Change Profile</h2>
          <p className="page-subtitle">Update your account information</p>
        </div>
      </div>
      <HeaderDivider />

      <div className="profile-content">
        <div className="profile-card surface-card-accent">
          <div className="profile-avatar">
            <User size={48} />
          </div>

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label htmlFor="name" className="form-label">
                <User size={16} />
                <span>Full Name</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                <Mail size={16} />
                <span>Email Address</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="form-input"
                required
              />
            </div>

            <div className="profile-info-box">
              <Shield size={20} />
              <div>
                <p className="info-title">Account Role{currentUser.roles?.length > 1 ? 's' : ''}</p>
                <p className="info-value">{rolesDisplay}</p>
              </div>
            </div>

            {error && (
              <div className="profile-error" style={{ color: '#ef4444', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-save-profile" disabled={isLoading || isLoadingProfile}>
              <Save size={18} />
              <span>{isLoading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </form>
        </div>

        <div className="profile-sidebar">
          <div className="profile-stats-card surface-card">
            <h3 className="stats-title">Account Statistics</h3>
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-label">Account ID</span>
                <span className="stat-value">#{currentUser.id}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Role{currentUser.roles?.length > 1 ? 's' : ''}</span>
                <span className="stat-value">{rolesDisplay}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Status</span>
                <span className="stat-value stat-active">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;