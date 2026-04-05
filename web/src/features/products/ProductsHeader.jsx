import React from 'react';
import PageHeader from '../../components/common/PageHeader';

function ProductsHeader({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  rightContent,
  showViewToggle = true
}) {
  return (
    <PageHeader
      className="products-header"
      title={title}
      subtitle={subtitle}
      actions={(
        <div className="products-header-actions">
          {showViewToggle && (
            <div className="products-view-toggle" role="group" aria-label="Products view">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => onViewModeChange('grid')}
              >
                Grid
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
      )}
    />
  );
}

export default ProductsHeader;
