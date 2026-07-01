import React from 'react';
import { Outlet } from 'react-router-dom';
import DashboardSidebar from './DashboardSidebar';
import DashboardHeader from './components/DashboardHeader';
import './DashboardPage.css';

function DashboardPage() {
  return (
    <div className="dashboard-grid-container">
      <DashboardHeader />
      <div className="dashboard-grid-layout">
        <DashboardSidebar />
        <main className="dashboard-grid-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardPage;
