import React from 'react';
import { LayoutDashboard } from 'lucide-react';

function DashboardHeader() {
  return (
    <div className="dashboard-header section-header-surface">
      <div>
        <h2 className="page-title">
          <LayoutDashboard size={28} />
          Administrator Dashboard
        </h2>
        <p className="page-subtitle">Store management and administration</p>
      </div>
    </div>
  );
}

export default DashboardHeader;
