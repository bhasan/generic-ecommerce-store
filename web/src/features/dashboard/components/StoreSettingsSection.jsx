import React, { useState, useEffect } from 'react';
import { Store, Save } from 'lucide-react';
import './StoreSettingsSection.css';

const DEFAULT_SETTINGS = {
  name: '',
  address: '',
  phoneNumber: '',
};

function StoreSettingsSection({ isLoading, storeSettings, onSave }) {
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (storeSettings) {
      setDraft(storeSettings);
    }
  }, [storeSettings]);

  const handleChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
          <p>Loading store settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <Store size={24} />
          Store Settings
        </h3>
      </div>

      <p className="store-settings-description">
        Update the store's display name, address, and contact phone number. These are shown to
        customers during registration and checkout.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="store-settings-fields">
          <div className="form-group">
            <label className="form-label" htmlFor="store-name">
              Store Name
            </label>
            <input
              id="store-name"
              type="text"
              className="form-input"
              value={draft.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Smoke Station"
              maxLength={128}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="store-address">
              Address / Pickup Location
            </label>
            <input
              id="store-address"
              type="text"
              className="form-input"
              value={draft.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="123 Main St, City, TX 00000"
              maxLength={256}
            />
            <p className="form-hint">Shown to customers as the pickup location during checkout.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="store-phone">
              Phone Number
            </label>
            <input
              id="store-phone"
              type="text"
              className="form-input"
              value={draft.phoneNumber}
              onChange={(e) => handleChange('phoneNumber', e.target.value)}
              placeholder="(555) 123-4567"
              maxLength={32}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-action btn-primary store-settings-save-btn"
          disabled={isSaving}
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

export default StoreSettingsSection;
