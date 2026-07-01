import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { getBranding } from '../../services/brandingApi';
import PageHeader from '../../components/common/PageHeader';
import WebsiteManagementSidebar from './components/WebsiteManagementSidebar';
import './WebsiteManagementPage.css';

export default function WebsiteManagementPage() {
  const { showNotification, loadConfig } = useApp();
  const [branding, setBranding] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getBranding()
      .then(setBranding)
      .catch(() => showNotification('Failed to load branding settings', 'error'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="website-mgmt-loading">Loading...</div>;

  const handleBrandingUpdate = (updated) => {
    setBranding(updated);
    loadConfig();
  };

  return (
    <div className="dashboard-grid-container">
      <PageHeader
        title="Website Management"
        subtitle="Branding, appearance, and website settings"
        icon={Globe}
      />
      <div className="dashboard-grid-layout">
        <WebsiteManagementSidebar />
        <main className="dashboard-grid-content">
          <Outlet context={{ branding, onSave: handleBrandingUpdate }} />
        </main>
      </div>
    </div>
  );
}
