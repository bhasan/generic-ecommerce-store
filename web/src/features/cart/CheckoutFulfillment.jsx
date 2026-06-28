import React from 'react';
import { MapPin } from 'lucide-react';
import FulfillmentSelector from './checkout/FulfillmentSelector';

export default function CheckoutFulfillment({
  deliveryMethod,
  setDeliveryMethod,
  address,
  setAddress,
  vehicleDetails,
  setVehicleDetails,
  errors,
  clearAddressError,
  clearVehicleError,
  deliveryBlocked,
  deliveryBlockedReason,
  deliveryRadiusMiles,
  deliveryAddressComplete,
  deliveryEligibility,
  pickupLocation
}) {
  return (
    <div className="checkout-section surface-card">
      <div className="section-header">
        <MapPin size={20} />
        <h3>Delivery Method</h3>
      </div>
      <FulfillmentSelector
        deliveryMethod={deliveryMethod}
        onDeliveryMethodChange={setDeliveryMethod}
        address={address}
        onAddressChange={setAddress}
        vehicleDetails={vehicleDetails}
        onVehicleDetailsChange={setVehicleDetails}
        errors={errors}
        onClearAddressError={clearAddressError}
        onClearVehicleError={clearVehicleError}
        deliveryBlocked={deliveryBlocked}
        deliveryBlockedReason={deliveryBlockedReason}
        deliveryRadiusMiles={deliveryRadiusMiles}
        deliveryAddressComplete={deliveryAddressComplete}
        deliveryEligibility={deliveryEligibility}
        pickupLocation={pickupLocation}
      />
    </div>
  );
}
