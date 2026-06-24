import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as landingPageSettingsApi from '../../../services/landingPageSettingsApi';
import LandingPageSection from '../components/LandingPageSection';

function LandingPageSettingsPage() {
  const { showNotification, loadConfig } = useApp();
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setSettings(await landingPageSettingsApi.getLandingPageSettings());
    } catch (error) {
      showNotification(error.message || 'Failed to load landing page settings', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      await landingPageSettingsApi.updateLandingPageSettings(data);
      showNotification('Landing page settings updated successfully', 'success');
      loadConfig();
    } catch (error) {
      showNotification(error.message || 'Failed to save landing page settings', 'error');
    }
  };

  return (
    <LandingPageSection
      isLoading={isLoading}
      landingPageSettings={settings}
      onSave={handleSave}
    />
  );
}

export default LandingPageSettingsPage;
