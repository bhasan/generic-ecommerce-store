import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';

function DashboardHeader() {
  return (
    <PageHeader
      className="dashboard-header"
      title="Administrator Dashboard"
      subtitle="Store management and administration"
      icon={LayoutDashboard}
    />
  );
}

export default DashboardHeader;
