import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import { X, ExternalLink, Link, ShoppingCart, ChevronLeft, ChevronRight, PlayCircle, AlertCircle, Tag } from 'lucide-react';
import ProductMediaModal from './ProductMediaModal';
import { PRODUCT_FALLBACK_IMAGE, getProductCategoryLabel, getProductAllImages, getAllowedQuantities, getDiscountedUnitPrice, getDefaultVariant } from './productsHelpers';
import './ProductsShared.css';
import './ProductItemModal.css';
import { formatPrice } from '../../utils/currencyUtils';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function ProductItemModal({ productId, onClose, onViewFullPage }) {
  const { products, addToCart, currentUser, isLoadingProducts } = useApp();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [copied, setCopied] = useState(false);

  const product = products.find(p => p.id === parseInt(productId));

  const activeVariants = (product?.variants ?? []).filter(v => v.active);
  const selectedVariant = activeVariants.find(v => v.id === selectedVariantId) ?? getDefaultVariant(product);
  const allowedQuantities = selectedVariant ? getAllowedQuantities(selectedVariant) : [];

  useEffect(() => {
    if (product) {
      const def = getDefaultVariant(product);
      setSelectedVariantId(def?.id ?? null);
    }
  }, [product?.id]);

  useEffect(() => {
    if (allowedQuantities.length > 0) {
      setSelectedQuantity(allowedQuantities[0]);
    } else {
      setSelectedQuantity(1);
    }
  }, [selectedVariant?.id, allowedQuantities.length]);

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

  const images = getProductAllImages(product);
  const showStock = selectedVariant?.stockEnabled !== false;
  const isOutOfStock = showStock && Number(selectedVariant?.stock ?? 0) === 0;
  const basePrice = Number(selectedVariant?.basePrice ?? 0);
  const unitPrice = selectedVariant ? getDiscountedUnitPrice(selectedVariant, selectedQuantity) : basePrice;
  const totalPrice = unitPrice * selectedQuantity;
  const originalTotal = basePrice * selectedQuantity;
  const hasDiscount = unitPrice < basePrice;

  const handleAddToCart = () => {
    if (selectedVariant) addToCart(product, selectedVariant, selectedQuantity);
  };

  const priceBreaks = selectedVariant?.priceBreaks ?? [];

  return (
    <div className="product-modal-backdrop" onClick={onClose}>
      <div className="product-modal" onClick={(e) => e.stopPropagation()}>
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

        <div className="product-modal-body">
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
                <video src={images[selectedImageIndex]} className="product-modal-main-image" controls autoPlay muted loop />
              ) : (
                <img
                  src={images[selectedImageIndex] ?? PRODUCT_FALLBACK_IMAGE}
                  alt={product.name}
                  className="product-modal-main-image"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setMediaModalOpen(true)}
                  onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
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
                        <div className="video-thumbnail-overlay"><PlayCircle size={16} color="white" /></div>
                      </>
                    ) : (
                      <img
                        src={img}
                        alt={`${product.name} ${index + 1}`}
                        className="thumbnail"
                        onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="product-modal-info">
            <div className="product-category-badge">{getProductCategoryLabel(product)}</div>
            <h2 className="product-modal-product-title">{product.name}</h2>

            <div className="product-price-display">
              {formatPrice(basePrice)}
              {priceBreaks.length > 0 && <span className="price-per-unit">/ each</span>}
            </div>

            {activeVariants.length > 1 && (
              <div className="variant-selector">
                <label className="quantity-label">Option</label>
                <div className="variant-buttons">
                  {activeVariants.map(v => (
                    <button
                      key={v.id}
                      className={`variant-btn${v.id === selectedVariant?.id ? ' variant-btn-active' : ''}`}
                      onClick={() => setSelectedVariantId(v.id)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {priceBreaks.length > 0 && (
              <div className="quantity-discounts-table">
                <div className="discounts-header">
                  <Tag size={16} />
                  <span>Quantity Pricing</span>
                </div>
                <div className="discounts-list">
                  {[...priceBreaks].sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity)).map((pb, i) => (
                    <div key={i} className="discount-tier">
                      <span className="discount-qty">{Number(pb.minQuantity)}+:</span>
                      <span className="discount-value">{formatPrice(Number(pb.unitPrice))} each</span>
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
                  min="1"
                  step="1"
                  value={selectedQuantity}
                  onChange={(e) => setSelectedQuantity(parseInt(e.target.value, 10) || 0)}
                  className="quantity-input"
                />
              )}
            </div>

            <div className="dynamic-price-display">
              {hasDiscount ? (
                <>
                  <div className="price-row price-total-row">
                    <span className="price-label">Total ({selectedQuantity} items):</span>
                    <span className="price-original">{formatPrice(originalTotal)}</span>
                    <span className="price-arrow">→</span>
                    <span className="price-total">{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="price-row">
                    <span className="price-savings">Save {formatPrice(originalTotal - totalPrice)}</span>
                  </div>
                </>
              ) : (
                <div className="price-row price-total-row">
                  <span className="price-label">Total ({selectedQuantity} items):</span>
                  <span className="price-total">{formatPrice(totalPrice)}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || selectedQuantity <= 0 || !selectedVariant}
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
