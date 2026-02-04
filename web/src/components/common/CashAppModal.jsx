import React, { useState } from 'react';
import { DollarSign, X, AlertCircle } from 'lucide-react';
import './CashAppModal.css';

function CashAppModal({ 
  isOpen, 
  onClose, 
  onSave, 
  isLoading = false 
}) {
  const [cashapp, setCashapp] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    let value = e.target.value;
    // Auto-add $ if not present
    if (value && !value.startsWith('$')) {
      value = '$' + value;
    }
    setCashapp(value);
    setError('');
  };

  const validateCashApp = () => {
    if (!cashapp.trim()) {
      setError('CashApp username is required');
      return false;
    }
    if (!cashapp.startsWith('$')) {
      setError('CashApp username must start with $');
      return false;
    }
    if (cashapp.length < 2 || cashapp.length > 21) {
      setError('CashApp username must be between 1-20 characters (excluding $)');
      return false;
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateCashApp()) {
      onSave(cashapp);
    }
  };

  return (
    <div className="cashapp-modal-overlay" onClick={onClose}>
      <div className="cashapp-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="cashapp-modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="cashapp-modal-content">
          <div className="cashapp-modal-icon-wrapper">
            <DollarSign size={48} className="cashapp-modal-icon" />
          </div>
          
          <h2 className="cashapp-modal-title">Add Payment Method</h2>
          
          <div className="cashapp-modal-message">
            <p>Please enter your CashApp username to continue with checkout. This is required for payment processing.</p>
          </div>

          <form onSubmit={handleSubmit} className="cashapp-modal-form">
            <div className="cashapp-form-group">
              <label htmlFor="cashapp-input" className="cashapp-form-label">
                CashApp Username
              </label>
              <input
                id="cashapp-input"
                type="text"
                value={cashapp}
                onChange={handleChange}
                className={`cashapp-form-input ${error ? 'cashapp-input-error' : ''}`}
                placeholder="$YourCashApp"
                autoFocus
              />
              {error && (
                <span className="cashapp-error-message">
                  <AlertCircle size={14} />
                  {error}
                </span>
              )}
            </div>

            <div className="cashapp-modal-actions">
              <button 
                type="button"
                className="btn-cashapp-cancel" 
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="btn-cashapp-save"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CashAppModal;
