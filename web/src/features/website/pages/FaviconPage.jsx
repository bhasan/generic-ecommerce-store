import React from 'react';
import { useOutletContext } from 'react-router-dom';
import FaviconSection from '../components/FaviconSection';

export default function FaviconPage() {
  const { branding, onSave } = useOutletContext();
  return <FaviconSection branding={branding} onSave={onSave} />;
}
