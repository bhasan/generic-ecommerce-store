import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest } from '../../utils/roles';
import { ArrowLeft, ShoppingCart, AlertCircle, Tag, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import { PRODUCT_FALLBACK_IMAGE, getProductCategoryLabel, getProductAllImages, getAllowedQuantities, getDiscountedUnitPrice, getDefaultVariant } from './productsHelpers';
import ProductMediaModal from './ProductMediaModal';
import './ProductsShared.css';
import './ProductItemPage.css';
import { hasRole } from '../../utils/roles';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function PriceBreaksTable({ variant }) {
  const breaks = variant?.priceBreaks ?? [];
  if (breaks.length === 0) return null;
  const sorted = [...breaks].sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity));

  return (
    <div className="quantity-discounts-table">
      <div className="discounts-header">
        <Tag size={16} />
        <span>Quantity Pricing</span>
      </div>
      <div className="discounts-list">
        {sorted.map((pb, i) => (
          <div key={i} className="discount-tier">
            <span className="discount-qty">{Number(pb.minQuantity)}+:</span>
            <span className="discount-value">${Number(pb.unitPrice).toFixed(2)} each</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DynamicPriceDisplay({ variant, quantity }) {
  const basePrice = Number(variant?.basePrice ?? 0);
  const unitPrice = getDiscountedUnitPrice(variant, quantity);
  const totalPrice = unitPrice * quantity;
  const hasDiscount = unitPrice < basePrice;
  const originalTotal = basePrice * quantity;

  return (
    <div className="dynamic-price-display">
      {hasDiscount ? (
        <>
          <div className="price-row price-total-row">
            <span className="price-label">Total ({quantity} items):</span>
            <span className="price-original">${originalTotal.toFixed(2)}</span>
            <span className="price-arrow">→</span>
            <span className="price-total">${totalPrice.toFixed(2)}</span>
          </div>
          <div className="price-row">
            <span className="price-savings">Save ${(originalTotal - totalPrice).toFixed(2)}</span>
          </div>
        </>
      ) : (
        <div className="price-row price-total-row">
          <span className="price-label">Total ({quantity} items):</span>
          <span className="price-total">${totalPrice.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function ProductItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, addToCart, currentUser, isLoadingProducts } = useApp();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(null);

  const product = products.find(p => p.id === parseInt(id));

  const activeVariants = (product?.variants ?? []).filter(v => v.active);
  const selectedVariant = activeVariants.find(v => v.id === selectedVariantId) ?? getDefaultVariant(product);
  const allowedQuantities = selectedVariant ? getAllowedQuantities(selectedVariant) : [];

  useEffect(() => {
    window.scrollTo(0, 0);
    sessionStorage.setItem('productsScrollProductId', String(id));
  }, [id]);

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

  if (isLoadingProducts) {
    return (
      <div className="product-item-container">
        <div className="product-not-found">
          <p>Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-item-container">
        <div className="product-not-found">
          <AlertCircle size={64} color="var(--color-danger)" />
          <h2>Product Not Found</h2>
          <p>The product you're looking for doesn't exist or has been removed.</p>
          <button onClick={() => navigate('/products')} className="btn-back">
            <ArrowLeft size={18} />
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  if (product.hidden && (hasRole(currentUser, 'CUSTOMER') || isGuest(currentUser))) {
    return (
      <div className="product-item-container">
        <div className="product-not-found">
          <AlertCircle size={64} color="var(--color-warning)" />
          <h2>Product Unavailable</h2>
          <p>This product is currently not available for viewing.</p>
          <button onClick={() => navigate('/products')} className="btn-back">
            <ArrowLeft size={18} />
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const images = getProductAllImages(product);
  const showStock = selectedVariant?.stockEnabled !== false;
  const isOutOfStock = showStock && Number(selectedVariant?.stock ?? 0) === 0;
  const basePrice = Number(selectedVariant?.basePrice ?? 0);

  const handleAddToCart = () => {
    if (selectedVariant) {
      addToCart(product, selectedVariant, selectedQuantity);
    }
  };

  return (
    <div className="product-item-container">
      <button onClick={() => navigate('/products')} className="btn-back">
        <ArrowLeft size={18} />
        Back to Products
      </button>

      <div className="product-detail-grid surface-card">
        <div className="product-gallery">
          <div className="main-image-container">
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
                className="main-product-image"
                controls
                autoPlay
                muted
                loop
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <img
                src={images[selectedImageIndex] ?? PRODUCT_FALLBACK_IMAGE}
                alt={product.name}
                className="main-product-image"
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
            <div className="thumbnail-container">
              {images.map((img, index) => (
                <div
                  key={index}
                  className={`thumbnail-wrapper ${selectedImageIndex === index ? 'thumbnail-active' : ''}`}
                  onClick={() => setSelectedImageIndex(index)}
                >
                  {isVideo(img) ? (
                    <>
                      <video src={img} className="thumbnail" onError={(e) => { e.target.style.display = 'none'; }} />
                      <div className="video-thumbnail-overlay">
                        <PlayCircle size={20} color="white" />
                      </div>
                    </>
                  ) : (
                    <img
                      src={img}
                      alt={`${product.name} ${index + 1}`}
                      className="thumbnail"
                      loading={index === selectedImageIndex ? 'eager' : 'lazy'}
                      onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          <div className="product-category-badge">{getProductCategoryLabel(product)}</div>
          <h1 className="product-title">{product.name}</h1>

          <div className="product-price-display">
            ${basePrice.toFixed(2)}
            {(selectedVariant?.priceBreaks?.length ?? 0) > 0 && (
              <span className="price-per-unit">/ each</span>
            )}
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

          <PriceBreaksTable variant={selectedVariant} />

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

          <DynamicPriceDisplay variant={selectedVariant} quantity={selectedQuantity} />

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

export default ProductItemPage;
