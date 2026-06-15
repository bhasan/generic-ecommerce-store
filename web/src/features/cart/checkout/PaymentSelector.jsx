import React from 'react';
import * as LucideIcons from 'lucide-react';
import { paymentRegistry } from './paymentRegistry';
import ErrorMessage from './ErrorMessage';

export default function PaymentSelector({ ctx, selected, onChange, errors }) {
  const available = paymentRegistry.filter(e => e.isAvailable(ctx));

  return (
    <div className="form-group">
      <label className="payment-method-select-label">Payment Method</label>
      <div className="payment-method-options">
        {available.map((entry) => {
          const Icon = LucideIcons[entry.iconName];
          const badge = entry.badge ? entry.badge(ctx) : null;
          const isSelected = selected === entry.method;
          return (
            <label
              key={entry.method}
              className={`payment-method-option payment-method-card ${isSelected ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={entry.method}
                checked={isSelected}
                onChange={() => onChange(entry.method)}
              />
              <span className="payment-method-card-label">
                {Icon && <Icon size={16} />} {entry.label}
              </span>
              {badge && <span className="payment-method-badge">{badge}</span>}
            </label>
          );
        })}
      </div>
      <ErrorMessage message={errors.credit} />
    </div>
  );
}
