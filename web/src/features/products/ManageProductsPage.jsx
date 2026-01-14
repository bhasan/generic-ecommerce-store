import React, { useState, useEffect } from 'react';
import './ProductCard.css';
import './ManageProductsPage.css';
import { useApp } from '../../context/AppContext';
import { Plus, Edit, Trash2, X, Save, Image as ImageIcon, Eye, EyeOff, Upload } from 'lucide-react';

function ManageProductsPage() {
  const {
    currentUser,
    products,
    isLoadingProducts,
    loadProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    categories,
    isLoadingCategories,
    loadCategories
  } = useApp();
  
  // Refresh products on page load
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [formData, setFormData] = useState({
    name: '', 
    categoryId: '', 
    price: '', 
    description: '', 
    images: [''],
    stock: '',
    stockEnabled: true,
    hidden: false
  });

  const getCategoryLabel = (category) => {
    if (!category) return 'Uncategorized';
    if (category.parent) return `${category.parent.name} > ${category.name}`;
    return category.name;
  };

  const getProductCategoryLabel = (product) => {
    if (product?.category && typeof product.category === 'object') {
      return getCategoryLabel(product.category);
    }
    return product?.category || 'Uncategorized';
  };

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const canManageProducts = userRoles.includes('ADMIN') || userRoles.includes('MANAGEMENT');
  
  const handleEdit = (product) => {
    const selectedCategoryId = product.categoryId || product.category?.id || '';
    const selectedCategoryLabel = product.category ? getCategoryLabel(product.category) : '';
    setEditingId(product.id);
    setFormData({
      ...product,
      categoryId: selectedCategoryId,
      images: product.images || [product.image],
      stockEnabled: product.stockEnabled !== false,
      hidden: product.hidden || false
    });
    setCategoryQuery(selectedCategoryLabel);
    setShowAddForm(false);
  };

  const handleSave = () => {
    if (!formData.name || !formData.categoryId || !formData.price) {
      alert('Please fill in all required fields');
      return;
    }

    if (formData.stockEnabled && !formData.stock) {
      alert('Please enter stock quantity or disable stock tracking');
      return;
    }

    const productData = {
      ...formData,
      categoryId: parseInt(formData.categoryId, 10),
      price: parseFloat(formData.price),
      stock: formData.stockEnabled ? parseInt(formData.stock) : 0,
      images: formData.images.filter(img => img.trim() !== ''),
      image: formData.images[0]
    };

    if (editingId) {
      updateProduct(editingId, productData);
      setEditingId(null);
    } else {
      addProduct(productData);
      setShowAddForm(false);
    }
    setFormData({ 
      name: '', 
      categoryId: '', 
      price: '', 
      description: '', 
      images: [''],
      stock: '',
      stockEnabled: true,
      hidden: false
    });
    setCategoryQuery('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({ 
      name: '', 
      categoryId: '', 
      price: '', 
      description: '', 
      images: [''],
      stock: '',
      stockEnabled: true,
      hidden: false
    });
    setCategoryQuery('');
  };

  const handleDelete = (productId, productName) => {
    if (window.confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      deleteProduct(productId);
    }
  };

  const addImageField = () => {
    setFormData({ ...formData, images: [...formData.images, ''] });
  };

  const removeImageField = (index) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData({ ...formData, images: newImages.length > 0 ? newImages : [''] });
  };

  const updateImageField = (index, value) => {
    const newImages = [...formData.images];
    newImages[index] = value;
    setFormData({ ...formData, images: newImages });
  };

  const handleImageUpload = (index, event) => {
    const file = event.target.files[0];
    if (file) {
      // In a real app, you would upload to a server or cloud storage
      // For now, we'll just show a placeholder
      const reader = new FileReader();
      reader.onloadend = () => {
        updateImageField(index, reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleHidden = (productId, currentHidden) => {
    updateProduct(productId, { hidden: !currentHidden });
  };

  return (
    <div className="manage-products-container">
      <div className="manage-products-header">
        <div>
          <h2 className="page-title">Manage Products</h2>
          <p className="page-subtitle">Add, edit, or remove products from your inventory</p>
        </div>
        {canManageProducts && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-add-product"
            disabled={showAddForm || editingId}
          >
            <Plus size={20} />
            <span>Add New Product</span>
          </button>
        )}
      </div>

      {canManageProducts && (showAddForm || editingId) && (
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
              <div className="category-select">
                <input
                  id="category"
                  type="text"
                  placeholder="Search categories..."
                  value={categoryQuery}
                  onFocus={() => setShowCategoryDropdown(true)}
                  onChange={(e) => {
                    setCategoryQuery(e.target.value);
                    setShowCategoryDropdown(true);
                  }}
                  className="form-input"
                />
                {showCategoryDropdown && (
                  <div className="category-dropdown">
                    {isLoadingCategories ? (
                      <div className="category-option">Loading...</div>
                    ) : categories.length === 0 ? (
                      <div className="category-option">No categories</div>
                    ) : (
                      categories
                        .map(category => ({ ...category, label: getCategoryLabel(category) }))
                        .filter(category => category.label.toLowerCase().includes(categoryQuery.toLowerCase()))
                        .map(category => (
                          <button
                            key={category.id}
                            type="button"
                            className="category-option"
                            onClick={() => {
                              setFormData({ ...formData, categoryId: category.id });
                              setCategoryQuery(category.label);
                              setShowCategoryDropdown(false);
                            }}
                          >
                            {category.label}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
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
              <label htmlFor="stock">Stock Quantity</label>
              <div className={`stock-control-group ${!formData.stockEnabled ? 'stock-disabled' : ''}`}>
                <input
                  id="stock"
                  type="number"
                  min="0"
                  placeholder={formData.stockEnabled ? "0" : "Disabled"}
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  className="form-input"
                  disabled={!formData.stockEnabled}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.stockEnabled}
                    onChange={(e) => setFormData({ ...formData, stockEnabled: e.target.checked })}
                  />
                  <span>Track Stock</span>
                </label>
              </div>
            </div>

            <div className="form-group form-group-full">
              <label>Product Images</label>
              <div className="image-fields">
                {formData.images.map((image, index) => (
                  <div key={index} className="image-field-row">
                    <div className="image-input-group">
                      <input
                        type="text"
                        placeholder={`Image URL ${index + 1}`}
                        value={image}
                        onChange={(e) => updateImageField(index, e.target.value)}
                        className="form-input"
                      />
                      <div className="image-upload-separator">or</div>
                      <label className="btn-upload-image">
                        <Upload size={16} />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(index, e)}
                          className="file-input-hidden"
                        />
                      </label>
                    </div>
                    {formData.images.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeImageField(index)}
                        className="btn-remove-image"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addImageField}
                  className="btn-add-image"
                >
                  <ImageIcon size={16} />
                  <span>Add Another Image</span>
                </button>
              </div>
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

            <div className="form-group form-group-full">
              <label className="checkbox-label checkbox-label-large">
                <input
                  type="checkbox"
                  checked={formData.hidden}
                  onChange={(e) => setFormData({ ...formData, hidden: e.target.checked })}
                />
                <span>Hide this product from the Products page</span>
              </label>
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
        {isLoadingProducts ? (
          <div className="empty-state">
            <p>Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <p>No products found. Add your first product to get started!</p>
          </div>
        ) : (
          products.map(product => {
            const mainImage = product.images ? product.images[0] : product.image;
            const imageCount = product.images ? product.images.length : 1;
            const showStock = product.stockEnabled !== false;
            
            return (
              <div key={product.id} className={`product-card ${product.hidden ? 'product-card-hidden' : ''}`}>
                <div className="product-image-container">
                  <img 
                    src={mainImage} 
                    alt={product.name} 
                    className="product-image"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                    }}
                  />
                  {imageCount > 1 && (
                    <div className="product-badge product-badge-images">
                      <ImageIcon size={12} /> {imageCount} images
                    </div>
                  )}
                  {product.hidden && (
                    <div className="product-badge product-badge-hidden">
                      Hidden
                    </div>
                  )}
                  {showStock && (
                    <div className="product-badge product-badge-stock">
                      {product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                    </div>
                  )}
                </div>

                <div className="product-content">
                  <div className="product-header">
                    <h3 className="product-name">{product.name}</h3>
                  <span className="product-category">{getProductCategoryLabel(product)}</span>
                  </div>

                  <p className="product-description">{product.description}</p>

                  <div className="product-meta">
                    <div className="meta-item">
                      <span className="meta-label">Price</span>
                      <span className="product-price">${product.price}</span>
                    </div>
                    {showStock && (
                      <div className="meta-item">
                        <span className="meta-label">Stock</span>
                        <span className={`stock-badge ${product.stock === 0 ? 'stock-empty' : product.stock < 10 ? 'stock-low' : 'stock-good'}`}>
                          {product.stock} units
                        </span>
                      </div>
                    )}
                  </div>

                  {canManageProducts && (
                    <div className="product-actions">
                      <button
                        onClick={() => toggleHidden(product.id, product.hidden)}
                        className="btn-visibility"
                        title={product.hidden ? 'Show product' : 'Hide product'}
                      >
                        {product.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
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
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ManageProductsPage;