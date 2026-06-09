import { useApp } from '../../../context/AppContext';
import { updateOrderingConstraints } from '../../../services/orderingConstraintsApi';
import OrderingConstraintsSection from '../../dashboard/components/OrderingConstraintsSection';

export default function WebsiteDeliverySection() {
  const { minimumDeliveryOrder, minimumDeliveryOrderEnabled, deliveryDisabled, deliveryDisabledMessage, deliveryRadiusMiles, loadConfig, showNotification } = useApp();
  const orderingConstraints = { minimumDeliveryOrder, minimumDeliveryOrderEnabled, deliveryDisabled, deliveryDisabledMessage, deliveryRadiusMiles };

  const handleSave = async (data) => {
    try {
      await updateOrderingConstraints(data);
      await loadConfig();
      showNotification('Delivery settings saved', 'success');
    } catch {
      showNotification('Failed to save delivery settings', 'error');
    }
  };

  return (
    <div className="website-mgmt-section">
      <h2>Delivery Settings</h2>
      <OrderingConstraintsSection orderingConstraints={orderingConstraints} onSave={handleSave} isLoading={false} />
    </div>
  );
}
