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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });
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
    const usernameTrimmed = (username || '').trim();
    const passwordTrimmed = (password || '').trim();
    const errors = {
      username: !usernameTrimmed ? 'Username is required' : '',
      password: !passwordTrimmed ? 'Password is required' : ''
    };
    setFieldErrors(errors);
    if (errors.username || errors.password) return;

    setIsLoading(true);
    try {
      const success = await login(usernameTrimmed, passwordTrimmed);
      if (success) {
        setError('');
        setFieldErrors({ username: '', password: '' });
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
          <h1 className="login-title">Welcome</h1>
          <p className="login-subtitle">Sign in to your account to continue</p>
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
              placeholder="Enter your Username"
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
          <p>Don't have an account?</p>
          <Link to="/register" className="btn-signup">Create an Account</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;