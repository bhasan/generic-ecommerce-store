import React from 'react';
import { Outlet } from 'react-router-dom';
import ManageStoreSidebar from './ManageStoreSidebar';
import ManageStoreHeader from './ManageStoreHeader';
import './ManageStorePage.css';

function ManageStorePage() {
  return (
    <div className="dashboard-grid-container">
      <ManageStoreHeader />
      <div className="dashboard-grid-layout">
        <ManageStoreSidebar />
        <main className="dashboard-grid-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default ManageStorePage;
