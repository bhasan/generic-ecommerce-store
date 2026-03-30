import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import { X, ExternalLink, Link, ShoppingCart, ChevronLeft, ChevronRight, PlayCircle, AlertCircle, Tag } from 'lucide-react';
import ProductMediaModal from './ProductMediaModal';
import { PRODUCT_FALLBACK_IMAGE, getProductCategoryLabel, resolveQuantityDiscounts } from './productsHelpers';
import './ProductItemModal.css';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function ProductItemModal({ productId, onClose, onViewFullPage }) {
  const { products, addToCart, currentUser, isLoadingProducts } = useApp();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [copied, setCopied] = useState(false);

  const product = products.find(p => p.id === parseInt(productId));

  const allowedQuantities =
    product?.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0
      ? product.allowedQuantitiesOverride
      : product?.category?.allowedQuantities || [];

  useEffect(() => {
    if (allowedQuantities.length > 0) {
      setSelectedQuantity(allowedQuantities[0]);
    } else {
      setSelectedQuantity(1);
    }
  }, [product?.id, allowedQuantities.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/products/${productId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoadingProducts || !product) {
    return (
      <div className="product-modal-backdrop" onClick={onClose}>
        <div className="product-modal" onClick={(e) => e.stopPropagation()}>
          <div className="product-modal-loading">
            {isLoadingProducts ? 'Loading...' : 'Product not found.'}
          </div>
        </div>
      </div>
    );
  }

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const isCustomer = !userRoles.includes(ROLES.ADMIN) && !userRoles.includes(ROLES.MANAGEMENT);
  if (product.hidden && (isCustomer || isGuest(currentUser))) {
    onClose();
    return null;
  }

  const fallbackImage = PRODUCT_FALLBACK_IMAGE;
  const baseImages =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [fallbackImage];

  const images = product.thumbnail && product.thumbnail !== baseImages[0]
    ? [product.thumbnail, ...baseImages.filter(img => img !== product.thumbnail)]
    : baseImages;

  const showStock = product.stockEnabled !== false;
  const isOutOfStock = showStock && product.stock === 0;
  const quantityDiscounts = resolveQuantityDiscounts(product);

  const handleAddToCart = () => {
    addToCart(product, selectedQuantity);
  };

  const originalTotal = product.price * selectedQuantity;
  const matchingDiscount = quantityDiscounts.find((rule) => Math.abs(rule.quantity - selectedQuantity) < 1e-9);
  let totalSavings = 0;
  if (matchingDiscount) {
    if (matchingDiscount.type === 'percent') {
      totalSavings = originalTotal * (matchingDiscount.value / 100);
    } else {
      totalSavings = matchingDiscount.value;
    }
  }
  const totalPrice = Math.max(0, originalTotal - totalSavings);
  const hasDiscount = totalSavings > 0;

  return (
    <div className="product-modal-backdrop" onClick={onClose}>
      <div className="product-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="product-modal-header">
          <span className="product-modal-title">{product.name}</span>
          <div className="product-modal-actions">
            <button className="product-modal-btn" onClick={handleCopyLink} title="Copy link">
              <Link size={16} />
              <span>{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
            <button className="product-modal-btn product-modal-btn-primary" onClick={() => onViewFullPage(productId)} title="View full page">
              <ExternalLink size={16} />
              <span>Full page</span>
            </button>
            <button className="product-modal-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="product-modal-body">
          {/* Image Gallery */}
          <div className="product-modal-gallery">
            <div className="product-modal-main-image-container">
              {images.length > 1 && (
                <button
                  className="btn-gallery-nav btn-gallery-prev"
                  onClick={() => setSelectedImageIndex(prev => prev === 0 ? images.length - 1 : prev - 1)}
                  aria-label="Previous image"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {isVideo(images[selectedImageIndex]) ? (
                <video
                  src={images[selectedImageIndex]}
                  className="product-modal-main-image"
                  controls
                  autoPlay
                  muted
                  loop
                />
              ) : (
                <img
                  src={images[selectedImageIndex]}
                  alt={product.name}
                  className="product-modal-main-image"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setMediaModalOpen(true)}
                  onError={(e) => { e.target.src = fallbackImage; }}
                />
              )}

              {images.length > 1 && (
                <button
                  className="btn-gallery-nav btn-gallery-next"
                  onClick={() => setSelectedImageIndex(prev => prev === images.length - 1 ? 0 : prev + 1)}
                  aria-label="Next image"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {images.length > 1 && (
              <div className="product-modal-thumbnails">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className={`thumbnail-wrapper${selectedImageIndex === index ? ' thumbnail-active' : ''}`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    {isVideo(img) ? (
                      <>
                        <video src={img} className="thumbnail" />
                        <div className="video-thumbnail-overlay">
                          <PlayCircle size={16} color="white" />
                        </div>
                      </>
                    ) : (
                      <img
                        src={img}
                        alt={`${product.name} ${index + 1}`}
                        className="thumbnail"
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="product-modal-info">
            <div className="product-category-badge">{getProductCategoryLabel(product)}</div>
            <h2 className="product-modal-product-title">{product.name}</h2>

            <div className="product-price-display">
              ${product.price.toFixed(2)}
              {quantityDiscounts.length > 0 && <span className="price-per-unit">/ each</span>}
            </div>

            {quantityDiscounts.length > 0 && (
              <div className="quantity-discounts-table">
                <div className="discounts-header">
                  <Tag size={16} />
                  <span>Quantity Discounts</span>
                </div>
                <div className="discounts-list">
                  {[...quantityDiscounts].sort((a, b) => a.quantity - b.quantity).map((discount, index) => (
                    <div key={index} className="discount-tier">
                      <span className="discount-qty">Buy {discount.quantity}:</span>
                      <span className="discount-value">
                        {discount.type === 'percent' ? `${discount.value}% off` : `$${discount.value.toFixed(2)} off`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="product-description-full">{product.description}</p>

            <div className="quantity-selector">
              <label className="quantity-label">Quantity</label>
              {allowedQuantities.length > 0 ? (
                <select
                  value={selectedQuantity}
                  onChange={(e) => setSelectedQuantity(parseFloat(e.target.value))}
                  className="quantity-select"
                >
                  {allowedQuantities.map((qty) => (
                    <option key={qty} value={qty}>{qty}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={selectedQuantity}
                  onChange={(e) => setSelectedQuantity(parseFloat(e.target.value) || 0)}
                  className="quantity-input"
                />
              )}
            </div>

            <div className="dynamic-price-display">
              {hasDiscount ? (
                <>
                  <div className="price-row price-total-row">
                    <span className="price-label">Total ({selectedQuantity} items):</span>
                    <span className="price-original">${originalTotal.toFixed(2)}</span>
                    <span className="price-arrow">→</span>
                    <span className="price-total">${totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="price-row">
                    <span className="price-savings">Save ${totalSavings.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="price-row price-total-row">
                  <span className="price-label">Total ({selectedQuantity} items):</span>
                  <span className="price-total">${originalTotal.toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || selectedQuantity <= 0}
              className="btn-add-to-cart-large"
            >
              <ShoppingCart size={20} />
              {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>

            {product.hidden && (
              <div className="admin-notice">
                <AlertCircle size={16} />
                This product is currently hidden from customers
              </div>
            )}
          </div>
        </div>
      </div>

      {mediaModalOpen && (
        <ProductMediaModal
          product={product}
          initialIndex={selectedImageIndex}
          onClose={() => setMediaModalOpen(false)}
        />
      )}
    </div>
  );
}

export default ProductItemModal;
