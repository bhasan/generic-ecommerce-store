import React, { useState } from 'react';
import './ProfilePage.css';
import { useApp } from '../../context/AppContext';
import { User, Mail, Save, DollarSign, MapPin, Phone, Lock } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';
import { isGuest } from '../../utils/roles';

// Helper to parse address string into components
const parseAddress = (addressStr) => {
  if (!addressStr) return { street: '', apartment: '', city: '', state: 'TX', zipCode: '' };
  
  // Try to parse address like "123 Main St, Apt 4B, City, TX 12345"
  const parts = addressStr.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Check if second part looks like an apartment
    const hasApt = parts[1]?.toLowerCase().includes('apt') || parts[1]?.toLowerCase().includes('suite');
    
    if (hasApt && parts.length >= 4) {
      // Format: street, apt, city, state zip
      const stateZip = parts[3]?.split(' ') || [];
      return {
        street: parts[0] || '',
        apartment: parts[1]?.replace(/^(apt|suite)\s*/i, '') || '',
        city: parts[2] || '',
        state: stateZip[0] || 'TX',
        zipCode: stateZip[1] || ''
      };
    } else {
      // Format: street, city, state zip
      const stateZip = parts[2]?.split(' ') || [];
      return {
        street: parts[0] || '',
        apartment: '',
        city: parts[1] || '',
        state: stateZip[0] || 'TX',
        zipCode: stateZip[1] || ''
      };
    }
  }
  
  // Fallback - just put everything in street
  return { street: addressStr, apartment: '', city: '', state: 'TX', zipCode: '' };
};

// Helper to combine address components into string
const formatAddress = (address) => {
  const parts = [address.street];
  if (address.apartment) parts.push(`Apt ${address.apartment}`);
  if (address.city) parts.push(address.city);
  if (address.state || address.zipCode) {
    parts.push(`${address.state} ${address.zipCode}`.trim());
  }
  return parts.filter(Boolean).join(', ');
};

function ProfilePage() {
  const { currentUser, updateUserProfile, showNotification } = useApp();
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    email: currentUser.email || '',
    cashapp: currentUser.cashapp || '',
    phoneNumber: currentUser.phoneNumber || '',
  });
  const [address, setAddress] = useState(parseAddress(currentUser.address));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Combine address fields into single string for storage
      const fullAddress = formatAddress(address);
      await updateUserProfile({ ...formData, address: fullAddress });
      // Success notification is handled in AppContext
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordErrors({});

    const currentTrimmed = (passwordForm.currentPassword || '').trim();
    const newTrimmed = (passwordForm.newPassword || '').trim();
    const confirmTrimmed = (passwordForm.confirmPassword || '').trim();

    const errors = {};
    if (!currentTrimmed) errors.currentPassword = 'Current password is required';
    if (!newTrimmed) errors.newPassword = 'New password is required';
    else if (newTrimmed.length < 6) errors.newPassword = 'New password must be at least 6 characters';
    if (newTrimmed !== confirmTrimmed) errors.confirmPassword = 'Passwords do not match';

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setIsLoadingPassword(true);
    try {
      await updateUserProfile({ currentPassword: currentTrimmed, password: newTrimmed });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordErrors({ currentPassword: err.message || 'Failed to change password' });
    } finally {
      setIsLoadingPassword(false);
    }
  };

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

            <div className="form-group">
              <label htmlFor="cashapp" className="form-label">
                <DollarSign size={16} />
                <span>CashApp Username</span>
              </label>
              <input
                id="cashapp"
                type="text"
                value={formData.cashapp}
                onChange={(e) => {
                  let value = e.target.value;
                  // Auto-add $ if not present
                  if (value && !value.startsWith('$')) {
                    value = '$' + value;
                  }
                  setFormData({ ...formData, cashapp: value });
                }}
                className="form-input"
                placeholder="$YourCashApp"
              />
              <span className="form-hint">Required for payment processing</span>
            </div>

            <div className="form-section">
              <label className="form-label form-section-label">
                <MapPin size={16} />
                <span>Delivery Address</span>
              </label>
              
              <div className="form-group">
                <label htmlFor="street" className="form-label-small">Street Address</label>
                <input
                  id="street"
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="form-input"
                  placeholder="123 Main Street"
                />
              </div>

              <div className="form-group">
                <label htmlFor="apartment" className="form-label-small">Apartment, Suite, etc. (Optional)</label>
                <input
                  id="apartment"
                  type="text"
                  value={address.apartment}
                  onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
                  className="form-input"
                  placeholder="Apt 4B"
                />
              </div>

              <div className="form-row">
                <div className="form-group form-group-city">
                  <label htmlFor="city" className="form-label-small">City</label>
                  <input
                    id="city"
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="form-input"
                    placeholder="Houston"
                  />
                </div>

                <div className="form-group form-group-state">
                  <label htmlFor="state" className="form-label-small">State</label>
                  <select
                    id="state"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="form-input"
                  >
                    <option value="TX">TX</option>
                  </select>
                </div>

                <div className="form-group form-group-zip">
                  <label htmlFor="zipCode" className="form-label-small">ZIP Code</label>
                  <input
                    id="zipCode"
                    type="text"
                    value={address.zipCode}
                    onChange={(e) => setAddress({ ...address, zipCode: e.target.value })}
                    className="form-input"
                    placeholder="77001"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber" className="form-label">
                <Phone size={16} />
                <span>Phone Number</span>
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="form-input"
                placeholder="(555) 123-4567"
              />
            </div>

            {error && (
              <div className="profile-error" style={{ color: '#ef4444', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-save-profile" disabled={isLoading}>
              <Save size={18} />
              <span>{isLoading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </form>

          {!isGuest(currentUser) && (
            <>
              <div className="profile-password-divider" />
              <div className="profile-password-section">
                <label className="form-label form-section-label">
                  <Lock size={16} />
                  <span>Change Password</span>
                </label>
                <form onSubmit={handlePasswordSubmit} className="profile-form">
                  <div className="form-group">
                    <label htmlFor="currentPassword" className="form-label-small">Current Password</label>
                    <input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => {
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value });
                        if (passwordErrors.currentPassword) setPasswordErrors({ ...passwordErrors, currentPassword: '' });
                      }}
                      className={`form-input ${passwordErrors.currentPassword ? 'form-input-error' : ''}`}
                      placeholder="Enter current password"
                      autoComplete="current-password"
                    />
                    {passwordErrors.currentPassword && (
                      <span className="form-error-message">{passwordErrors.currentPassword}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="newPassword" className="form-label-small">New Password</label>
                    <input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => {
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value });
                        if (passwordErrors.newPassword) setPasswordErrors({ ...passwordErrors, newPassword: '' });
                      }}
                      className={`form-input ${passwordErrors.newPassword ? 'form-input-error' : ''}`}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                    />
                    {passwordErrors.newPassword && (
                      <span className="form-error-message">{passwordErrors.newPassword}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPassword" className="form-label-small">Confirm New Password</label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => {
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value });
                        if (passwordErrors.confirmPassword) setPasswordErrors({ ...passwordErrors, confirmPassword: '' });
                      }}
                      className={`form-input ${passwordErrors.confirmPassword ? 'form-input-error' : ''}`}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                    {passwordErrors.confirmPassword && (
                      <span className="form-error-message">{passwordErrors.confirmPassword}</span>
                    )}
                  </div>
                  <button type="submit" className="btn-save-profile btn-change-password" disabled={isLoadingPassword}>
                    <Lock size={18} />
                    <span>{isLoadingPassword ? 'Changing...' : 'Change Password'}</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;