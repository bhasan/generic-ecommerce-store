import React from 'react';
import ErrorMessage from './ErrorMessage';

export default function AddressForm({ address, onChange, errors, onClearError }) {
  const handleField = (field) => (e) => {
    onChange({ ...address, [field]: e.target.value });
    onClearError(field);
  };

  return (
    <div className="address-form">
      <div className="form-group">
        <label htmlFor="street">Street Address *</label>
        <input
          id="street"
          type="text"
          value={address.street}
          onChange={handleField('street')}
          placeholder="123 Main Street"
          className={`form-input ${errors.street ? 'form-error' : ''}`}
        />
        <ErrorMessage message={errors.street} />
      </div>

      <div className="form-group">
        <label htmlFor="apartment">Apartment, Suite, etc. (Optional)</label>
        <input
          id="apartment"
          type="text"
          value={address.apartment}
          onChange={(e) => {
            onChange({ ...address, apartment: e.target.value });
            onClearError('deliveryEligibility');
          }}
          placeholder="Apt 4B"
          className="form-input"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="city">City *</label>
          <input
            id="city"
            type="text"
            value={address.city}
            onChange={handleField('city')}
            placeholder="Houston"
            className={`form-input ${errors.city ? 'form-error' : ''}`}
          />
          <ErrorMessage message={errors.city} />
        </div>

        <div className="form-group form-group-state">
          <label htmlFor="state">State *</label>
          <select
            id="state"
            value={address.state}
            onChange={handleField('state')}
            className={`form-input ${errors.state ? 'form-error' : ''}`}
          >
            <option value="TX">TX</option>
          </select>
          <ErrorMessage message={errors.state} />
        </div>

        <div className="form-group form-group-zip">
          <label htmlFor="zipCode">ZIP Code *</label>
          <input
            id="zipCode"
            type="text"
            value={address.zipCode}
            onChange={handleField('zipCode')}
            placeholder="77083"
            className={`form-input ${errors.zipCode ? 'form-error' : ''}`}
          />
          <ErrorMessage message={errors.zipCode} />
        </div>
      </div>
    </div>
  );
}
