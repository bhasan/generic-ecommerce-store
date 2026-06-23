import React, { useState, useEffect } from 'react';
import { CreditCard, Save } from 'lucide-react';
import './PaymentSettingsSection.css';

const DEFAULT_SETTINGS = {
  cashapp: { enabled: true, handle: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
};

const METHOD_CONFIG = {
  cashapp: {
    label: 'CashApp',
    handleLabel: 'CashApp Handle',
    placeholder: '$SmokeStationX',
    hint: 'Handle must start with $  (e.g. $SmokeStationX)',
  },
  zelle: {
    label: 'Zelle',
    handleLabel: 'Zelle Phone or Email',
    placeholder: '555-123-4567 or store@example.com',
    hint: 'Enter the phone number or email address linked to Zelle',
  },
  venmo: {
    label: 'Venmo',
    handleLabel: 'Venmo Handle',
    placeholder: '@SmokeStation',
    hint: "Enter the store's Venmo handle",
  },
};

function validate(draft) {
  const errors = {};
  for (const method of Object.keys(METHOD_CONFIG)) {
    const entry = draft[method];
    if (!entry?.enabled) continue;
    const handle = entry.handle?.trim() ?? '';
    if (!handle) {
      errors[method] = `${METHOD_CONFIG[method].label} handle is required`;
    } else if (method === 'cashapp' && !handle.startsWith('$')) {
      errors[method] = 'CashApp handle must start with $';
    }
  }
  return errors;
}

function PaymentSettingsSection({ isLoading, paymentSettings, onSave }) {
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (paymentSettings) {
      setDraft(paymentSettings);
    }
  }, [paymentSettings]);

  const handleToggle = (method) => {
    setDraft((prev) => ({
      ...prev,
      [method]: { ...prev[method], enabled: !prev[method].enabled },
    }));
  };

  const handleHandle = (method, value) => {
    setDraft((prev) => ({
      ...prev,
      [method]: { ...prev[method], handle: value },
    }));
    if (errors[method]) {
      setErrors((prev) => { const next = { ...prev }; delete next[method]; return next; });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate(draft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-content-section surface-card">
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading payment settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <CreditCard size={24} />
          Payment Settings
        </h3>
      </div>

      <p className="payment-settings-description">
        Enable or disable payment methods and configure the store's handles. Only enabled methods
        will be shown to customers during registration and checkout.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="payment-method-list">
          {Object.entries(METHOD_CONFIG).map(([method, config]) => {
            const entry = draft[method] || { enabled: false, handle: '' };
            return (
              <div
                key={method}
                className={`payment-method-card${entry.enabled ? ' enabled' : ''}`}
              >
                <div className={`payment-method-card-header${entry.enabled ? ' expanded' : ''}`}>
                  <span className="payment-method-card-label">{config.label}</span>
                  <label className="payment-method-toggle">
                    <span className={`payment-method-toggle-status${entry.enabled ? ' enabled' : ''}`}>
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={() => handleToggle(method)}
                      className="payment-method-toggle-checkbox"
                    />
                  </label>
                </div>

                {entry.enabled && (
                  <div className="form-group payment-method-form-group">
                    <label className="form-label" htmlFor={`handle-${method}`}>
                      {config.handleLabel}
                    </label>
                    <input
                      id={`handle-${method}`}
                      type="text"
                      className={`form-input${errors[method] ? ' form-input-error' : ''}`}
                      value={entry.handle}
                      onChange={(e) => handleHandle(method, e.target.value)}
                      placeholder={config.placeholder}
                      maxLength={64}
                    />
                    {errors[method]
                      ? <p className="form-error-message">{errors[method]}</p>
                      : <p className="form-hint">{config.hint}</p>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          className="btn-action btn-primary payment-settings-save-btn"
          disabled={isSaving}
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

export default PaymentSettingsSection;
