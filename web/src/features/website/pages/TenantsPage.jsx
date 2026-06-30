import React from 'react';
import WebsiteTenantsSection from '../components/WebsiteTenantsSection';

// TEMPORARY: tenant management lives in website-management and is ADMIN-gated;
// it will move to a dedicated super-admin portal later.

export default function TenantsPage() {
  return <WebsiteTenantsSection />;
}
