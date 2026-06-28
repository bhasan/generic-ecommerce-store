import React from 'react';
import './OrderStatusStepper.css';

const DELIVERY_STEPS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Preparing' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'DELIVERED', label: 'Delivered' }
];

const PICKUP_STEPS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Preparing' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
  { key: 'ARRIVED', label: 'Arrived' },
  { key: 'PICKED_UP', label: 'Picked Up' }
];

const DELIVERY_STATUS_INDEX = {
  PENDING: 0,
  APPROVED: 1,
  READY_FOR_DELIVERY: 2,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3
};

const PICKUP_STATUS_INDEX = {
  PENDING: 0,
  APPROVED: 1,
  READY_FOR_PICKUP: 2,
  ARRIVED: 3,
  PICKED_UP: 4
};

function OrderStatusStepper({ status, deliveryMethod }) {
  const isPickup = deliveryMethod === 'PICKUP' || deliveryMethod === 'CURBSIDE';
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
  const indexMap = isPickup ? PICKUP_STATUS_INDEX : DELIVERY_STATUS_INDEX;
  const activeIndex = indexMap[status] ?? 0;

  return (
    <div className="order-status-stepper">
      {steps.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={step.key}>
            <div className={`stepper-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
              <div className="stepper-dot">
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="stepper-label">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`stepper-line ${i < activeIndex ? 'done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default OrderStatusStepper;
