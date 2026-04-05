import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest } from '../../utils/roles';
import { ArrowLeft, Star, ShoppingCart, Package, AlertCircle, Tag, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import ProductReviews from '../../components/product/ProductReviews';
import { PRODUCT_FALLBACK_IMAGE, getProductCategoryLabel, resolveQuantityDiscounts, getDiscountedUnitPrice } from './productsHelpers';
import ProductMediaModal from './ProductMediaModal';
import './ProductItemPage.css';
import { hasRole } from '../../utils/roles';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function QuantityDiscountsTable({ product, discounts }) {
  if (!discounts || discounts.length === 0) return null;

  const sortedDiscounts = [...discounts].sort((a, b) => a.quantity - b.quantity);

  return (
    <div className="quantity-discounts-table">
      <div className="discounts-header">
        <Tag size={16} />
        <span>Quantity Discounts</span>
      </div>
      <div className="discounts-list">
        {sortedDiscounts.map((discount, index) => {
          const discountLabel = discount.type === 'percent'
            ? `${discount.value}% off`
            : `$${discount.value.toFixed(2)} off`;

          return (
            <div key={index} className="discount-tier">
              <span className="discount-qty">Buy {discount.quantity}:</span>
              <span className="discount-value">{discountLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DynamicPriceDisplay({ product, quantity, discounts }) {
  const basePrice = product.price;
  const originalTotal = basePrice * quantity;

  const matchingDiscount = discounts.find((rule) => Math.abs(rule.quantity - quantity) < 1e-9);

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
    <div className="dynamic-price-display">
      {hasDiscount ? (
        <>
          <div className="price-row price-total-row">
            <span className="price-label">Total ({quantity} items):</span>
            <span className="price-original">${originalTotal.toFixed(2)}</span>
            <span className="price-arrow">â†’</span>
            <span className="price-total">${totalPrice.toFixed(2)}</span>
          </div>
          <div className="price-row">
            <span className="price-savings">Save ${totalSavings.toFixed(2)}</span>
          </div>
        </>
      ) : (
        <div className="price-row price-total-row">
          <span className="price-label">Total ({quantity} items):</span>
          <span className="price-total">${originalTotal.toFixed(2)}</span>
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
  const fallbackImage = PRODUCT_FALLBACK_IMAGE;

  const product = products.find(p => p.id === parseInt(id));

  const allowedQuantities =
    product?.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0
      ? product.allowedQuantitiesOverride
      : product?.category?.allowedQuantities || [];

  useEffect(() => {
    window.scrollTo(0, 0);
    sessionStorage.setItem('productsScrollProductId', String(id));
  }, [id]);

  useEffect(() => {
    if (allowedQuantities.length > 0) {
      setSelectedQuantity(allowedQuantities[0]);
    } else {
      setSelectedQuantity(1);
    }
  }, [product?.id, allowedQuantities.length]);

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

  // Use the shared helper here so hidden-product gating stays aligned with the
  // repo's mixed legacy/new role representations.
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
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <img
                src={images[selectedImageIndex]}
                alt={product.name}
                className="main-product-image"
                style={{ cursor: 'pointer' }}
                onClick={() => setMediaModalOpen(true)}
                onError={(e) => {
                  e.target.src = fallbackImage;
                }}
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
            {/* HIDDEN: Stock badge - may re-enable later */}
            {/* {showStock && (
              <div className={`stock-badge ${isOutOfStock ? 'out-of-stock' : product.stock <= 10 ? 'low-stock' : 'in-stock'}`}>
                <Package size={16} />
                {isOutOfStock ? 'Out of Stock' : product.stock <= 10 ? `Only ${product.stock} left` : 'In Stock'}
              </div>
            )} */}
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
                      <video
                        src={img}
                        className="thumbnail"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
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
                      onError={(e) => {
                        e.target.src = fallbackImage;
                      }}
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
            ${product.price.toFixed(2)}
            {quantityDiscounts.length > 0 && <span className="price-per-unit">/ each</span>}
          </div>

          <QuantityDiscountsTable product={product} discounts={quantityDiscounts} />

          <p className="product-description-full">{product.description}</p>

          {/* HIDDEN: Stock Information - may re-enable later */}
          {/* {showStock && (
            <div className="stock-info">
              <div className={`stock-indicator ${isOutOfStock ? 'indicator-out' : product.stock <= 10 ? 'indicator-low' : 'indicator-in'}`}></div>
              <span className="stock-text">
                {isOutOfStock ? 'Out of stock' : product.stock <= 10 ? `Low stock - only ${product.stock} remaining` : 'In stock'}
              </span>
            </div>
          )} */}

          <div className="quantity-selector">
            <label className="quantity-label">Quantity</label>
            {allowedQuantities.length > 0 ? (
              <select
                value={selectedQuantity}
                onChange={(e) => setSelectedQuantity(parseFloat(e.target.value))}
                className="quantity-select"
              >
                {allowedQuantities.map((quantity) => (
                  <option key={quantity} value={quantity}>
                    {quantity}
                  </option>
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

          <DynamicPriceDisplay
            product={product}
            quantity={selectedQuantity}
            discounts={quantityDiscounts}
          />

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

      {/* HIDDEN: Reviews Section - may re-enable later */}
      {/* <div className="reviews-section">
        <h2 className="reviews-section-title">Customer Reviews</h2>
        <ProductReviews productId={product.id} />
      </div> */}

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
