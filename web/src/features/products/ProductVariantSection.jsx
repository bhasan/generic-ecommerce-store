import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { formatPrice } from '../../utils/currencyUtils';

function VariantRow({ variant, index, isOnly, onChange, onRemove, onToggleDefault }) {
  const [expanded, setExpanded] = useState(false);

  const updateField = (field, value) => onChange(index, { ...variant, [field]: value });

  const addQuantityOption = () => onChange(index, { ...variant, quantityOptions: [...variant.quantityOptions, { quantity: '' }] });
  const removeQuantityOption = (i) => onChange(index, { ...variant, quantityOptions: variant.quantityOptions.filter((_, j) => j !== i) });
  const updateQuantityOption = (i, val) => {
    const opts = [...variant.quantityOptions];
    opts[i] = { ...opts[i], quantity: val };
    onChange(index, { ...variant, quantityOptions: opts });
  };

  const addPriceBreak = () => onChange(index, { ...variant, priceBreaks: [...variant.priceBreaks, { minQuantity: '', unitPrice: '' }] });
  const removePriceBreak = (i) => onChange(index, { ...variant, priceBreaks: variant.priceBreaks.filter((_, j) => j !== i) });
  const updatePriceBreak = (i, field, val) => {
    const pbs = [...variant.priceBreaks];
    pbs[i] = { ...pbs[i], [field]: val };
    onChange(index, { ...variant, priceBreaks: pbs });
  };

  return (
    <div className="variant-row surface-card" style={{ padding: '1rem', marginBottom: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 140px 110px 100px', gap: '0.625rem', alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Label *</label>
          <input type="text" value={variant.label} onChange={(e) => updateField('label', e.target.value)} className="form-input" placeholder="e.g. Default, 1g, Small" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>SKU</label>
          <input type="text" value={variant.sku ?? ''} onChange={(e) => updateField('sku', e.target.value)} className="form-input" placeholder="e.g. PROD-001" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Pricing Mode</label>
          <select value={variant.pricingMode ?? 'UNIT'} onChange={(e) => updateField('pricingMode', e.target.value)} className="form-select">
            <option value="UNIT">Unit</option>
            <option value="WEIGHT">Weight</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Base Price ($) *</label>
          <input type="number" step="0.01" min="0" value={variant.basePrice} onChange={(e) => updateField('basePrice', e.target.value)} className="form-input" placeholder="0.00" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Stock</label>
          <input type="number" min="0" step="any" value={variant.stock} onChange={(e) => updateField('stock', e.target.value)} className="form-input" placeholder="0" disabled={!variant.stockEnabled} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.625rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="radio" name="defaultVariant" checked={!!variant.isDefault} onChange={() => onToggleDefault(index)} />
          <span>Default</span>
        </label>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={variant.stockEnabled} onChange={(e) => updateField('stockEnabled', e.target.checked)} />
          <span>Track Stock</span>
        </label>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={variant.active !== false} onChange={(e) => updateField('active', e.target.checked)} />
          <span>Active</span>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
          <button type="button" onClick={() => setExpanded(x => !x)} className="btn-secondary btn-sm" title="Quantity options / price breaks">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Options</span>
          </button>
          {!isOnly && (
            <button type="button" onClick={() => onRemove(index)} className="btn-delete" title="Remove variant"><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Quantity Options (WEIGHT mode)</label>
              <button type="button" onClick={addQuantityOption} className="btn-secondary btn-sm"><Plus size={12} /> Add</button>
            </div>
            {variant.quantityOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input type="number" min="0" step="any" value={opt.quantity} onChange={(e) => updateQuantityOption(i, e.target.value)} className="form-input" placeholder="e.g. 0.5" style={{ flex: 1 }} />
                <button type="button" onClick={() => removeQuantityOption(i)} className="btn-remove-image"><X size={14} /></button>
              </div>
            ))}
            {variant.quantityOptions.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No quantity options</p>}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Price Breaks</label>
              <button type="button" onClick={addPriceBreak} className="btn-secondary btn-sm"><Plus size={12} /> Add</button>
            </div>
            {variant.priceBreaks.map((pb, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                <input type="number" min="0" step="any" value={pb.minQuantity} onChange={(e) => updatePriceBreak(i, 'minQuantity', e.target.value)} className="form-input" placeholder="Min qty" style={{ flex: 1 }} />
                <span style={{ flexShrink: 0, fontSize: '0.8rem' }}>→ $</span>
                <input type="number" min="0" step="0.01" value={pb.unitPrice} onChange={(e) => updatePriceBreak(i, 'unitPrice', e.target.value)} className="form-input" placeholder="Unit price" style={{ flex: 1 }} />
                <button type="button" onClick={() => removePriceBreak(i)} className="btn-remove-image"><X size={14} /></button>
              </div>
            ))}
            {variant.priceBreaks.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No price breaks</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductVariantSection({
  variants,
  formErrors,
  addVariant,
  updateVariant,
  removeVariant,
  toggleDefault
}) {
  return (
    <div className="form-group form-group-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label style={{ marginBottom: 0 }}>Variants *</label>
        <button type="button" onClick={addVariant} className="btn-secondary btn-sm">
          <Plus size={14} /><span>Add Variant</span>
        </button>
      </div>
      {formErrors.variants && <span className="form-error-message" role="alert">{formErrors.variants}</span>}
      {variants.map((variant, index) => (
        <VariantRow
          key={index}
          variant={variant}
          index={index}
          isOnly={variants.length === 1}
          onChange={updateVariant}
          onRemove={removeVariant}
          onToggleDefault={toggleDefault}
        />
      ))}
      {variants.length === 0 && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Add at least one variant.</p>
      )}
    </div>
  );
}
