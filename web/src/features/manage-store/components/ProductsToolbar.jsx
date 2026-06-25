import React from 'react';
import { Plus } from 'lucide-react';
import './ProductsToolbar.css';

function ProductsToolbar({ searchQuery, viewMode, onSearch, onViewModeChange, onAddProduct, canManage }) {
  return (
    <div className="products-toolbar">
      <input
        type="search"
        className="products-toolbar-search"
        placeholder="Filter products…"
        value={searchQuery}
        onChange={e => onSearch(e.target.value)}
        aria-label="Filter products"
      />
      <div className="products-toolbar-right">
        <div className="products-view-toggle" role="group" aria-label="Products view">
          <button
            type="button"
            className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => onViewModeChange('grid')}
          >
            Grid
          </button>
          <button
            type="button"
            className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => onViewModeChange('list')}
          >
            List
          </button>
        </div>
        {canManage && (
          <button className="btn-add-product" onClick={onAddProduct}>
            <Plus size={18} />
            <span>Add Product</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default ProductsToolbar;
