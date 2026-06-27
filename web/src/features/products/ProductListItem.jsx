import React from 'react';
import ProductImage from './ProductImage';
import { formatPrice } from '../../utils/currencyUtils';

function ProductListItem({
  product,
  imageSrc,
  categoryLabel,
  showStock,
  showHiddenLabel,
  onClick,
  onImageClick,
  children,
  discountedPrice,
  hasDiscount,
  quantity
}) {
  const originalTotal = product.price * quantity;
  const discountedTotal = discountedPrice * quantity;

  return (
    <div className="product-list-item" data-product-id={product.id} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div
        className="product-list-image"
        onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(); } : undefined}
        style={onImageClick ? { cursor: 'pointer' } : undefined}
      >
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
          <div className="product-list-price-container">
            {hasDiscount ? (
              <>
                <span className="product-list-price-original">{formatPrice(originalTotal)}</span>
                <span className="product-list-price product-list-price-discounted">{formatPrice(discountedTotal)}</span>
              </>
            ) : (
              <span className="product-list-price">{formatPrice(originalTotal)}</span>
            )}
          </div>
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
