import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductCard.css';
import './ProductsShared.css';
import './ProductsPageDefault.css';
import { useApp } from '../../context/AppContext';
import EmptyState from '../../components/common/EmptyState';
import ProductsHeader from './ProductsHeader';
import ProductsGrid from './ProductsGrid';
import ManageProductsPanel from './ManageProductsPanel';
import CategorySection from './CategorySection';
import { getProductCategoryLabel, groupProductsByCategory, sortProducts } from './productsHelpers';

function ProductsPage({ mode = 'browse' }) {
  const navigate = useNavigate();
  const {
    products,
    addToCart,
    currentUser,
    isLoadingProducts,
    categories,
    isLoadingCategories,
    loadCategories
  } = useApp();

  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    const savedView = localStorage.getItem('productsViewMode');
    return savedView === 'compact' || savedView === 'list' ? savedView : 'compact';
  });

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    localStorage.setItem('productsViewMode', viewMode);
  }, [viewMode]);

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isManagement = userRoles.includes('ADMIN') || userRoles.includes('MANAGEMENT');
  const isCustomer = !isManagement && (userRoles.includes('CUSTOMER') || currentUser.email === 'guest@smokestation.com');
  const visibleProducts = isCustomer ? products.filter(product => !product.hidden) : products;

  const { topLevel, childrenByParent, byCategoryId, flat } = groupProductsByCategory(visibleProducts, categories);
  const productCategoryLabel = getProductCategoryLabel;

  if (mode === 'manage' && isManagement) {
    return <ManageProductsPanel />;
  }

  return (
    <div className="products-page-container">
      <ProductsHeader
        title="Products"
        subtitle="Browse our collection of quality products"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        rightContent={
          currentUser ? (
            <div className="user-welcome">
              Welcome, <span className="user-name">{currentUser.name}</span>
            </div>
          ) : null
        }
      />

      {isLoadingProducts || isLoadingCategories ? (
        <EmptyState message="Loading products..." />
      ) : flat ? (
        <ProductsGrid
          products={sortProducts(flat)}
          viewMode={viewMode}
          getCategoryLabel={productCategoryLabel}
          onAddToCart={addToCart}
          onProductClick={(id) => navigate(`/products/${id}`)}
          showHiddenLabel={!isCustomer}
        />
      ) : (
        topLevel.map((parent) => (
          <CategorySection
            key={parent.id}
            parent={parent}
            childCategories={childrenByParent[parent.id] || []}
            productsByCategory={byCategoryId}
            viewMode={viewMode}
            getCategoryLabel={productCategoryLabel}
            onAddToCart={addToCart}
            onProductClick={(id) => navigate(`/products/${id}`)}
            showHiddenLabel={!isCustomer}
          />
        ))
      )}
    </div>
  );
}

export default ProductsPage;