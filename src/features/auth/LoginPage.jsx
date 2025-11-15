import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { LogIn, User, Lock } from 'lucide-react';

function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const success = login(email, password);
    if (success) {
      setError('');
    } else {
      setError('Invalid credentials');
    }
  };
  
  const quickLogin = (testEmail) => {
    setEmail(testEmail);
    setPassword('test');
    login(testEmail, 'test');
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

          <button type="submit" className="btn-login">
            <LogIn size={18} />
            <span>Sign In</span>
          </button>
        </form>

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

        <button
          onClick={() => navigate('/products')}
          className="btn-guest"
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

export default LoginPage;