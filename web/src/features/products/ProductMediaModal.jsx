import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import { PRODUCT_FALLBACK_IMAGE } from './productsHelpers';
import './ProductMediaModal.css';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function ProductMediaModal({ product, initialIndex = 0, onClose }) {
  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [PRODUCT_FALLBACK_IMAGE];

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  return (
    <div className="pmm-overlay" onClick={onClose}>
      <div className="pmm-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pmm-header">
          <span className="pmm-title">{product.name}</span>
          {images.length > 1 && (
            <span className="pmm-counter">{currentIndex + 1} / {images.length}</span>
          )}
          <button className="pmm-close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Main media */}
        <div className="pmm-main">
          {images.length > 1 && (
            <button className="pmm-nav pmm-nav-prev" onClick={prev} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
          )}

          <div className="pmm-media-wrapper">
            {isVideo(images[currentIndex]) ? (
              <video
                key={images[currentIndex]}
                src={images[currentIndex]}
                className="pmm-media"
                controls
                autoPlay
                muted
                loop
              />
            ) : (
              <img
                key={images[currentIndex]}
                src={images[currentIndex]}
                alt={`${product.name} ${currentIndex + 1}`}
                className="pmm-media"
                onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
              />
            )}
          </div>

          {images.length > 1 && (
            <button className="pmm-nav pmm-nav-next" onClick={next} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="pmm-thumbnails">
            {images.map((img, index) => (
              <div
                key={index}
                className={`pmm-thumb ${index === currentIndex ? 'pmm-thumb-active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              >
                {isVideo(img) ? (
                  <>
                    <video src={img} className="pmm-thumb-media" />
                    <div className="pmm-thumb-play">
                      <PlayCircle size={18} color="white" />
                    </div>
                  </>
                ) : (
                  <img
                    src={img}
                    alt={`${product.name} ${index + 1}`}
                    className="pmm-thumb-media"
                    onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductMediaModal;
