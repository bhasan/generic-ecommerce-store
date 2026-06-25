import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getBranding } from '../../services/brandingApi';
import PageHeader from '../../components/common/PageHeader';
import StoreIdentitySection from './components/StoreIdentitySection';
import BrandColorsSection from './components/BrandColorsSection';
import HeroImageSection from './components/HeroImageSection';
import FaviconSection from './components/FaviconSection';
import WebsiteStoreInfoSection from './components/WebsiteStoreInfoSection';
import WebsitePaymentSection from './components/WebsitePaymentSection';
import WebsiteDeliverySection from './components/WebsiteDeliverySection';
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
    <div className="website-mgmt-page">
      <PageHeader
        title="Website Management"
        subtitle="Branding, appearance, and website settings"
        icon={Globe}
      />
      <StoreIdentitySection branding={branding} onSave={handleBrandingUpdate} />
      <BrandColorsSection branding={branding} onSave={handleBrandingUpdate} />
      <HeroImageSection branding={branding} onSave={handleBrandingUpdate} />
      <FaviconSection branding={branding} onSave={handleBrandingUpdate} />
      <WebsiteStoreInfoSection />
      <WebsitePaymentSection />
      <WebsiteDeliverySection />
    </div>
  );
}
