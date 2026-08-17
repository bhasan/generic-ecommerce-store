import React from 'react';
import { User, CreditCard, Phone, MapPin } from 'lucide-react';

export default function OrderDetailCustomer({ order, canModifyOrders, deliveryAddress, deliveryCheckSummary }) {
  if (!order.user) return null;

  return (
    <div className="order-detail-customer">
      <h4 className="order-detail-block-title">
        <User size={16} />
        {canModifyOrders ? 'Customer' : 'Fulfillment Details'}
      </h4>
      <div className="order-customer-info">
        {canModifyOrders && (
          <>
            <div className="customer-info-row">
              <span className="customer-info-label">Username:</span>
              <span className="customer-info-value">{order.user.username || 'N/A'}</span>
            </div>
            <div className="customer-info-row">
              <CreditCard size={14} className="customer-info-icon" />
              <span className="customer-info-label">Payment:</span>
              <span className={`customer-info-value ${
                order.paymentMethod === 'IN_STORE' 
                  ? 'payment-store' 
                  : (order.paymentMethod === 'EXTERNAL' && order.status === 'PENDING')
                    ? 'payment-verify'
                    : (order.paymentMethod === 'STORE_CREDIT' || order.paymentMethod === 'EXTERNAL')
                      ? 'payment-paid'
                      : 'payment-none'
              }`}>
                {order.paymentMethod === 'IN_STORE' ? 'Pay In Store' :
                 (order.paymentMethod === 'EXTERNAL' && order.status === 'PENDING') ? 'Verify External Payment' :
                 (order.paymentMethod === 'EXTERNAL' ? 'External Payment (Paid)' : 
                  order.paymentMethod === 'STORE_CREDIT' ? 'Store Credit (Paid)' : 'No payment method')}
              </span>
            </div>
            {order.user.phoneNumber && (
              <div className="customer-info-row">
                <Phone size={14} className="customer-info-icon" />
                <span className="customer-info-label">Phone:</span>
                <span className="customer-info-value">{order.user.phoneNumber}</span>
              </div>
            )}
          </>
        )}
        {order.deliveryMethod === 'CURBSIDE' ? (
          <div className="customer-info-row">
            <MapPin size={14} className="customer-info-icon" />
            <span className="customer-info-label">Vehicle Info:</span>
            <span className="customer-info-value">
              {order.vehicleDescription || order.deliveryAddress?.replace(/^CURBSIDE(:\s*|\s*\|\s*|$)/i, '') || 'CURBSIDE'}
            </span>
          </div>
        ) : (
          order.deliveryMethod === 'DELIVERY' && deliveryAddress && (
            <div className="customer-info-row">
              <MapPin size={14} className="customer-info-icon" />
              <span className="customer-info-label">Address:</span>
              <span className="customer-info-value">{deliveryAddress}</span>
            </div>
          )
        )}
        {deliveryCheckSummary && canModifyOrders && (
          <div className="customer-info-row">
            <MapPin size={14} className="customer-info-icon" />
            <span className="customer-info-label">Delivery check:</span>
            <span className="customer-info-value">{deliveryCheckSummary}</span>
          </div>
        )}
      </div>
    </div>
  );
}
