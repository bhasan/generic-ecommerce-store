import React, { useState, useEffect } from 'react';
import './LoginPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { toNotificationMessage } from '../../utils/notificationMessage';
import { isGuest, ROLES } from '../../utils/roles';
import { LogIn, User, Lock } from 'lucide-react';

function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading, currentUser } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (!authLoading && isAuthenticated && !isGuest(currentUser)) {
      // Redirect based on user role
      const primaryRole = currentUser.roles?.[0] || currentUser.role || ROLES.CUSTOMER;
      if (primaryRole === ROLES.CUSTOMER) {
        navigate('/products', { replace: true });
      } else {
        navigate('/orders', { replace: true });
      }
    }
  }, [isAuthenticated, authLoading, currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailTrimmed = (email || '').trim();
    const passwordTrimmed = (password || '').trim();
    const errors = {
      email: !emailTrimmed ? 'Email is required' : '',
      password: !passwordTrimmed ? 'Password is required' : ''
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setIsLoading(true);
    try {
      const success = await login(emailTrimmed, passwordTrimmed);
      if (success) {
        setError('');
        setFieldErrors({ email: '', password: '' });
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError(toNotificationMessage(err?.message ?? err, 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <LogIn size={48} />
          </div>
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <User size={16} />
              <span>Email Address</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
              }}
              className={`form-input ${fieldErrors.email ? 'form-input-error' : ''}`}
              placeholder="you@example.com"
              required
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <span id="email-error" className="form-error-message" role="alert">{fieldErrors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <Lock size={16} />
              <span>Password</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
              }}
              className={`form-input ${fieldErrors.password ? 'form-input-error' : ''}`}
              placeholder="Enter your password"
              required
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && (
              <span id="password-error" className="form-error-message" role="alert">{fieldErrors.password}</span>
            )}
          </div>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button type="submit" className="btn-login" disabled={isLoading}>
            <LogIn size={18} />
            <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an account? <Link to="/register" className="login-link">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;