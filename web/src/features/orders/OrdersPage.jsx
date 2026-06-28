import React from 'react';
import './OrdersPage.css';
import { useApp } from '../../context/AppContext';
import { hasRole, ROLES } from '../../utils/roles';
import AdminOrdersView from './AdminOrdersView';
import CustomerOrdersView from './CustomerOrdersView';

function OrdersPage({ forceCustomerView = false }) {
  const { currentUser } = useApp();

  const isCustomerOnly =
    forceCustomerView || (
      hasRole(currentUser, ROLES.CUSTOMER) &&
      !hasRole(currentUser, ROLES.EMPLOYEE) &&
      !hasRole(currentUser, ROLES.MANAGEMENT) &&
      !hasRole(currentUser, ROLES.ADMIN)
    );

  if (isCustomerOnly) {
    return <CustomerOrdersView />;
  }

  return <AdminOrdersView />;
}

export default OrdersPage;
