import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Filter } from 'lucide-react';

function ProductsPage() {
  const { products, addToCart, currentUser } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const categories = ['All', ...new Set(products.map(p => p.category))];
  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

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
          filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              <div className="product-image-container">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="product-image"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                  }}
                />
                <div className="product-badge">
                  {product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                </div>
              </div>

              <div className="product-content">
                <div className="product-header">
                  <h3 className="product-name">{product.name}</h3>
                  <span className="product-category">{product.category}</span>
                </div>

                <p className="product-description">{product.description}</p>

                <div className="product-footer">
                  <span className="product-price">${product.price.toFixed(2)}</span>
                  <button
                    onClick={() => addToCart(product)}
                    disabled={product.stock === 0}
                    className="btn-add-to-cart"
                  >
                    {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProductsPage;