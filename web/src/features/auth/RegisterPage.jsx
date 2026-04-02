import React, { useState } from 'react';
import './RegisterPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { toNotificationMessage } from '../../utils/notificationMessage';
import { UserPlus, AtSign, Lock, Phone, DollarSign, AlertCircle, MapPin, CheckCircle, Eye, EyeOff } from 'lucide-react';

function RegisterPage() {
  const { register, showNotification, pickupLocation, paymentSettings } = useApp();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    address: '',
    cashapp: '',
    phoneNumber: ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '', cashapp: '', phoneNumber: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const usernameTrimmed = (formData.username || '').trim();
    const passwordTrimmed = (formData.password || '').trim();
    const cashappTrimmed = (formData.cashapp || '').trim();
    const phoneTrimmed = (formData.phoneNumber || '').trim();
    const errors = {
      username: !usernameTrimmed ? 'Username is required' : '',
      password: !passwordTrimmed ? 'Password is required' : '',
      cashapp: paymentSettings?.cashapp?.enabled && !cashappTrimmed ? 'CashApp username is required' : '',
      phoneNumber: !phoneTrimmed
        ? 'Phone number is required'
        : !/^\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(phoneTrimmed)
          ? 'Enter a valid phone number (e.g. (555) 123-4567)'
          : ''
    };
    setFieldErrors(errors);
    if (errors.username || errors.password || errors.cashapp || errors.phoneNumber) return;

    setIsLoading(true);
    try {
      const response = await register({
        username: usernameTrimmed,
        password: passwordTrimmed,
        address: formData.address || undefined,
        cashapp: cashappTrimmed,
        phoneNumber: phoneTrimmed
      });

      if (response) {
        setRegistrationComplete(true);
      }
    } catch (err) {
      const errorMessage = toNotificationMessage(err?.message ?? err, 'Registration failed. Please try again.');
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (registrationComplete) {
    return (
      <div className="register-page-container">
        <div className="register-card register-success-card">
          <div className="register-success-content">
            <div className="register-success-icon">
              <CheckCircle size={80} />
            </div>
            <h1 className="register-success-title">Registration Submitted</h1>
            <div className="register-success-callout">
              <MapPin size={28} />
              <div>
                <p className="register-success-message">
                  Please visit the store in person to complete your registration and get approved.
                </p>
                {pickupLocation && <p className="register-success-address">{pickupLocation}</p>}
              </div>
            </div>
            <p className="register-success-subtext">
              Once approved, you can sign in and start placing orders.
            </p>
            <Link to="/login" className="btn-register-success-link">
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page-container">
      <div className="register-card">
        <div className="register-header">
          <div className="register-logo">
            <UserPlus size={48} />
          </div>
          <h1 className="register-title">Create Account</h1>
          <p className="register-subtitle">Sign up to get started</p>
        </div>

        <div className="approval-notice">
          <MapPin size={22} />
          <div>
            <p className="approval-notice-title">In-Person Approval Required</p>
            <p className="approval-notice-body">Please visit the store in person to complete your registration and get approved.</p>
            {pickupLocation && <p className="approval-notice-address">{pickupLocation}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              <AtSign size={16} />
              <span>Username</span>
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              className={`form-input ${fieldErrors.username ? 'form-input-error' : ''}`}
              placeholder="your_username"
              required
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            />
            {fieldErrors.username && (
              <span id="username-error" className="form-error-message" role="alert">{fieldErrors.username}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <Lock size={16} />
              <span>Password</span>
            </label>
            <div className="password-input-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                className={`form-input ${fieldErrors.password ? 'form-input-error' : ''}`}
                placeholder="At least 6 characters"
                minLength={6}
                required
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <span id="password-error" className="form-error-message" role="alert">{fieldErrors.password}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="address" className="form-label">
              <MapPin size={16} />
              <span>Delivery Address (Optional)</span>
            </label>
            <input
              id="address"
              name="address"
              type="text"
              value={formData.address}
              onChange={handleChange}
              className="form-input"
              placeholder="123 Main St, City, State ZIP"
            />
          </div>

          {paymentSettings?.cashapp?.enabled && (
            <div className="form-group">
              <label htmlFor="cashapp" className="form-label">
                <DollarSign size={16} />
                <span>CashApp Username</span>
              </label>
              <input
                id="cashapp"
                name="cashapp"
                type="text"
                value={formData.cashapp}
                onChange={(e) => {
                  let value = e.target.value;
                  if (value && !value.startsWith('$')) value = '$' + value;
                  setFormData({ ...formData, cashapp: value });
                  if (fieldErrors.cashapp) setFieldErrors((prev) => ({ ...prev, cashapp: '' }));
                }}
                className={`form-input ${fieldErrors.cashapp ? 'form-input-error' : ''}`}
                placeholder="$YourCashApp"
                required
                aria-invalid={!!fieldErrors.cashapp}
                aria-describedby={fieldErrors.cashapp ? 'cashapp-error' : undefined}
              />
              {fieldErrors.cashapp && (
                <span id="cashapp-error" className="form-error-message" role="alert">{fieldErrors.cashapp}</span>
              )}
              <span className="form-hint">Required for payment processing</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="phoneNumber" className="form-label">
              <Phone size={16} />
              <span>Phone Number</span>
            </label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={handleChange}
              className={`form-input ${fieldErrors.phoneNumber ? 'form-input-error' : ''}`}
              placeholder="(555) 123-4567"
              required
              aria-invalid={!!fieldErrors.phoneNumber}
              aria-describedby={fieldErrors.phoneNumber ? 'phoneNumber-error' : undefined}
            />
            {fieldErrors.phoneNumber && (
              <span id="phoneNumber-error" className="form-error-message" role="alert">{fieldErrors.phoneNumber}</span>
            )}
          </div>

          {error && (
            <div className="register-error">
              {error}
            </div>
          )}

          <button type="submit" className="btn-register" disabled={isLoading}>
            <UserPlus size={18} />
            <span>{isLoading ? 'Creating Account...' : 'Create Account'}</span>
          </button>
        </form>

        <div className="register-footer">
          <p>Already have an account? <Link to="/login" className="register-link">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;



