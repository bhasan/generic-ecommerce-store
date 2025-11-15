import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Edit, Trash2, X, Save } from 'lucide-react';

function ManageProductsPage() {
  const { currentUser, products, addProduct, updateProduct, deleteProduct } = useApp();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', category: '', price: '', description: '', image: '', stock: ''
  });
  
  const handleEdit = (product) => {
    setEditingId(product.id);
    setFormData(product);
    setShowAddForm(false);
  };

  const handleSave = () => {
    if (!formData.name || !formData.category || !formData.price || !formData.stock) {
      alert('Please fill in all required fields');
      return;
    }

    if (editingId) {
      updateProduct(editingId, formData);
      setEditingId(null);
    } else {
      addProduct({ ...formData, price: parseFloat(formData.price), stock: parseInt(formData.stock) });
      setShowAddForm(false);
    }
    setFormData({ name: '', category: '', price: '', description: '', image: '', stock: '' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({ name: '', category: '', price: '', description: '', image: '', stock: '' });
  };

  const handleDelete = (productId, productName) => {
    if (window.confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      deleteProduct(productId);
    }
  };

  return (
    <div className="manage-products-container">
      <div className="manage-products-header">
        <div>
          <h2 className="page-title">Manage Products</h2>
          <p className="page-subtitle">Add, edit, or remove products from your inventory</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-add-product"
          disabled={showAddForm || editingId}
        >
          <Plus size={20} />
          <span>Add New Product</span>
        </button>
      </div>

      {(showAddForm || editingId) && (
        <div className="product-form-card">
          <div className="form-header">
            <h3 className="form-title">
              {editingId ? 'Edit Product' : 'Add New Product'}
            </h3>
            <button onClick={handleCancel} className="btn-close">
              <X size={20} />
            </button>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="name">Product Name *</label>
              <input
                id="name"
                type="text"
                placeholder="e.g., Wireless Headphones"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category *</label>
              <input
                id="category"
                type="text"
                placeholder="e.g., Electronics"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="price">Price ($) *</label>
              <input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="stock">Stock Quantity *</label>
              <input
                id="stock"
                type="number"
                min="0"
                placeholder="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="image">Image URL</label>
              <input
                id="image"
                type="text"
                placeholder="https://example.com/image.jpg"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                placeholder="Describe the product features and details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-textarea"
                rows={4}
              />
            </div>
          </div>

          <div className="form-actions">
            <button onClick={handleSave} className="btn-save">
              <Save size={18} />
              <span>Save Product</span>
            </button>
            <button onClick={handleCancel} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="products-grid">
        {products.length === 0 ? (
          <div className="empty-state">
            <p>No products found. Add your first product to get started!</p>
          </div>
        ) : (
          products.map(product => (
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

                <div className="product-meta">
                  <div className="meta-item">
                    <span className="meta-label">Price</span>
                    <span className="product-price">${product.price}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Stock</span>
                    <span className={`stock-badge ${product.stock === 0 ? 'stock-empty' : product.stock < 10 ? 'stock-low' : 'stock-good'}`}>
                      {product.stock} units
                    </span>
                  </div>
                </div>

                <div className="product-actions">
                  <button
                    onClick={() => handleEdit(product)}
                    className="btn-edit"
                    disabled={editingId !== null || showAddForm}
                  >
                    <Edit size={16} />
                    <span>Edit</span>
                  </button>
                  {currentUser.role === 'ADMIN' && (
                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      className="btn-delete"
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ManageProductsPage;