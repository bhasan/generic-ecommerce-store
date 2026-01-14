import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductCard.css';
import './ProductsPage.css';
import { useApp } from '../../context/AppContext';

function ProductsPage() {
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

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

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
    const mainImage = product.images ? product.images[0] : product.image;
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
              e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
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

  return (
    <div className="products-page-container">
      <div className="products-header">
        <div>
          <h2 className="page-title">Products</h2>
          <p className="page-subtitle">Browse our collection of quality products</p>
        </div>
        {currentUser && (
          <div className="user-welcome">
            Welcome, <span className="user-name">{currentUser.name}</span>
          </div>
        )}
      </div>

      {isLoadingProducts || isLoadingCategories ? (
        <div className="empty-state">
          <p>Loading products...</p>
        </div>
      ) : flat ? (
        <div className="products-grid">
          {sortedProducts(flat).map(renderProductCard)}
        </div>
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

              {sortedProducts(parentProducts).length > 0 && (
                <div className="products-grid">
                  {sortedProducts(parentProducts).map(renderProductCard)}
                </div>
              )}

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
                    <div className="products-grid">
                      {sortedProducts(childProducts).map(renderProductCard)}
                    </div>
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