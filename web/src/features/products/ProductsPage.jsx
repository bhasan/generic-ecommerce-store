import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductCard.css';
import './ProductsPage.css';
import { useApp } from '../../context/AppContext';

function ProductsPage() {
  const navigate = useNavigate();
  const fallbackImage = '/images/smokestationtitle.png';
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

  const isCustomer = currentUser.role === 'CUSTOMER' || currentUser.email === 'guest@smokestation.com';
  const visibleProducts = isCustomer ? products.filter(product => !product.hidden) : products;

  const getCategoryLabel = (product) => {
    if (product?.category && typeof product.category === 'object') {
      return product.category.parent
        ? `${product.category.parent.name} > ${product.category.name}`
        : product.category.name;
    }
    return product?.category || 'Uncategorized';
  };

  const groupProducts = () => {
    if (!categories || categories.length === 0) {
      return { flat: visibleProducts };
    }

    const byCategoryId = new Map();
    visibleProducts.forEach(product => {
      const id = product.categoryId || product.category?.id;
      if (!id) return;
      if (!byCategoryId.has(id)) byCategoryId.set(id, []);
      byCategoryId.get(id).push(product);
    });

    const topLevel = categories
      .filter(category => !category.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    const children = categories
      .filter(category => category.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    const childrenByParent = children.reduce((acc, category) => {
      acc[category.parentId] = acc[category.parentId] || [];
      acc[category.parentId].push(category);
      return acc;
    }, {});

    return { topLevel, childrenByParent, byCategoryId };
  };

  const { topLevel, childrenByParent, byCategoryId, flat } = groupProducts();

  const sortedProducts = (list) =>
    [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const renderProductCard = (product) => {
    const mainImage = (product.images && product.images.length > 0 ? product.images[0] : product.image) || fallbackImage;
    const showStock = product.stockEnabled !== false;

    return (
      <div
        key={product.id}
        className="product-card"
        onClick={() => navigate(`/products/${product.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="product-image-container">
          <img
            src={mainImage}
            alt={product.name}
            className="product-image"
            onError={(e) => {
              e.target.src = fallbackImage;
            }}
          />
        </div>

        <div className="product-content">
          <div className="product-header">
            <h3 className="product-name">{product.name}</h3>
            <span className="product-category">{getCategoryLabel(product)}</span>
          </div>

          <p className="product-description">{product.description}</p>

          <div className="product-footer">
            <span className="product-price">${product.price.toFixed(2)}</span>
            <div className="product-footer-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addToCart(product);
                }}
                disabled={showStock && product.stock === 0}
                className="btn-add-to-cart"
              >
                {showStock && product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProductListItem = (product) => {
    const mainImage = (product.images && product.images.length > 0 ? product.images[0] : product.image) || fallbackImage;
    const showStock = product.stockEnabled !== false;

    return (
      <div
        key={product.id}
        className="product-list-item"
        onClick={() => navigate(`/products/${product.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="product-list-image">
          <img
            src={mainImage}
            alt={product.name}
            onError={(e) => {
              e.target.src = fallbackImage;
            }}
          />
        </div>

        <div className="product-list-content">
          <div className="product-list-header">
            <div className="product-list-title-row">
              <h3 className="product-list-name">{product.name}</h3>
              <div className="product-list-meta">
                <span className="product-list-category">{getCategoryLabel(product)}</span>
                {showStock && (
                  <span className={`product-list-stock ${product.stock === 0 ? 'is-out' : ''}`}>
                    {product.stock === 0 ? 'Out of Stock' : `${product.stock} in stock`}
                  </span>
                )}
                {!isCustomer && product.hidden && (
                  <span className="product-list-hidden">Hidden</span>
                )}
              </div>
            </div>
            <span className="product-list-price">${product.price.toFixed(2)}</span>
          </div>

          {product.description && (
            <p className="product-list-description">{product.description}</p>
          )}
        </div>

        <div className="product-list-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              addToCart(product);
            }}
            disabled={showStock && product.stock === 0}
            className="btn-add-to-cart"
          >
            {showStock && product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    );
  };

  const renderProductsCollection = (list) => {
    if (viewMode === 'list') {
      return <div className="products-list">{sortedProducts(list).map(renderProductListItem)}</div>;
    }

    return (
      <div className={`products-grid ${viewMode === 'compact' ? 'products-grid-compact' : ''}`}>
        {sortedProducts(list).map(renderProductCard)}
      </div>
    );
  };

  return (
    <div className="products-page-container">
      <div className="products-header">
        <div>
          <h2 className="page-title">Products</h2>
          <p className="page-subtitle">Browse our collection of quality products</p>
        </div>
        <div className="products-header-actions">
          <div className="products-view-toggle" role="group" aria-label="Products view">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
          {currentUser && (
            <div className="user-welcome">
              Welcome, <span className="user-name">{currentUser.name}</span>
            </div>
          )}
        </div>
      </div>

      {isLoadingProducts || isLoadingCategories ? (
        <div className="empty-state">
          <p>Loading products...</p>
        </div>
      ) : flat ? (
        renderProductsCollection(flat)
      ) : (
        topLevel.map(parent => {
          const parentProducts = byCategoryId.get(parent.id) || [];
          const childCategories = childrenByParent[parent.id] || [];

          return (
            <div key={parent.id} className="category-section">
              <div className="category-section-header">
                <h3 className="category-section-title">{parent.name}</h3>
                {parent.description && (
                  <p className="category-section-description">{parent.description}</p>
                )}
              </div>

              {sortedProducts(parentProducts).length > 0 && renderProductsCollection(parentProducts)}

              {childCategories.map(child => {
                const childProducts = byCategoryId.get(child.id) || [];
                if (childProducts.length === 0) return null;

                return (
                  <div key={child.id} className="subcategory-section">
                    <div className="category-section-header">
                      <h4 className="subcategory-section-title">{child.name}</h4>
                      {child.description && (
                        <p className="category-section-description">{child.description}</p>
                      )}
                    </div>
                    {renderProductsCollection(childProducts)}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

export default ProductsPage;