import React, { useState } from 'react';
import './RegisterPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserPlus, Mail, Lock, User, Phone, DollarSign, AlertCircle, MapPin } from 'lucide-react';

function RegisterPage() {
  const { register, showNotification } = useApp();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    address: '',
    cashapp: '',
    phoneNumber: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const response = await register({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        address: formData.address || undefined,
        cashapp: formData.cashapp,
        phoneNumber: formData.phoneNumber || undefined
      });
      
      if (response) {
        showNotification(response.message || 'Registration successful! Please visit the store to get approved.', 'success');
        navigate('/login');
      }
    } catch (err) {
      const errorMessage = err.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

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
          <AlertCircle size={20} />
          <p>Please visit the store after registration to get your account approved.</p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              <User size={16} />
              <span>Full Name</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              className="form-input"
              placeholder="John Doe"
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
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="form-input"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <Lock size={16} />
              <span>Password</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="form-input"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
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
                // Auto-add $ if not present
                if (value && !value.startsWith('$')) {
                  value = '$' + value;
                }
                setFormData({ ...formData, cashapp: value });
              }}
              className="form-input"
              placeholder="$YourCashApp"
              required
            />
            <span className="form-hint">Required for payment processing</span>
          </div>

          <div className="form-group">
            <label htmlFor="phoneNumber" className="form-label">
              <Phone size={16} />
              <span>5-Star Rewards Phone Number (Optional)</span>
            </label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={handleChange}
              className="form-input"
              placeholder="(555) 123-4567"
            />
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



