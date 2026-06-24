import React from 'react';
import { Outlet } from 'react-router-dom';
import ManageStoreSidebar from './ManageStoreSidebar';
import ManageStoreHeader from './ManageStoreHeader';
import './ManageStorePage.css';

function ManageStorePage() {
  return (
    <div className="manage-store-page-container">
      <ManageStoreHeader />
      <div className="manage-store-layout">
        <ManageStoreSidebar />
        <main className="manage-store-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default ManageStorePage;
