import React from 'react';
import ProductsGrid from './ProductsGrid';
import { sortProducts } from './productsHelpers';

function CategorySection({
  parent,
  childCategories,
  productsByCategory,
  viewMode,
  getCategoryLabel,
  onAddToCart,
  onProductClick,
  showHiddenLabel
}) {
  const parentProducts = productsByCategory.get(parent.id) || [];

  return (
    <div className="category-section">
      <div className="category-section-header">
        <h3 className="category-section-title">{parent.name}</h3>
        {parent.description && (
          <p className="category-section-description">{parent.description}</p>
        )}
      </div>

      {sortProducts(parentProducts).length > 0 && (
        <ProductsGrid
          products={sortProducts(parentProducts)}
          viewMode={viewMode}
          getCategoryLabel={getCategoryLabel}
          onAddToCart={onAddToCart}
          onProductClick={onProductClick}
          showHiddenLabel={showHiddenLabel}
        />
      )}

      {childCategories.map((child) => {
        const childProducts = productsByCategory.get(child.id) || [];
        if (childProducts.length === 0) return null;

        return (
          <div key={child.id} className="subcategory-section">
            <div className="category-section-header">
              <h4 className="subcategory-section-title">{child.name}</h4>
              {child.description && (
                <p className="category-section-description">{child.description}</p>
              )}
            </div>
            <ProductsGrid
              products={sortProducts(childProducts)}
              viewMode={viewMode}
              getCategoryLabel={getCategoryLabel}
              onAddToCart={onAddToCart}
              onProductClick={onProductClick}
              showHiddenLabel={showHiddenLabel}
            />
          </div>
        );
      })}
    </div>
  );
}

export default CategorySection;
