import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { updateBranding } from '../../../services/brandingApi';
import { applyBrandingTokens } from '../../../utils/colorUtils';
import { COLOR_PALETTES } from '../../../utils/colorPalettes';

export default function BrandColorsSection({ branding, onSave }) {
  const { showNotification } = useApp();
  const [selectedSlug, setSelectedSlug] = useState(branding?.palette || 'purple-dark');
  const [primaryHex, setPrimaryHex] = useState('');
  const [secondaryHex, setSecondaryHex] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const savedTokens = branding?.customColors;

  const isCustom = selectedSlug === 'custom';

  const handlePreview = () => {
    if (isCustom) {
      const tokens = {};
      if (/^#[0-9a-f]{6}$/i.test(primaryHex)) Object.assign(tokens, { primary: primaryHex });
      if (/^#[0-9a-f]{6}$/i.test(secondaryHex)) Object.assign(tokens, { secondary: secondaryHex });
      applyBrandingTokens(tokens);
    } else {
      const palette = COLOR_PALETTES.find(p => p.slug === selectedSlug);
      if (palette?.tokens) applyBrandingTokens(palette.tokens);
    }
  };

  const handleResetPreview = () => {
    applyBrandingTokens(savedTokens);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let payload;
      if (isCustom) {
        payload = {
          palette: 'custom',
          customColors: {
            primary: primaryHex || savedTokens?.primary || '',
            secondary: secondaryHex || savedTokens?.secondary || '',
          },
        };
      } else {
        const palette = COLOR_PALETTES.find(p => p.slug === selectedSlug);
        payload = { palette: selectedSlug, customColors: palette?.tokens || null };
      }
      const { branding: updated } = await updateBranding(payload);
      onSave(updated);
      showNotification('Colors saved', 'success');
    } catch {
      showNotification('Failed to save colors', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Brand Colors</h2>
      <div className="palette-grid">
        {COLOR_PALETTES.map(p => (
          <div
            key={p.slug}
            className={`palette-swatch${selectedSlug === p.slug ? ' selected' : ''}`}
            onClick={() => setSelectedSlug(p.slug)}
          >
            {p.preview && <span className="palette-dot" style={{ background: p.preview }} />}
            <span>{p.name}</span>
          </div>
        ))}
      </div>
      {isCustom && (
        <div>
          <div className="form-group">
            <label>Primary Color (hex, e.g. #2563eb)</label>
            <input type="text" value={primaryHex} onChange={e => setPrimaryHex(e.target.value)} placeholder="#000000" maxLength={7} />
          </div>
          <div className="form-group">
            <label>Secondary Color (hex, e.g. #059669)</label>
            <input type="text" value={secondaryHex} onChange={e => setSecondaryHex(e.target.value)} placeholder="#000000" maxLength={7} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="save-btn save-btn-ghost" onClick={handlePreview}>Apply Preview</button>
        <button type="button" className="save-btn save-btn-ghost" onClick={handleResetPreview}>Reset Preview</button>
        <button className="save-btn" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Colors'}
        </button>
      </div>
    </div>
  );
}
