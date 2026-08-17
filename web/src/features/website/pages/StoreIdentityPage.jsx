import React from 'react';
import { useOutletContext } from 'react-router-dom';
import StoreIdentitySection from '../components/StoreIdentitySection';

export default function StoreIdentityPage() {
  const { branding, onSave } = useOutletContext();
  return <StoreIdentitySection branding={branding} onSave={onSave} />;
}
