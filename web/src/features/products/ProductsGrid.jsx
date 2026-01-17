import React from 'react';

function ProductsGrid({
  products,
  viewMode,
  fallbackImage,
  getCategoryLabel,
  onAddToCart,
  onProductClick,
  showHiddenLabel = false
}) {
  const renderProductCard = (product) => {
    const mainImage = (product.images && product.images.length > 0 ? product.images[0] : product.image) || fallbackImage;
    const showStock = product.stockEnabled !== false;

    return (
      <div
        key={product.id}
        className="product-card"
        onClick={() => onProductClick(product.id)}
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
                  onAddToCart(product);
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
        onClick={() => onProductClick(product.id)}
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
                {showHiddenLabel && product.hidden && <span className="product-list-hidden">Hidden</span>}
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
              onAddToCart(product);
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

  if (viewMode === 'list') {
    return <div className="products-list">{products.map(renderProductListItem)}</div>;
  }

  return (
    <div className={`products-grid ${viewMode === 'compact' ? 'products-grid-compact' : ''}`}>
      {products.map(renderProductCard)}
    </div>
  );
}

export default ProductsGrid;
