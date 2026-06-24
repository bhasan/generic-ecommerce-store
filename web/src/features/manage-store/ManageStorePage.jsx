import React from 'react';
import { Outlet } from 'react-router-dom';

function ManageStorePage() {
  return (
    <div className="manage-store-layout">
      <Outlet />
    </div>
  );
}

export default ManageStorePage;
