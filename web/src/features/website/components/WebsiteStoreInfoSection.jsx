import { useApp } from '../../../context/AppContext';
import { updateStoreSettings } from '../../../services/storeSettingsApi';
import StoreSettingsSection from '../../dashboard/components/StoreSettingsSection';

export default function WebsiteStoreInfoSection() {
  const { storeSettings, loadConfig, showNotification } = useApp();

  const handleSave = async (data) => {
    try {
      await updateStoreSettings(data);
      await loadConfig();
      showNotification('Store info saved', 'success');
    } catch (err) {
      showNotification(err.message || 'Failed to save store info', 'error');
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Store Info</h2>
      <StoreSettingsSection storeSettings={storeSettings} onSave={handleSave} isLoading={false} />
    </div>
  );
}
