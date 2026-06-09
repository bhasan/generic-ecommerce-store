import { useApp } from '../../../context/AppContext';
import { updatePaymentSettings } from '../../../services/paymentSettingsApi';
import PaymentSettingsSection from '../../dashboard/components/PaymentSettingsSection';

export default function WebsitePaymentSection() {
  const { paymentSettings, loadConfig, showNotification } = useApp();

  const handleSave = async (data) => {
    try {
      await updatePaymentSettings(data);
      await loadConfig();
      showNotification('Payment settings saved', 'success');
    } catch {
      showNotification('Failed to save payment settings', 'error');
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Payment Methods</h2>
      <PaymentSettingsSection paymentSettings={paymentSettings} onSave={handleSave} isLoading={false} />
    </div>
  );
}
