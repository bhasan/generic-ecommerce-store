import React, { useState, useEffect, useRef } from 'react';
import './LoginPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { toNotificationMessage } from '../../utils/notificationMessage';
import { isGuest, ROLES } from '../../utils/roles';
import { LogIn, User, Lock } from 'lucide-react';

import SpaceTravelerGraphic from './SpaceTravelerGraphic';

function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading, currentUser } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="login-page-wrapper">
      {/* Hero Section */}
      <section className="login-landing-hero">
        <h1 className="login-landing-headline animate-in" style={{ '--index': 1 }}>
          Welcome, Login or Register to enter
        </h1>
      </section>

      {/* Content Grid */}
      <div className="login-content-grid">
        {/* Left Side: Graphic */}
        <div className="animate-in" style={{ '--index': 2 }}>
          <SpaceTravelerGraphic />
        </div>

        {/* Right Side: Login Card */}
        <div className="animate-in" style={{ '--index': 3 }}>
          <div className="login-card">
            <div className="login-header">
              <div className="login-logo">
                <LogIn size={32} />
              </div>
              <h2 className="login-title">Sign In</h2>
              <p className="login-subtitle">Access your account and start ordering</p>
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
                  className={`form-input ${fieldErrors.username ? 'form-input-error' : ''}`}
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
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  className={`form-input ${fieldErrors.password ? 'form-input-error' : ''}`}
                  placeholder="Password"
                  required
                  aria-invalid={!!fieldErrors.password}
                />
                {fieldErrors.password && (
                  <span className="form-error-message" role="alert">{fieldErrors.password}</span>
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
              <p>Don't have an account yet?</p>
              <Link to="/register" className="btn-signup">Create an Account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;