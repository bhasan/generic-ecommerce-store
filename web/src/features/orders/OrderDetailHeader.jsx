import React from 'react';
import { formatPrice } from '../../utils/currencyUtils';

export default function OrderDetailHeader({ order, formatOrderDate }) {
  return (
    <div className="order-detail-meta">
      <span className="order-detail-date">{formatOrderDate(order.createdAt)}</span>
      <span className={`order-detail-method-badge ${order.deliveryMethod === 'DELIVERY' ? 'method-delivery' : 'method-pickup'}`}>
        {order.deliveryMethod === 'CURBSIDE' ? 'Curbside Pickup' : order.deliveryMethod === 'PICKUP' ? 'Pickup' : 'Delivery'}
      </span>
      <span className="order-detail-total">{formatPrice(order.total)}</span>
    </div>
  );
}
