import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { uploadFavicon } from '../../../services/brandingApi';

export default function FaviconSection({ branding, onSave }) {
  const { showNotification } = useApp();
  const [faviconUrls, setFaviconUrls] = useState(branding?.faviconUrls || { '16': '', '32': '', '180': '' });
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const { urls } = await uploadFavicon(file);
      setFaviconUrls(urls);
      onSave({ ...branding, faviconUrls: urls });
      showNotification('Favicon uploaded. Changes take effect on next page load.', 'success');
    } catch {
      showNotification('Favicon upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Favicon</h2>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        {['16', '32', '180'].map(size => (
          <div key={size} style={{ textAlign: 'center' }}>
            {faviconUrls[size]
              ? <img src={faviconUrls[size]} alt={`${size}px favicon`} style={{ width: parseInt(size), height: parseInt(size), border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }} />
              : <div style={{ width: parseInt(size), height: parseInt(size), background: 'var(--bg-secondary)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 2 }} />
            }
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{size}px</div>
          </div>
        ))}
      </div>
      <input type="file" accept="image/*" onChange={handleUpload} disabled={isUploading} />
      {isUploading && <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>Uploading...</span>}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Changes take effect on next page load.</p>
    </div>
  );
}
