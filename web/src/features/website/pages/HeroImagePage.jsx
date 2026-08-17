import React from 'react';
import { useOutletContext } from 'react-router-dom';
import HeroImageSection from '../components/HeroImageSection';

export default function HeroImagePage() {
  const { branding, onSave } = useOutletContext();
  return <HeroImageSection branding={branding} onSave={onSave} />;
}
