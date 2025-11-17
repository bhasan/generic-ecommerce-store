import React, { useState } from 'react';
import './ProfilePage.css';
import { useApp } from '../../context/AppContext';
import { User, Mail, Save, Shield } from 'lucide-react';

function ProfilePage() {
  const { currentUser, updateUserProfile } = useApp();
  const [formData, setFormData] = useState({
    name: currentUser.name,
    email: currentUser.email,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateUserProfile(formData);
  };

  return (
    <div className="profile-page-container">
      <div className="profile-header">
        <div>
          <h2 className="page-title">Change Profile</h2>
          <p className="page-subtitle">Update your account information</p>
        </div>
      </div>

      <div className="profile-content">
        <div className="profile-card">
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
                <p className="info-title">Account Role</p>
                <p className="info-value">{currentUser.role}</p>
              </div>
            </div>

            <button type="submit" className="btn-save-profile">
              <Save size={18} />
              <span>Save Changes</span>
            </button>
          </form>
        </div>

        <div className="profile-sidebar">
          <div className="profile-stats-card">
            <h3 className="stats-title">Account Statistics</h3>
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-label">Account ID</span>
                <span className="stat-value">#{currentUser.id}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Role</span>
                <span className="stat-value">{currentUser.role}</span>
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