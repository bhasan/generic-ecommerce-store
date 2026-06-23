import React from 'react';
import { AlertCircle } from 'lucide-react';
import { DeliveryMethod } from '../../../constants/orderMethods';
import AddressForm from './AddressForm';
import ErrorMessage from './ErrorMessage';

export default function FulfillmentSelector({
  deliveryMethod,
  onDeliveryMethodChange,
  address,
  onAddressChange,
  vehicleDetails,
  onVehicleDetailsChange,
  errors,
  onClearAddressError,
  onClearVehicleError,
  deliveryBlocked,
  deliveryBlockedReason,
  deliveryRadiusMiles,
  deliveryAddressComplete,
  deliveryEligibility,
  pickupLocation,
}) {
  const isDelivery = deliveryMethod === DeliveryMethod.DELIVERY;
  const isPickup = !isDelivery;

  const renderEligibilityMessage = () => {
    if (!isDelivery) return null;
    if (!deliveryAddressComplete) {
      return (
        <p className="delivery-check-hint">
          Enter your full address to check whether it is within our {deliveryRadiusMiles.toFixed(2)} mile delivery area.
        </p>
      );
    }
    if (deliveryEligibility.status === 'checking') {
      return <p className="delivery-check-hint">Checking delivery eligibility for this address...</p>;
    }
    if (deliveryEligibility.status === 'error') {
      return (
        <div className="delivery-eligibility-banner delivery-eligibility-banner-warning">
          <AlertCircle size={16} />
          <span>{deliveryEligibility.error}</span>
        </div>
      );
    }
    if (!deliveryEligibility.result) return null;

    const toneClass = deliveryEligibility.result.deliverable
      ? (deliveryEligibility.result.deliverySource === 'ZIP_FALLBACK'
        ? 'delivery-eligibility-banner-fallback'
        : 'delivery-eligibility-banner-success')
      : (deliveryEligibility.result.deliveryStatus === 'UNVERIFIED'
        ? 'delivery-eligibility-banner-warning'
        : 'delivery-eligibility-banner-error');

    return (
      <div className={`delivery-eligibility-banner ${toneClass}`}>
        <AlertCircle size={16} />
        <span>{deliveryEligibility.result.message}</span>
      </div>
    );
  };

  return (
    <>
      <div className="delivery-method-toggle delivery-method-toggle-large">
        <button
          type="button"
          onClick={() => !deliveryBlocked && onDeliveryMethodChange(DeliveryMethod.DELIVERY)}
          className={`toggle-btn ${isDelivery ? 'active' : ''} ${deliveryBlocked ? 'disabled' : ''}`}
          disabled={deliveryBlocked}
          title={deliveryBlocked ? deliveryBlockedReason : undefined}
        >
          Delivery
        </button>
        <button
          type="button"
          onClick={() => onDeliveryMethodChange(DeliveryMethod.PICKUP)}
          className={`toggle-btn ${isPickup ? 'active' : ''}`}
        >
          Pick Up
        </button>
      </div>

      {deliveryBlocked && <p className="delivery-blocked-hint">{deliveryBlockedReason}</p>}

      {isDelivery ? (
        <>
          <AddressForm
            address={address}
            onChange={onAddressChange}
            errors={errors}
            onClearError={onClearAddressError}
          />
          {renderEligibilityMessage()}
          <ErrorMessage message={errors.deliveryEligibility} />
        </>
      ) : (
        <div className="pickup-location-info">
          <h4>Store Pickup Location</h4>
          <p className="pickup-address">{pickupLocation}</p>

          <div className="pickup-sub-method">
            <div className="pickup-sub-toggle">
              <button
                type="button"
                onClick={() => {
                  onDeliveryMethodChange(DeliveryMethod.PICKUP);
                  onClearVehicleError('makeModel');
                  onClearVehicleError('color');
                }}
                className={`pickup-sub-btn ${deliveryMethod === DeliveryMethod.PICKUP ? 'active' : ''}`}
              >
                In-Store Pickup
              </button>
              <button
                type="button"
                onClick={() => onDeliveryMethodChange(DeliveryMethod.CURBSIDE)}
                className={`pickup-sub-btn ${deliveryMethod === DeliveryMethod.CURBSIDE ? 'active' : ''}`}
              >
                Curbside Pickup
              </button>
            </div>
          </div>

          {deliveryMethod === DeliveryMethod.CURBSIDE ? (
            <div className="curbside-form">
              <p className="pickup-note" style={{ marginBottom: '1rem' }}>Please provide vehicle details so we can bring your order out to you.</p>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label htmlFor="vehicleMakeModel" style={{ display: 'block', textAlign: 'left', marginBottom: '0.5rem', fontWeight: 500 }}>Vehicle Make & Model *</label>
                  <input
                    id="vehicleMakeModel"
                    type="text"
                    value={vehicleDetails.makeModel}
                    onChange={(e) => {
                      onVehicleDetailsChange({ ...vehicleDetails, makeModel: e.target.value });
                      onClearVehicleError('makeModel');
                    }}
                    placeholder="e.g. Toyota Camry"
                    className={`form-input ${errors.makeModel ? 'form-error' : ''}`}
                  />
                  <ErrorMessage message={errors.makeModel} />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicleColor" style={{ display: 'block', textAlign: 'left', marginBottom: '0.5rem', fontWeight: 500 }}>Vehicle Color *</label>
                  <input
                    id="vehicleColor"
                    type="text"
                    value={vehicleDetails.color}
                    onChange={(e) => {
                      onVehicleDetailsChange({ ...vehicleDetails, color: e.target.value });
                      onClearVehicleError('color');
                    }}
                    placeholder="e.g. Silver"
                    className={`form-input ${errors.color ? 'form-error' : ''}`}
                  />
                  <ErrorMessage message={errors.color} />
                </div>
              </div>
            </div>
          ) : (
            <p className="pickup-note">We&rsquo;ll email you when your order is ready for pickup.</p>
          )}
        </div>
      )}
    </>
  );
}
