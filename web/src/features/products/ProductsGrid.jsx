import React, { useState } from 'react';
import { getProductImageSrc, PRODUCT_FALLBACK_IMAGE } from './productsHelpers';

function ProductsGrid({
  products,
  viewMode,
  getCategoryLabel,
  onAddToCart,
  onProductClick,
  showHiddenLabel = false
}) {
  const [quantities, setQuantities] = useState({});

  const resolveAllowedQuantities = (product) => {
    if (product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0) {
      return product.allowedQuantitiesOverride;
    }
    return product.category?.allowedQuantities || [];
  };

  const getQuantityValue = (product) => {
    if (quantities[product.id] !== undefined) return quantities[product.id];
    const allowed = resolveAllowedQuantities(product);
    return allowed.length > 0 ? allowed[0] : 1;
  };

  const updateQuantity = (productId, value) => {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
  };

  const renderQuantitySelect = (product, allowedQuantities, quantityValue) => {
    const options = allowedQuantities.length > 0
      ? allowedQuantities
      : Array.from({ length: 5 }, (_, index) => index + 1);

    return (
      <select
        className="quantity-select"
        value={quantityValue}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => updateQuantity(product.id, parseFloat(e.target.value))}
      >
        {options.map((quantity) => (
          <option key={quantity} value={quantity}>
            {quantity}
          </option>
        ))}
      </select>
    );
  };

  const renderAddToCartButton = (product, quantityValue, showStock) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onAddToCart(product, quantityValue);
      }}
      disabled={showStock && product.stock === 0}
      className="btn-add-to-cart"
    >
      {showStock && product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
    </button>
  );

  const renderProductCard = (product) => {
    const mainImage = getProductImageSrc(product);
    const showStock = product.stockEnabled !== false;
    const allowedQuantities = resolveAllowedQuantities(product);
    const quantityValue = getQuantityValue(product);

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
              e.target.src = PRODUCT_FALLBACK_IMAGE;
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
              <div className="quantity-controls">
                {renderQuantitySelect(product, allowedQuantities, quantityValue)}
              </div>
              {renderAddToCartButton(product, quantityValue, showStock)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProductListItem = (product) => {
    const mainImage = getProductImageSrc(product);
    const showStock = product.stockEnabled !== false;
    const allowedQuantities = resolveAllowedQuantities(product);
    const quantityValue = getQuantityValue(product);

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
            e.target.src = PRODUCT_FALLBACK_IMAGE;
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
          <div className="quantity-controls">
            {renderQuantitySelect(product, allowedQuantities, quantityValue)}
          </div>
          {renderAddToCartButton(product, quantityValue, showStock)}
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
