import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { updateBranding } from '../../../services/brandingApi';
import { uploadFile } from '../../../services/uploadApi';

export default function HeroImageSection({ branding, onSave }) {
  const { showNotification } = useApp();
  const [heroImageUrl, setHeroImageUrl] = useState(branding?.heroImageUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      setHeroImageUrl(result.url);
    } catch {
      showNotification('Upload failed', 'error');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { branding: updated } = await updateBranding({ heroImageUrl });
      onSave(updated);
      showNotification('Hero image saved', 'success');
    } catch {
      showNotification('Failed to save hero image', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Hero Image</h2>
      {heroImageUrl && (
        <img src={heroImageUrl} alt="Hero preview" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'block' }} />
      )}
      <div className="form-group">
        <label>Upload image</label>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>
      <div className="form-group">
        <label>Or paste URL</label>
        <input type="text" value={heroImageUrl} onChange={e => setHeroImageUrl(e.target.value)} placeholder="https://..." />
      </div>
      <button className="save-btn" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Hero Image'}
      </button>
    </div>
  );
}
