import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as usersApi from '../../../services/usersApi';
import * as productsApi from '../../../services/productsApi';
import { ROLES } from '../../../utils/roles';
import VIPManagementSection from '../components/VIPManagementSection';

function VIPManagementPage() {
  const { showNotification } = useApp();
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [usersData, productsData] = await Promise.all([
        usersApi.getAllUsers(),
        productsApi.getAllProducts(),
      ]);
      setUsers(usersData);
      setProducts(productsData);
    } catch (error) {
      showNotification(error.message || 'Failed to load VIP data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  const handleToggleVipUser = async (user) => {
    const currentRoles = user.roles
      ? user.roles.map(r => (typeof r === 'string' ? r : r.name))
      : [];
    const isVip = currentRoles.includes(ROLES.VIP);
    const newRoles = isVip
      ? currentRoles.filter(r => r !== ROLES.VIP)
      : [...currentRoles, ROLES.VIP];

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, roles: newRoles } : u));

    try {
      await usersApi.updateUser(user.id, { roles: newRoles });
      showNotification(
        isVip ? `VIP access removed from ${user.username}` : `${user.username} is now VIP`,
        'success'
      );
    } catch (error) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, roles: currentRoles } : u));
      showNotification(error.message || 'Failed to update VIP status', 'error');
    }
  };

  const handleToggleVipProduct = async (product) => {
    const newVipOnly = !product.vipOnly;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, vipOnly: newVipOnly } : p));

    try {
      await productsApi.updateProduct(product.id, { vipOnly: newVipOnly });
      showNotification(
        product.vipOnly ? `"${product.name}" is no longer VIP-only` : `"${product.name}" is now VIP-only`,
        'success'
      );
    } catch (error) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, vipOnly: product.vipOnly } : p));
      showNotification(error.message || 'Failed to update product VIP status', 'error');
    }
  };

  return (
    <VIPManagementSection
      isLoading={isLoading}
      users={users}
      products={products}
      onToggleVipUser={handleToggleVipUser}
      onToggleVipProduct={handleToggleVipProduct}
    />
  );
}

export default VIPManagementPage;
