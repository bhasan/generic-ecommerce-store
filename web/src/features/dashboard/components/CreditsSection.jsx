import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Search, Users } from 'lucide-react';
import * as usersApi from '../../../services/usersApi';
import CreditModal from './CreditModal';
import './CreditsSection.css';

function CreditsSection({ showNotification }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [search, setSearch] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await usersApi.getAllUsers();
      setUsers(data.filter(u => u.approved));
    } catch (error) {
      showNotification(error.message || 'Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreditAdded = (userId, newBalance) => {
    showNotification(`Balance updated. New balance: $${newBalance.toFixed(2)}`, 'success');
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, storeCreditBalance: newBalance } : u
    ));
    setSelectedUser(prev => prev?.id === userId ? { ...prev, storeCreditBalance: newBalance } : prev);
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const totalCredit = users.reduce((sum, u) => sum + (u.storeCreditBalance || 0), 0);

  const getInitials = (username) => username.slice(0, 2).toUpperCase();

  if (isLoading) {
    return (
      <div className="dashboard-content-section surface-card">
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-content-section surface-card">
        {/* Header */}
        <div className="section-header-with-action">
          <h3 className="section-title">
            <Wallet size={24} />
            Store Credit
          </h3>
          <div className="credits-total-badge">
            <span className="credits-total-label">Total in circulation</span>
            <span className="credits-total-amount">${totalCredit.toFixed(2)}</span>
          </div>
        </div>

        {/* Search */}
        <div className="credits-search-row">
          <div className="credits-search-wrap">
            <Search size={15} className="credits-search-icon" />
            <input
              type="text"
              placeholder="Search by username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="credits-search-input"
            />
          </div>
          <span className="credits-count">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Users size={48} className="empty-icon" />
            <p>{search ? 'No users match your search.' : 'No approved users found.'}</p>
          </div>
        ) : (
          <div className="credits-table-container">
            <table className="credits-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => {
                  const balance = typeof user.storeCreditBalance === 'number' ? user.storeCreditBalance : 0;
                  return (
                    <tr key={user.id} className="credits-table-row">
                      <td>
                        <div className="credits-user-cell">
                          <div className="credits-avatar">{getInitials(user.username)}</div>
                          <span className="credits-username">{user.username}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`credits-balance-badge ${balance > 0 ? 'credits-balance-positive' : 'credits-balance-zero'}`}>
                          ${balance.toFixed(2)}
                        </span>
                      </td>
                      <td className="credits-actions-cell">
                        <button
                          className="btn-action credits-manage-btn"
                          onClick={() => setSelectedUser(user)}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <CreditModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onCreditAdded={handleCreditAdded}
        />
      )}
    </>
  );
}

export default CreditsSection;
