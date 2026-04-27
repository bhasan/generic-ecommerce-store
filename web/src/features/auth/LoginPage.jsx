import React, { useState, useEffect, useRef } from 'react';
import './LoginPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { toNotificationMessage } from '../../utils/notificationMessage';
import { isGuest, ROLES } from '../../utils/roles';
import { LogIn, User, Lock, Eye, EyeOff } from 'lucide-react';

import SpaceTravelerGraphic from './SpaceTravelerGraphic';

function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading, currentUser } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const justLoggedInRef = useRef(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isGuest(currentUser) && !justLoggedInRef.current) {
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
    const usernameTrimmed = (username || '').trim().toLowerCase();
    const passwordTrimmed = (password || '').trim();
    const errors = {
      username: !usernameTrimmed ? 'Username is required' : '',
      password: !passwordTrimmed ? 'Password is required' : ''
    };
    setFieldErrors(errors);
    if (errors.username || errors.password) return;

    setIsLoading(true);
    justLoggedInRef.current = true;
    try {
      const success = await login(usernameTrimmed, passwordTrimmed);
      if (success) {
        setError('');
        setFieldErrors({ username: '', password: '' });
      } else {
        justLoggedInRef.current = false;
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      justLoggedInRef.current = false;
      setError(toNotificationMessage(err?.message ?? err, 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper glass-layout">
      {/* Immersive Background */}
      <div className="login-background">
        <SpaceTravelerGraphic />
      </div>

      {/* Glassmorphism Card Container */}
      <div className="login-content-container animate-in" style={{ '--index': 1 }}>
        <div className="login-glass-card">
          <div className="login-header">
            <div className="login-logo">
              <LogIn size={32} />
            </div>
            <h1 className="login-glass-headline">Welcome</h1>
            <p className="login-glass-subtitle">Login or register to get started!</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                <User size={16} />
                <span>Username</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: '' }));
                }}
                className={`form-input glass-input ${fieldErrors.username ? 'form-input-error' : ''}`}
                placeholder="Username"
                required
                aria-invalid={!!fieldErrors.username}
              />
              {fieldErrors.username && (
                <span className="form-error-message" role="alert">{fieldErrors.username}</span>
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
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  className={`form-input glass-input ${fieldErrors.password ? 'form-input-error' : ''}`}
                  placeholder="Password"
                  required
                  aria-invalid={!!fieldErrors.password}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="form-error-message" role="alert">{fieldErrors.password}</span>
              )}
            </div>

            <div aria-live="polite">
              {error && (
                <div className="login-error glass-error">
                  {error}
                </div>
              )}
            </div>

            <button type="submit" className="btn-login" disabled={isLoading}>
              {isLoading ? (
                <span className="loading-spinner-small" />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>Don't have an account yet?</p>
            <Link to="/register" className="btn-signup-glass">Create an Account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;