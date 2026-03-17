import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest, ROLES } from '../../utils/roles';
import { ArrowLeft, Star, ShoppingCart, Package, AlertCircle, Tag, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import ProductReviews from '../../components/product/ProductReviews';
import { PRODUCT_FALLBACK_IMAGE, getProductCategoryLabel, resolveQuantityDiscounts, getDiscountedUnitPrice } from './productsHelpers';

// Helper to check if a url is a video
const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};
import './ProductItemPage.css';

// Component to display available quantity discounts
function QuantityDiscountsTable({ product, discounts }) {
  if (!discounts || discounts.length === 0) return null;

  // Sort discounts by quantity
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

// Component to display dynamic price based on selected quantity
function DynamicPriceDisplay({ product, quantity, discounts }) {
  const basePrice = product.price;
  const originalTotal = basePrice * quantity;
  
  // Find matching discount rule
  const matchingDiscount = discounts.find((rule) => Math.abs(rule.quantity - quantity) < 1e-9);
  
  // Calculate discount on total amount
  let totalSavings = 0;
  if (matchingDiscount) {
    if (matchingDiscount.type === 'percent') {
      totalSavings = originalTotal * (matchingDiscount.value / 100);
    } else {
      // Fixed discount applies to the total, not per unit
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
            <span className="price-arrow">→</span>
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
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const fallbackImage = PRODUCT_FALLBACK_IMAGE;
  
  // Find the product by ID
  const product = products.find(p => p.id === parseInt(id));
  
  // Show loading state
  if (isLoadingProducts) {
    return (
      <div className="product-item-container">
        <div className="product-not-found">
          <p>Loading product...</p>
        </div>
      </div>
    );
  }
  
  // If product not found, show error
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
  
  // Check if product is hidden and user is customer/guest
  if (product.hidden && (currentUser.role === ROLES.CUSTOMER || isGuest(currentUser))) {
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
  
  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [fallbackImage];
  const showStock = product.stockEnabled !== false;
  const isOutOfStock = showStock && product.stock === 0;
  const allowedQuantities =
    product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0
      ? product.allowedQuantitiesOverride
      : product.category?.allowedQuantities || [];

  // Get quantity discounts for this product
  const quantityDiscounts = resolveQuantityDiscounts(product);
  
  // Debug: Log discount data (remove after debugging)
  console.log('Product discount debug:', {
    productName: product.name,
    productQuantityDiscountsOverride: product.quantityDiscountsOverride,
    categoryName: product.category?.name,
    categoryQuantityDiscounts: product.category?.quantityDiscounts,
    resolvedDiscounts: quantityDiscounts
  });
  
  // Calculate average rating
  const getAverageRating = () => {
    if (!product.reviews || product.reviews.length === 0) return 0;
    const sum = product.reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / product.reviews.length).toFixed(1);
  };
  
  const averageRating = getAverageRating();
  const reviewCount = product.reviews?.length || 0;

  useEffect(() => {
    if (allowedQuantities.length > 0) {
      setSelectedQuantity(allowedQuantities[0]);
    } else {
      setSelectedQuantity(1);
    }
  }, [product.id, allowedQuantities.length]);
  
  const handleAddToCart = () => {
    addToCart(product, selectedQuantity);
  };
  
  return (
    <div className="product-item-container">
      {/* Back Button */}
      <button onClick={() => navigate('/products')} className="btn-back">
        <ArrowLeft size={18} />
        Back to Products
      </button>
      
      {/* Product Detail Section */}
      <div className="product-detail-grid surface-card">
        {/* Image Gallery */}
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
        
        {/* Product Info */}
        <div className="product-info">
          <div className="product-category-badge">{getProductCategoryLabel(product)}</div>
          <h1 className="product-title">{product.name}</h1>
          
          {/* HIDDEN: Rating Summary - may re-enable later */}
          {/* {reviewCount > 0 && (
            <div className="rating-summary">
              <div className="stars-display">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    size={20}
                    fill={i <= Math.round(averageRating) ? '#fbbf24' : 'none'}
                    color={i <= Math.round(averageRating) ? '#fbbf24' : '#9ca3af'}
                  />
                ))}
              </div>
              <span className="rating-value">{averageRating}</span>
              <span className="review-count">({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})</span>
            </div>
          )} */}
          
          <div className="product-price-display">
            ${product.price.toFixed(2)}
            {quantityDiscounts.length > 0 && <span className="price-per-unit">/ each</span>}
          </div>

          {/* Quantity Discounts Table */}
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

          {/* Dynamic Price Display */}
          <DynamicPriceDisplay 
            product={product} 
            quantity={selectedQuantity} 
            discounts={quantityDiscounts} 
          />

          {/* Add to Cart Button */}
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
    </div>
  );
}

export default ProductItemPage;