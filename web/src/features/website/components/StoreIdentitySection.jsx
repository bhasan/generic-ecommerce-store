import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { updateBranding } from '../../../services/brandingApi';
import { uploadFile } from '../../../services/uploadApi';

export default function StoreIdentitySection({ branding, onSave }) {
  const { showNotification } = useApp();
  const [storeName, setStoreName] = useState(branding?.storeName || '');
  const [tagline, setTagline] = useState(branding?.tagline || '');
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      setLogoUrl(result.url);
    } catch {
      showNotification('Logo upload failed', 'error');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { branding: updated } = await updateBranding({ storeName, tagline, logoUrl });
      onSave(updated);
      showNotification('Identity saved', 'success');
    } catch {
      showNotification('Failed to save identity', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Store Identity</h2>
      <div className="form-group">
        <label>Store Name</label>
        <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} maxLength={128} />
      </div>
      <div className="form-group">
        <label>Tagline</label>
        <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} maxLength={256} />
      </div>
      <div className="form-group">
        <label>Logo</label>
        {logoUrl && <img src={logoUrl} alt="Logo preview" style={{ height: 48, marginBottom: '0.5rem', display: 'block' }} />}
        <input type="file" accept="image/*" onChange={handleLogoUpload} />
        {logoUrl && <button type="button" onClick={() => setLogoUrl('')} style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>Remove</button>}
      </div>
      <button className="save-btn" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Identity'}
      </button>
    </div>
  );
}
