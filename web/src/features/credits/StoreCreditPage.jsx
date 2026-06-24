import React from 'react';
import { useApp } from '../../context/AppContext';
import CreditsSection from '../dashboard/components/CreditsSection';

function StoreCreditPage() {
  const { showNotification } = useApp();

  return <CreditsSection showNotification={showNotification} />;
}

export default StoreCreditPage;
