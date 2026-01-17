import React from 'react';
import ProductImage from './ProductImage';

function ProductListItem({
  product,
  imageSrc,
  categoryLabel,
  showStock,
  showHiddenLabel,
  onClick,
  children
}) {
  return (
    <div className="product-list-item" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="product-list-image">
        <ProductImage src={imageSrc} alt={product.name} />
      </div>

      <div className="product-list-content">
        <div className="product-list-header">
          <div className="product-list-title-row">
            <h3 className="product-list-name">{product.name}</h3>
            <div className="product-list-meta">
              <span className="product-list-category">{categoryLabel}</span>
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

      <div className="product-list-actions">{children}</div>
    </div>
  );
}

export default ProductListItem;
