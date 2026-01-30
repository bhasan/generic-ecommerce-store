import React from 'react';
import ProductImage from './ProductImage';

function ProductCard({ product, imageSrc, categoryLabel, onClick, children, discountedPrice, hasDiscount, quantity }) {
  const originalTotal = product.price * quantity;
  const discountedTotal = discountedPrice * quantity;

  return (
    <div className="product-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="product-image-container">
        <ProductImage src={imageSrc} alt={product.name} className="product-image" />
      </div>

      <div className="product-content">
        <div className="product-header">
          <h3 className="product-name">{product.name}</h3>
          <span className="product-category">{categoryLabel}</span>
        </div>

        <p className="product-description">{product.description}</p>

        <div className="product-footer">
          <div className="product-price-container">
            {hasDiscount ? (
              <>
                <span className="product-price-original">${originalTotal.toFixed(2)}</span>
                <span className="product-price product-price-discounted">${discountedTotal.toFixed(2)}</span>
              </>
            ) : (
              <span className="product-price">${originalTotal.toFixed(2)}</span>
            )}
          </div>
          <div className="product-footer-actions">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
