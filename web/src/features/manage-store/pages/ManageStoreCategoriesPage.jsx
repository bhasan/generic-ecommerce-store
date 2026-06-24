import React from 'react';
import CategoriesSection from '../../dashboard/components/CategoriesSection';

function ManageStoreCategoriesPage() {
  return (
    <div className="manage-store-section">
      <div className="manage-store-section-header">
        <h1 className="manage-store-section-title">Categories</h1>
        <p className="manage-store-section-subtitle">Organize products into categories and subcategories</p>
      </div>
      <CategoriesSection />
    </div>
  );
}

export default ManageStoreCategoriesPage;
