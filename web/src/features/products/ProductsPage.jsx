import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductCard.css';
import './ProductsShared.css';
import './ProductsPageDefault.css';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import EmptyState from '../../components/common/EmptyState';
import ProductsHeader from './ProductsHeader';
import ProductsGrid from './ProductsGrid';
import ManageProductsPanel from './ManageProductsPanel';
import CategorySection from './CategorySection';
import CategoryNav from './CategoryNav';
import { getProductCategoryLabel, groupProductsByCategory, sortProducts } from './productsHelpers';
import ProductItemModal from './ProductItemModal';

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
  const [selectedProductId, setSelectedProductId] = useState(null);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    localStorage.setItem('productsViewMode', viewMode);
  }, [viewMode]);

  // Scroll to previously viewed product when returning from full product page
  useEffect(() => {
    if (isLoadingProducts || isLoadingCategories) return;
    const targetId = sessionStorage.getItem('productsScrollProductId');
    if (!targetId) return;
    sessionStorage.removeItem('productsScrollProductId');
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-product-id="${targetId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [isLoadingProducts, isLoadingCategories]);

  const handleProductClick = (id) => {
    setSelectedProductId(id);
  };

  const handleModalClose = () => {
    setSelectedProductId(null);
  };

  const handleViewFullPage = (id) => {
    // Save product ID so scroll restoration fires when user navigates back
    sessionStorage.setItem('productsScrollProductId', String(id));
    navigate(`/products/${id}`);
  };

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isManagement = userRoles.includes(ROLES.ADMIN) || userRoles.includes(ROLES.MANAGEMENT);
  const isCustomer = !isManagement && (userRoles.includes(ROLES.CUSTOMER) || isGuest(currentUser));
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
              Welcome, <span className="user-name">{currentUser.username}</span>
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
          onProductClick={handleProductClick}
          showHiddenLabel={!isCustomer}
        />
      ) : (
        <>
          {topLevel.length > 1 && <CategoryNav categories={topLevel} />}
          {topLevel.map((parent) => (
          <CategorySection
            key={parent.id}
            parent={parent}
            childCategories={childrenByParent[parent.id] || []}
            productsByCategory={byCategoryId}
            viewMode={viewMode}
            getCategoryLabel={productCategoryLabel}
            onAddToCart={addToCart}
            onProductClick={handleProductClick}
            showHiddenLabel={!isCustomer}
          />
        ))}
        </>
      )}

      {selectedProductId && (
        <ProductItemModal
          productId={selectedProductId}
          onClose={handleModalClose}
          onViewFullPage={handleViewFullPage}
        />
      )}
    </div>
  );
}

export default ProductsPage;