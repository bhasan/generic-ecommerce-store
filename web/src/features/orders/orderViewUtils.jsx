import React from 'react';
import {
  Check,
  CheckCircle,
  Clock,
  Package,
  Truck,
  XCircle,
} from 'lucide-react';
import { OrderStatus } from '../../constants/orderStatuses';

export const FILTER_STATUSES = Object.values(OrderStatus);

export const DEFAULT_SELECTED_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.APPROVED,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.ARRIVED,
];

export const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Prep Order',
  NOT_FULFILLING: 'Reject Order (Invalid Payment)',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  OUT_FOR_DELIVERY: 'In Delivery',
  DELIVERED: 'Delivered',
  READY_FOR_PICKUP: 'Ready for Pickup',
  ARRIVED: 'Customer Arrived',
  PICKED_UP: 'Picked Up',
};

export const COLUMN_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Prep Orders',
  NOT_FULFILLING: 'Rejected (Invalid Payment)',
  READY_FOR_DELIVERY: 'Awaiting Delivery Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  READY_FOR_PICKUP: 'Ready for Pickup',
  ARRIVED: 'Customer Arrived',
  PICKED_UP: 'Picked Up',
};

export const formatOrderDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? dateString
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const getProductName = (item) => item?.productName ?? 'Unknown Product';

export const getStatusLabel = (status) => STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

export const getStatusIcon = (status) => {
  switch (status) {
    case 'PENDING': return <Clock size={18} />;
    case 'APPROVED': return <Check size={18} />;
    case 'NOT_FULFILLING': return <XCircle size={18} />;
    case 'READY_FOR_DELIVERY': return <Package size={18} />;
    case 'READY_FOR_PICKUP': return <Package size={18} />;
    case 'ARRIVED': return <Package size={18} />;
    case 'OUT_FOR_DELIVERY': return <Truck size={18} />;
    case 'DELIVERED': return <CheckCircle size={18} />;
    case 'PICKED_UP': return <CheckCircle size={18} />;
    default: return <Clock size={18} />;
  }
};

export const getStatusClass = (status) => {
  const map = {
    PENDING: 'status-pending',
    APPROVED: 'status-approved',
    NOT_FULFILLING: 'status-not-fulfilling',
    READY_FOR_DELIVERY: 'status-ready',
    READY_FOR_PICKUP: 'status-ready',
    ARRIVED: 'status-arrived',
    OUT_FOR_DELIVERY: 'status-out-for-delivery',
    DELIVERED: 'status-delivered',
    PICKED_UP: 'status-picked-up',
  };
  return map[status] || 'status-pending';
};
