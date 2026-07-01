import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductCard.css';
import './ProductsShared.css';
import './ProductsPageDefault.css';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import EmptyState from '../../components/common/EmptyState';
import ProductsHeader from './ProductsHeader';
import ProductsGrid from './ProductsGrid';
import CategorySection from './CategorySection';
import CategoryNav from './CategoryNav';
import { getProductCategoryLabel, groupProductsByCategory, sortProducts } from './productsHelpers';
import { searchProducts } from '../../services/productsApi';
import { useProgressiveReveal } from '../../hooks/useProgressiveReveal';
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
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimerRef = useRef(null);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (q.trim()) {
        setIsSearching(true);
        try {
          const results = await searchProducts(q);
          setSearchResults(results);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults(null);
      }
    }, 250);
  };

  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    const savedView = localStorage.getItem('productsViewMode');
    return savedView === 'grid' || savedView === 'list' ? savedView : 'list';
  });
  const [selectedProductId, setSelectedProductId] = useState(null);

  useEffect(() => {
    localStorage.setItem('productsViewMode', viewMode);
  }, [viewMode]);

  // Scroll to previously viewed product when returning from full product page
  useEffect(() => {
    if (isLoadingProducts || isLoadingCategories) return;
    const targetId = sessionStorage.getItem('productsScrollProductId');
    if (!targetId) return;
    sessionStorage.removeItem('productsScrollProductId');
    setTimeout(() => {
      const el = document.querySelector(`[data-product-id="${targetId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
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
    setSearchQuery('');
    setSearchResults(null);
    navigate(`/products/${id}`);
  };

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isManagement = userRoles.includes(ROLES.ADMIN) || userRoles.includes(ROLES.MANAGEMENT);
  const isVip = userRoles.includes(ROLES.VIP);

  let visibleProducts;
  if (isManagement) {
    visibleProducts = products;
  } else if (isVip) {
    visibleProducts = products.filter(product => !product.hidden);
  } else {
    visibleProducts = products.filter(product => !product.hidden && !product.vipOnly);
  }

  const { topLevel, childrenByParent, byCategoryId, flat } = groupProductsByCategory(visibleProducts, categories);
  const { visibleCount, sentinelRef } = useProgressiveReveal(topLevel, 4);
  const productCategoryLabel = getProductCategoryLabel;

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

      <input
        type="search"
        placeholder="Search products…"
        value={searchQuery}
        onChange={handleSearchChange}
        aria-label="Search products"
        className="products-search-input"
      />

      {isLoadingProducts || isLoadingCategories ? (
        <EmptyState message="Loading products..." />
      ) : searchResults !== null ? (
        isSearching ? (
          <EmptyState message="Searching…" />
        ) : searchResults.length === 0 ? (
          <EmptyState message="No products found." />
        ) : (
          <ProductsGrid
            products={searchResults}
            viewMode={viewMode}
            getCategoryLabel={productCategoryLabel}
            onAddToCart={addToCart}
            onProductClick={handleProductClick}
            showHiddenLabel={isManagement}
          />
        )
      ) : flat ? (
        <ProductsGrid
          products={sortProducts(flat)}
          viewMode={viewMode}
          getCategoryLabel={productCategoryLabel}
          onAddToCart={addToCart}
          onProductClick={handleProductClick}
          showHiddenLabel={isManagement}
        />
      ) : (
        <>
          {topLevel.length > 1 && <CategoryNav categories={topLevel} />}
          {topLevel.slice(0, visibleCount).map((parent) => (
            <CategorySection
              key={parent.id}
              parent={parent}
              childCategories={childrenByParent[parent.id] || []}
              productsByCategory={byCategoryId}
              viewMode={viewMode}
              getCategoryLabel={productCategoryLabel}
              onAddToCart={addToCart}
              onProductClick={handleProductClick}
              showHiddenLabel={isManagement}
            />
          ))}
          {visibleCount < topLevel.length && <div ref={sentinelRef} />}
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