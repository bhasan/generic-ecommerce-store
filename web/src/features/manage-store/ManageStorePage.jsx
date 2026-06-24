import React from 'react';
import { Outlet } from 'react-router-dom';
import ManageStoreSidebar from './ManageStoreSidebar';
import './ManageStorePage.css';

function ManageStorePage() {
  return (
    <div className="manage-store-layout">
      <ManageStoreSidebar />
      <main className="manage-store-content">
        <Outlet />
      </main>
    </div>
  );
}

export default ManageStorePage;
