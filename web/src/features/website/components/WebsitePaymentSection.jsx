import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { updatePaymentSettings } from '../../../services/paymentSettingsApi';
import PaymentSettingsSection from '../../dashboard/components/PaymentSettingsSection';

function AuthorizeNetCredentialsCard({ paymentSettings, onSave }) {
  const cc = paymentSettings?.cc_payment ?? { enabled: false, loginId: '', transactionKey: '', sandboxMode: true };
  const [enabled, setEnabled] = useState(cc.enabled);
  const [loginId, setLoginId] = useState(cc.loginId);
  const [transactionKey, setTransactionKey] = useState(cc.transactionKey);
  const [sandboxMode, setSandboxMode] = useState(cc.sandboxMode);
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...paymentSettings,
        cc_payment: { enabled, loginId, transactionKey, sandboxMode },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payment-method-card authnet-card">
      <div className="payment-method-card-header">
        <span className="payment-method-icon">💳</span>
        <div className="payment-method-info">
          <div className="payment-method-name">Credit / Debit Card (Authorize.Net)</div>
          <div className="payment-method-desc">Accept card payments via hosted payment form</div>
        </div>
        <label className="payment-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="toggle-label">{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div className="payment-credentials-toggle">
        <button
          className={`cred-expand-btn ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          🔑 API Credentials {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="payment-credentials-body">
          <p className="cred-warning">
            ⚠️ Keep these credentials private. Anyone with access can process charges on your account.
          </p>

          <div className="cred-field">
            <label htmlFor="authnet-login-id">API Login ID</label>
            <input
              id="authnet-login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Your Authorize.Net Login ID"
              maxLength={64}
              autoComplete="off"
            />
            <p className="cred-hint">Found in Authorize.Net → Account → Security Settings.</p>
          </div>

          <div className="cred-field">
            <label htmlFor="authnet-txn-key">Transaction Key</label>
            <div className="cred-input-wrap">
              <input
                id="authnet-txn-key"
                type={showKey ? 'text' : 'password'}
                value={transactionKey}
                onChange={(e) => setTransactionKey(e.target.value)}
                placeholder="Your transaction key"
                maxLength={64}
                autoComplete="off"
              />
              <button
                type="button"
                className="cred-eye-btn"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide transaction key' : 'Show transaction key'}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="cred-hint">Generate in Authorize.Net → Account → Security Settings → Transaction Key.</p>
          </div>

          <label className="cred-sandbox-row">
            <input
              type="checkbox"
              checked={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.checked)}
            />
            Sandbox / Test Mode
            <span className="cred-sandbox-hint">(Disable for live transactions)</span>
          </label>

          <button
            className="btn-primary cred-save-btn"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function WebsitePaymentSection() {
  const { paymentSettings, loadConfig, showNotification } = useApp();

  const handleSave = async (data) => {
    try {
      await updatePaymentSettings(data);
      await loadConfig();
      showNotification('Payment settings saved', 'success');
    } catch {
      showNotification('Failed to save payment settings', 'error');
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Payment Methods</h2>
      <AuthorizeNetCredentialsCard paymentSettings={paymentSettings} onSave={handleSave} />
      <PaymentSettingsSection paymentSettings={paymentSettings} onSave={handleSave} isLoading={false} />
    </div>
  );
}
