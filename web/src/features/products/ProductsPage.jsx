import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Filter, Star, MessageSquare } from 'lucide-react';
import ProductReviews from '../../components/product/ProductReviews';

function ProductsPage() {
  const { products, addToCart, currentUser } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Filter out hidden products for customers and guests
  const visibleProducts = currentUser.role === 'CUSTOMER' || currentUser.email === 'guest@smokestation.com'
    ? products.filter(p => !p.hidden)
    : products;
  
  const categories = ['All', ...new Set(visibleProducts.map(p => p.category))];
  const filteredProducts = selectedCategory === 'All' 
    ? visibleProducts 
    : visibleProducts.filter(p => p.category === selectedCategory);

  const getAverageRating = (product) => {
    if (!product.reviews || product.reviews.length === 0) return 0;
    const sum = product.reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / product.reviews.length).toFixed(1);
  };

  return (
    <div className="products-page-container">
      <div className="products-header">
        <div>
          <h2 className="page-title">Products</h2>
          <p className="page-subtitle">Browse our collection of quality products</p>
        </div>
        {currentUser && (
          <div className="user-welcome">
            Welcome, <span className="user-name">{currentUser.name}</span>
          </div>
        )}
      </div>

      <div className="category-filter">
        <div className="filter-label">
          <Filter size={18} />
          <span>Filter by Category</span>
        </div>
        <div className="category-buttons">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`category-btn ${selectedCategory === cat ? 'category-btn-active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="products-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <p>No products found in this category.</p>
          </div>
        ) : (
          filteredProducts.map(product => {
            const mainImage = product.images ? product.images[0] : product.image;
            const showStock = product.stockEnabled !== false;
            const averageRating = getAverageRating(product);
            const reviewCount = product.reviews?.length || 0;
            
            return (
              <div key={product.id} className="product-card">
                <div className="product-image-container">
                  <img 
                    src={mainImage} 
                    alt={product.name} 
                    className="product-image"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                    }}
                  />
                  {showStock && (
                    <div className="product-badge">
                      {product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                    </div>
                  )}
                </div>

                <div className="product-content">
                  <div className="product-header">
                    <h3 className="product-name">{product.name}</h3>
                    <span className="product-category">{product.category}</span>
                  </div>

                  {reviewCount > 0 && (
                    <div className="product-rating">
                      <div className="stars-small">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star
                            key={i}
                            size={14}
                            fill={i <= Math.round(averageRating) ? '#fbbf24' : 'none'}
                            color={i <= Math.round(averageRating) ? '#fbbf24' : '#9ca3af'}
                          />
                        ))}
                      </div>
                      <span className="rating-text">{averageRating}</span>
                      <span className="review-count-text">({reviewCount})</span>
                    </div>
                  )}

                  <p className="product-description">{product.description}</p>

                  <div className="product-footer">
                    <span className="product-price">${product.price.toFixed(2)}</span>
                    <div className="product-footer-actions">
                      <button
                        onClick={() => addToCart(product)}
                        disabled={showStock && product.stock === 0}
                        className="btn-add-to-cart"
                      >
                        {showStock && product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                      <button
                        onClick={() => setSelectedProduct(product.id)}
                        className="btn-view-reviews"
                        title="View reviews"
                      >
                        <MessageSquare size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reviews Modal/Section */}
      {selectedProduct && (
        <div className="reviews-modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="reviews-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reviews-modal-header">
              <h3>Product Reviews</h3>
              <button
                onClick={() => setSelectedProduct(null)}
                className="btn-close-modal"
              >
                ×
              </button>
            </div>
            <div className="reviews-modal-content">
              <ProductReviews productId={selectedProduct} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductsPage;