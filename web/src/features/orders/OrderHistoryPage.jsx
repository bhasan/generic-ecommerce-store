import React, { useState, useEffect, useCallback, useRef } from 'react';
import './OrderHistoryPage.css';
import * as ordersApi from '../../services/ordersApi';
import { useApp } from '../../context/AppContext';
import { Package, History, ChevronDown } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';
import { formatDate } from '../../utils/dateUtils';

const STATUS_OPTIONS = [
  { value: 'PENDING_PAYMENT', label: 'Awaiting Payment' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'NOT_FULFILLING', label: 'Rejected' },
  { value: 'READY_FOR_DELIVERY', label: 'Ready for Delivery' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' }
];

function OrderHistoryPage() {
  const { showNotification } = useApp();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const allOrders = await ordersApi.getAllOrders();
      setOrders(allOrders);
    } catch (error) {
      showNotification(error.message || 'Failed to load orders', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatStatus = (status) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.label ?? status?.replace(/_/g, ' ') ?? '';
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter.length > 0 && !statusFilter.includes(o.status)) return false;
    const orderDate = new Date(o.createdAt);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (orderDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (orderDate > to) return false;
    }
    return true;
  });

  const itemCount = (order) => {
    return order.items?.filter((i) => !i.voided).length ?? 0;
  };

  return (
    <div className="order-history-container">
      <div className="order-history-header section-header-surface">
        <div>
          <h2 className="page-title">
            <History size={28} />
            Orders History
          </h2>
          <p className="page-subtitle">All orders with filters by date and status</p>
        </div>
      </div>
      <HeaderDivider />

      <div className="order-history-filters">
        <div className="filter-group filter-group-status" ref={statusDropdownRef}>
          <label>Status</label>
          <div className="status-multiselect">
            <button
              type="button"
              className="status-multiselect-trigger"
              onClick={() => setStatusDropdownOpen((o) => !o)}
              aria-expanded={statusDropdownOpen}
              aria-haspopup="listbox"
            >
              <span>
                {statusFilter.length === 0
                  ? 'All Statuses'
                  : statusFilter.length === STATUS_OPTIONS.length
                    ? 'All Statuses'
                    : `${statusFilter.length} selected`}
              </span>
              <ChevronDown size={18} className={statusDropdownOpen ? 'chevron-open' : ''} />
            </button>
            {statusDropdownOpen && (
              <div className="status-multiselect-dropdown" role="listbox">
                <label className="status-multiselect-option">
                  <input
                    type="checkbox"
                    checked={statusFilter.length === 0}
                    onChange={() => setStatusFilter([])}
                  />
                  <span>All Statuses</span>
                </label>
                {STATUS_OPTIONS.map((opt) => (
                  <label key={opt.value} className="status-multiselect-option">
                    <input
                      type="checkbox"
                      checked={statusFilter.includes(opt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setStatusFilter((prev) => (prev.length === STATUS_OPTIONS.length - 1 ? [] : [...prev, opt.value]));
                        } else {
                          setStatusFilter((prev) => prev.filter((v) => v !== opt.value));
                        }
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-date-from">From Date</label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-date-to">To Date</label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="filter-input"
          />
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="btn-refresh-orders"
          disabled={isLoading}
          title="Refresh"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Package size={64} className="empty-icon" />
          <p>Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">
          <Package size={64} className="empty-icon" />
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="order-history-table-wrapper">
          <table className="order-history-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Phone</th>
                <th>CashApp</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td className="cell-id">#{order.id}</td>
                  <td className="cell-date">{formatDate(order.createdAt)}</td>
                  <td className="cell-phone">{order.user?.phoneNumber ?? '—'}</td>
                  <td className="cell-cashapp">{order.user?.cashapp ?? '—'}</td>
                  <td>
                    <span className={`status-badge status-${order.status?.toLowerCase().replace(/_/g, '-')}`}>
                      {formatStatus(order.status)}
                    </span>
                  </td>
                  <td className="cell-items">{itemCount(order)}</td>
                  <td className="cell-total">{formatCurrency(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filteredOrders.length > 0 && (
        <p className="order-history-count">
          Showing {filteredOrders.length} of {orders.length} orders
        </p>
      )}
    </div>
  );
}

export default OrderHistoryPage;
