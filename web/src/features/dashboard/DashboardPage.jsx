import React from 'react';
import { Outlet } from 'react-router-dom';
import DashboardSidebar from './DashboardSidebar';
import DashboardHeader from './components/DashboardHeader';
import './DashboardPage.css';

function DashboardPage() {
  return (
    <div className="dashboard-page-container">
      <DashboardHeader />
      <div className="dashboard-layout">
        <DashboardSidebar />
        <main className="dashboard-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardPage;
