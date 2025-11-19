import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Star, ShoppingCart, Package, AlertCircle } from 'lucide-react';
import ProductReviews from '../../components/product/ProductReviews';
import './ProductItemPage.css';

function ProductItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, addToCart, currentUser } = useApp();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // Find the product by ID
  const product = products.find(p => p.id === parseInt(id));
  
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
  if (product.hidden && (currentUser.role === 'CUSTOMER' || currentUser.email === 'guest@smokestation.com')) {
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
  
  const images = product.images || [product.image];
  const showStock = product.stockEnabled !== false;
  const isOutOfStock = showStock && product.stock === 0;
  
  // Calculate average rating
  const getAverageRating = () => {
    if (!product.reviews || product.reviews.length === 0) return 0;
    const sum = product.reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / product.reviews.length).toFixed(1);
  };
  
  const averageRating = getAverageRating();
  const reviewCount = product.reviews?.length || 0;
  
  const handleAddToCart = () => {
    addToCart(product);
  };
  
  return (
    <div className="product-item-container">
      {/* Back Button */}
      <button onClick={() => navigate('/products')} className="btn-back">
        <ArrowLeft size={18} />
        Back to Products
      </button>
      
      {/* Product Detail Section */}
      <div className="product-detail-grid">
        {/* Image Gallery */}
        <div className="product-gallery">
          <div className="main-image-container">
            <img 
              src={images[selectedImageIndex]} 
              alt={product.name}
              className="main-product-image"
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/600x400?text=No+Image';
              }}
            />
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
                <img
                  key={index}
                  src={img}
                  alt={`${product.name} ${index + 1}`}
                  className={`thumbnail ${selectedImageIndex === index ? 'thumbnail-active' : ''}`}
                  onClick={() => setSelectedImageIndex(index)}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/100x100?text=No+Image';
                  }}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Product Info */}
        <div className="product-info">
          <div className="product-category-badge">{product.category}</div>
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
          </div>
          
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
          
          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
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