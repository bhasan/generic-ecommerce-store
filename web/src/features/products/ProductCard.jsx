import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductImage from './ProductImage';

const SWIPE_THRESHOLD = 30;

function ProductCard({ product, imageSrc, images, categoryLabel, onClick, onImageClick, children, discountedPrice, hasDiscount, quantity }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = React.useRef(null);
  const imageList = images && images.length > 0 ? images : [imageSrc];
  const hasMultiple = imageList.length > 1;
  const displaySrc = imageList[currentIndex];

  const originalTotal = product.price * quantity;
  const discountedTotal = discountedPrice * quantity;

  const prev = (e) => {
    e.stopPropagation();
    setCurrentIndex((i) => (i - 1 + imageList.length) % imageList.length);
  };

  const next = (e) => {
    e.stopPropagation();
    setCurrentIndex((i) => (i + 1) % imageList.length);
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) setCurrentIndex((i) => (i + 1) % imageList.length);
    else setCurrentIndex((i) => (i - 1 + imageList.length) % imageList.length);
  };

  return (
    <div className="product-card" data-product-id={product.id} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div
        className="product-image-container"
        onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(); } : undefined}
        style={onImageClick ? { cursor: 'pointer' } : undefined}
        onTouchStart={hasMultiple ? onTouchStart : undefined}
        onTouchEnd={hasMultiple ? onTouchEnd : undefined}
      >
        <ProductImage src={displaySrc} alt={product.name} className="product-image" />
        {hasMultiple && (
          <>
            <button className="card-image-nav card-image-nav-prev" onClick={prev} aria-label="Previous image">
              <ChevronLeft size={16} />
            </button>
            <button className="card-image-nav card-image-nav-next" onClick={next} aria-label="Next image">
              <ChevronRight size={16} />
            </button>
            <div className="card-image-dots">
              {imageList.map((_, i) => (
                <span key={i} className={`card-image-dot${i === currentIndex ? ' active' : ''}`} />
              ))}
            </div>
          </>
        )}
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
