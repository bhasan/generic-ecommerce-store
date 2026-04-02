import React from 'react';
import { useApp } from '../../context/AppContext';
import AdminLayout from '../../components/layout/AdminLayout';
import CreditsSection from '../dashboard/components/CreditsSection';

function StoreCreditPage() {
  const { showNotification } = useApp();

  return (
    <AdminLayout>
      <CreditsSection showNotification={showNotification} />
    </AdminLayout>
  );
}

export default StoreCreditPage;
