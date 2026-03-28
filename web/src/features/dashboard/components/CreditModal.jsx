import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Wallet } from 'lucide-react';
import * as creditApi from '../../../services/creditApi';
import './CreditModal.css';

function CreditModal({ user, onClose, onCreditAdded }) {
  const [addAmount, setAddAmount] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addError, setAddError] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');
  const [removeNote, setRemoveNote] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTx, setIsLoadingTx] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoadingTx(true);
      try {
        const data = await creditApi.getCreditTransactions(user.id);
        setTransactions(data);
      } catch {
        // Non-fatal
      } finally {
        setIsLoadingTx(false);
      }
    };
    load();
  }, [user.id]);

  const refreshTransactions = async () => {
    const data = await creditApi.getCreditTransactions(user.id);
    setTransactions(data);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(addAmount);
    if (!parsed || parsed <= 0) {
      setAddError('Enter a valid amount greater than $0');
      return;
    }
    setAddError('');
    setIsSubmitting(true);
    try {
      const result = await creditApi.addCredit(user.id, parsed, addNote.trim() || undefined);
      onCreditAdded(user.id, result.newBalance);
      setAddAmount('');
      setAddNote('');
      await refreshTransactions();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(removeAmount);
    if (!parsed || parsed <= 0) {
      setRemoveError('Enter a valid amount greater than $0');
      return;
    }
    setRemoveError('');
    setIsSubmitting(true);
    try {
      const result = await creditApi.removeCredit(user.id, parsed, removeNote.trim() || undefined);
      onCreditAdded(user.id, result.newBalance);
      setRemoveAmount('');
      setRemoveNote('');
      await refreshTransactions();
    } catch (err) {
      setRemoveError(err.message || 'Failed to remove credit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getTxLabel = (type) => {
    switch (type) {
      case 'ADDED': return 'Credit Added';
      case 'USED': return 'Used for Order';
      case 'REFUNDED': return 'Refunded';
      case 'REMOVED': return 'Manually Removed';
      default: return type;
    }
  };

  const balance = typeof user.creditBalance === 'number' ? user.creditBalance : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="credit-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="credit-modal-header">
          <div className="credit-modal-title-group">
            <Wallet size={20} />
            <div>
              <h2 className="credit-modal-title">{user.username}</h2>
              <span className="credit-modal-balance">Current balance: <strong>${balance.toFixed(2)}</strong></span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="credit-modal-body">
          {/* Add / Remove forms side by side */}
          <div className="credit-modal-forms-row">
            {/* Add Credit */}
            <div className="credit-modal-form-block">
              <h3 className="credit-modal-section-title">Add Credit</h3>
              <form onSubmit={handleAdd} className="credit-modal-form">
                <div className="form-group">
                  <label htmlFor="credit-add-amount">Amount ($)</label>
                  <input
                    id="credit-add-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={addAmount}
                    onChange={(e) => { setAddAmount(e.target.value); setAddError(''); }}
                    className={`form-input${addError ? ' form-error' : ''}`}
                    autoFocus
                  />
                  {addError && <span className="error-message">{addError}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="credit-add-note">Note <span className="optional-badge">(optional)</span></label>
                  <input
                    id="credit-add-note"
                    type="text"
                    placeholder="e.g. Paid $50 cash in store"
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    className="form-input"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-action btn-primary credit-modal-submit"
                  disabled={isSubmitting}
                >
                  <Plus size={16} />
                  {isSubmitting ? 'Saving...' : 'Add Credit'}
                </button>
              </form>
            </div>

            <div className="credit-modal-forms-divider" />

            {/* Remove Credit */}
            <div className="credit-modal-form-block">
              <h3 className="credit-modal-section-title">Remove Credit</h3>
              <form onSubmit={handleRemove} className="credit-modal-form">
                <div className="form-group">
                  <label htmlFor="credit-remove-amount">Amount ($)</label>
                  <input
                    id="credit-remove-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={removeAmount}
                    onChange={(e) => { setRemoveAmount(e.target.value); setRemoveError(''); }}
                    className={`form-input${removeError ? ' form-error' : ''}`}
                  />
                  {removeError && <span className="error-message">{removeError}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="credit-remove-note">Note <span className="optional-badge">(optional)</span></label>
                  <input
                    id="credit-remove-note"
                    type="text"
                    placeholder="e.g. Correction"
                    value={removeNote}
                    onChange={(e) => setRemoveNote(e.target.value)}
                    className="form-input"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-action btn-danger credit-modal-submit"
                  disabled={isSubmitting}
                >
                  <Minus size={16} />
                  {isSubmitting ? 'Saving...' : 'Remove Credit'}
                </button>
              </form>
            </div>
          </div>

          {/* Transaction History */}
          <div className="credit-modal-history">
            <h3 className="credit-modal-section-title">Transaction History</h3>
            {isLoadingTx ? (
              <div className="credit-tx-loading">
                <div className="loading-spinner loading-spinner-sm" />
                <span>Loading...</span>
              </div>
            ) : transactions.length === 0 ? (
              <p className="credit-tx-empty">No transactions yet.</p>
            ) : (
              <div className="credit-tx-scroll">
                <table className="credits-tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Note</th>
                      <th>Added By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.createdAt)}</td>
                        <td>{getTxLabel(tx.type)}</td>
                        <td className={tx.type === 'USED' ? 'credit-tx-negative' : 'credit-tx-positive'}>
                          {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                        </td>
                        <td>{tx.note || (tx.orderId ? `Order #${tx.orderId}` : '—')}</td>
                        <td>{tx.createdByUsername ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreditModal;
