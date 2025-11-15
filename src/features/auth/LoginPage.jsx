import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

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

  // ... (rest of your LoginPage JSX)
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-96 border border-gray-700">
        <h1 className="text-3xl font-bold text-center mb-6 text-purple-700">Login</h1>
        <div onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-700 text-white"
              placeholder="Enter your email"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-700 text-white"
              placeholder="Enter your password"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            className="w-full bg-purple-800 text-white py-2 rounded-md hover:bg-purple-900 transition-colors font-medium"
          >
            Login
          </button>
        </div>
        <div className="mt-6 text-sm text-gray-400">
          <p className="font-semibold mb-2">Quick Login:</p>
          <div className="space-y-2">
            <button
              onClick={() => quickLogin('customer@test.com')}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-md transition-colors"
            >
              Login as Customer
            </button>
            <button
              onClick={() => quickLogin('manager@test.com')}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-md transition-colors"
            >
              Login as Manager
            </button>
            <button
              onClick={() => quickLogin('admin@test.com')}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-md transition-colors"
            >
              Login as Admin
            </button>
          </div>
        </div>
        <button
          onClick={() => navigate('/products')}
          className="w-full mt-4 text-gray-400 hover:text-purple-700 text-sm"
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

export default LoginPage;