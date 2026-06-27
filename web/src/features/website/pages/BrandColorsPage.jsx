import React from 'react';
import { useOutletContext } from 'react-router-dom';
import BrandColorsSection from '../components/BrandColorsSection';

export default function BrandColorsPage() {
  const { branding, onSave } = useOutletContext();
  return <BrandColorsSection branding={branding} onSave={onSave} />;
}
