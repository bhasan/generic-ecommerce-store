import React from 'react';

function ProductsHeader({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  rightContent,
  showViewToggle = true
}) {
  return (
    <div className="products-header">
      <div>
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className="products-header-actions">
        {showViewToggle && (
          <div className="products-view-toggle" role="group" aria-label="Products view">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => onViewModeChange('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onViewModeChange('list')}
            >
              List
            </button>
          </div>
        )}
        {rightContent}
      </div>
    </div>
  );
}

export default ProductsHeader;
