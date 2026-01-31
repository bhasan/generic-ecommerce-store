import React, { useState, useEffect } from 'react';
import './LoginPage.css';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { LogIn, User, Lock } from 'lucide-react';

function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading, currentUser } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (!authLoading && isAuthenticated && currentUser.email !== 'guest@smokestation.com') {
      // Redirect based on user role
      const primaryRole = currentUser.roles?.[0] || currentUser.role || 'CUSTOMER';
      if (primaryRole === 'CUSTOMER') {
        navigate('/products', { replace: true });
      } else {
        navigate('/orders', { replace: true });
      }
    }
  }, [isAuthenticated, authLoading, currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const success = await login(email, password);
      if (success) {
        setError('');
        // Navigation is handled in AppContext
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const quickLogin = async (testEmail) => {
    setEmail(testEmail);
    setPassword('test123'); // Use actual password from backend seed
    setError('');
    setIsLoading(true);
    
    try {
      // Use actual passwords from backend seed data
      const passwords = {
        'customer@test.com': 'customer123',
        'manager@test.com': 'manager123',
        'admin@test.com': 'admin123'
      };
      
      const success = await login(testEmail, passwords[testEmail] || 'test123');
      if (!success) {
        setError('Quick login failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Quick login failed. Please try again.');
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
              onChange={(e) => setEmail(e.target.value)}
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
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter your password"
              required
            />
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

        {/* Quick Login - Only shown in development mode */}
        {import.meta.env.DEV && (
          <>
            <div className="login-divider">
              <span>Or try a demo account</span>
            </div>

            <div className="quick-login-section">
              <p className="quick-login-label">Quick Login</p>
              <div className="quick-login-buttons">
                <button
                  onClick={() => quickLogin('customer@test.com')}
                  className="btn-quick-login"
                >
                  <User size={16} />
                  <div className="quick-login-text">
                    <span className="quick-login-role">Customer</span>
                    <span className="quick-login-email">customer@test.com</span>
                  </div>
                </button>
                <button
                  onClick={() => quickLogin('manager@test.com')}
                  className="btn-quick-login"
                >
                  <User size={16} />
                  <div className="quick-login-text">
                    <span className="quick-login-role">Manager</span>
                    <span className="quick-login-email">manager@test.com</span>
                  </div>
                </button>
                <button
                  onClick={() => quickLogin('admin@test.com')}
                  className="btn-quick-login"
                >
                  <User size={16} />
                  <div className="quick-login-text">
                    <span className="quick-login-role">Admin</span>
                    <span className="quick-login-email">admin@test.com</span>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        <div className="login-footer">
          <p>Don't have an account? <Link to="/register" className="login-link">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;