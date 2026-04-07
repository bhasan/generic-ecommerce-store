import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Save, ChevronUp, ChevronDown, X, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import './LandingPageSection.css';

const MAX_FEATURED = 12;

function LandingPageSection({ isLoading, landingPageSettings, onSave }) {
  const { products } = useApp();
  const [featuredIds, setFeaturedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (landingPageSettings) {
      setFeaturedIds(landingPageSettings.featuredProductIds || []);
    }
  }, [landingPageSettings]);

  const featuredProducts = featuredIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean);

  const availableProducts = products.filter(p => {
    if (featuredIds.includes(p.id)) return false;
    if (!searchQuery.trim()) return true;
    return p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAdd = (productId) => {
    if (featuredIds.length >= MAX_FEATURED) return;
    setFeaturedIds(prev => [...prev, productId]);
  };

  const handleRemove = (productId) => {
    setFeaturedIds(prev => prev.filter(id => id !== productId));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    setFeaturedIds(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index) => {
    if (index === featuredIds.length - 1) return;
    setFeaturedIds(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ featuredProductIds: featuredIds });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-content-section surface-card">
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading landing page settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <LayoutDashboard size={24} />
          Landing Page
        </h3>
      </div>

      <p className="lps-description">
        Select up to {MAX_FEATURED} products to feature on the landing page. Drag them into order using
        the arrow buttons. If none are selected, the landing page falls back to showing the top-sorted products.
      </p>

      <div className="lps-panels">
        {/* Available products */}
        <div className="lps-panel">
          <div className="lps-panel-header">
            <span className="lps-panel-title">All Products</span>
            <span className="lps-panel-count">{products.length}</span>
          </div>

          <div className="lps-search-box">
            <Search size={16} className="lps-search-icon" />
            <input
              type="text"
              className="lps-search-input"
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <ul className="lps-product-list">
            {availableProducts.length === 0 && (
              <li className="lps-empty">No products found</li>
            )}
            {availableProducts.map(product => (
              <li key={product.id} className="lps-product-item">
                {product.thumbnail && (
                  <img
                    src={product.thumbnail}
                    alt=""
                    className="lps-product-thumb"
                  />
                )}
                <span className="lps-product-name">{product.name}</span>
                <button
                  className="lps-add-btn"
                  onClick={() => handleAdd(product.id)}
                  disabled={featuredIds.length >= MAX_FEATURED}
                  title="Add to featured"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Featured products */}
        <div className="lps-panel">
          <div className="lps-panel-header">
            <span className="lps-panel-title">Featured</span>
            <span className={`lps-panel-count ${featuredIds.length >= MAX_FEATURED ? 'lps-panel-count--full' : ''}`}>
              {featuredIds.length} / {MAX_FEATURED}
            </span>
          </div>

          <ul className="lps-product-list lps-featured-list">
            {featuredProducts.length === 0 && (
              <li className="lps-empty">No featured products selected</li>
            )}
            {featuredProducts.map((product, index) => (
              <li key={product.id} className="lps-product-item lps-featured-item">
                <span className="lps-featured-rank">{index + 1}</span>
                {product.thumbnail && (
                  <img
                    src={product.thumbnail}
                    alt=""
                    className="lps-product-thumb"
                  />
                )}
                <span className="lps-product-name">{product.name}</span>
                <div className="lps-order-btns">
                  <button
                    className="lps-order-btn"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="lps-order-btn"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === featuredProducts.length - 1}
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button
                  className="lps-remove-btn"
                  onClick={() => handleRemove(product.id)}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button
        className="btn-action btn-primary lps-save-btn"
        onClick={handleSave}
        disabled={isSaving}
      >
        <Save size={16} />
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

export default LandingPageSection;
