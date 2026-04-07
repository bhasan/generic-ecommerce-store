import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Fuse from 'fuse.js';
import { Search, X, ArrowRight } from 'lucide-react';
import './LandingPage.css';
import '../products/ProductCard.css';
import '../products/ProductsShared.css';
import PromotionsCarousel from './PromotionsCarousel';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import { getProductCategoryLabel, sortProducts } from '../products/productsHelpers';
import ProductsGrid from '../products/ProductsGrid';

const FUSE_OPTIONS = {
  keys: [
    { name: 'name',                  weight: 0.70 },
    { name: 'category.name',         weight: 0.15 },
    { name: 'category.parent.name',  weight: 0.05 },
    { name: 'description',           weight: 0.10 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

function LandingPage() {
  const navigate = useNavigate();
  const { products, categories, isLoadingProducts, addToCart, currentUser, featuredProductIds, promotions } = useApp();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef(null);

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isManagement = userRoles.includes(ROLES.ADMIN) || userRoles.includes(ROLES.MANAGEMENT);
  const isCustomer = !isManagement && (userRoles.includes(ROLES.CUSTOMER) || isGuest(currentUser));

  const visibleProducts = isCustomer ? products.filter(p => !p.hidden) : products;

  const fuse = useMemo(() => new Fuse(visibleProducts, FUSE_OPTIONS), [visibleProducts]);

  const featuredProducts = useMemo(() => {
    if (featuredProductIds.length > 0) {
      return featuredProductIds
        .map(id => visibleProducts.find(p => p.id === id))
        .filter(Boolean);
    }
    return sortProducts(visibleProducts).slice(0, 12);
  }, [visibleProducts, featuredProductIds]);

  const topLevelCategories = useMemo(
    () => categories
      .filter(c => !c.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [categories]
  );

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);

  const searchResults = useMemo(() => {
    if (debouncedQuery.length < 2) return null;
    return fuse.search(debouncedQuery).map(r => r.item);
  }, [debouncedQuery, fuse]);

  const handleProductClick = (id) => navigate(`/products/${id}`);

  const handleClearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="landing-page">

      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-headline">What are you looking for today?</h1>

        <div className="landing-search-wrapper">
          <div className="landing-search-box">
            <Search size={20} className="landing-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="landing-search-input"
              placeholder="Search products, brands, categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              autoComplete="off"
            />
            {query && (
              <button
                className="landing-search-clear"
                onClick={handleClearQuery}
                aria-label="Clear search"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {!query && topLevelCategories.length > 0 && (
            <div className="landing-category-pills">
              {topLevelCategories.map(cat => (
                <button
                  key={cat.id}
                  className="landing-category-pill"
                  onClick={() => setQuery(cat.name)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <Link to="/products" className="landing-browse-btn">
            Browse All Products <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Promotions */}
      {promotions.length > 0 && (
        <section className="landing-promotions">
          <PromotionsCarousel slides={promotions} />
        </section>
      )}

      {/* Results */}
      <section className="landing-results">
        {isLoadingProducts ? (
          <div className="empty-state">Loading products...</div>

        ) : searchResults === null ? (
          <>
            <div className="landing-results-header">
              <h2 className="landing-results-title">Featured Products</h2>
              <Link to="/products" className="landing-browse-link">
                Browse all <ArrowRight size={16} />
              </Link>
            </div>
            <ProductsGrid
              products={featuredProducts}
              viewMode="grid"
              getCategoryLabel={getProductCategoryLabel}
              onAddToCart={addToCart}
              onProductClick={handleProductClick}
              showHiddenLabel={!isCustomer}
            />
          </>

        ) : searchResults.length === 0 ? (
          <div className="landing-no-results">
            <Search size={40} className="landing-no-results-icon" />
            <p>No products found for &ldquo;{debouncedQuery}&rdquo;</p>
            <button className="landing-clear-search" onClick={handleClearQuery}>
              Clear search
            </button>
          </div>

        ) : (
          <>
            <div className="landing-results-header">
              <h2 className="landing-results-title">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{debouncedQuery}&rdquo;
              </h2>
              <Link to="/products" className="landing-browse-link">
                Browse all <ArrowRight size={16} />
              </Link>
            </div>
            <ProductsGrid
              products={searchResults}
              viewMode="grid"
              getCategoryLabel={getProductCategoryLabel}
              onAddToCart={addToCart}
              onProductClick={handleProductClick}
              showHiddenLabel={!isCustomer}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default LandingPage;
