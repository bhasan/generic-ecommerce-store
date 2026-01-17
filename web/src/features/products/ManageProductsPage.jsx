import React, { useState, useEffect } from 'react';
import './ProductCard.css';
import './ManageProductsPage.css';
import { useApp } from '../../context/AppContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import * as productsApi from '../../services/productsApi';
import * as categoriesApi from '../../services/categoriesApi';
import { Plus, Edit, Trash2, X, Save, Image as ImageIcon, Eye, EyeOff, Upload, GripVertical } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const fallbackImage = '/images/smokestationtitle.png';

function SortableProductCard({
  product,
  dragEnabled,
  onToggleHidden,
  onEdit,
  onDeleteClick,
  canDelete,
  canManage,
  getCategoryLabel,
  editingDisabled
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: !dragEnabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  
  const mainImage = (product.images && product.images.length > 0 ? product.images[0] : product.image) || fallbackImage;
  const imageCount = product.images ? product.images.length : 1;
  const showStock = product.stockEnabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-card ${product.hidden ? 'product-card-hidden' : ''} ${isDragging ? 'product-card-dragging' : ''}`}
    >
      <div className="product-image-container">
        <img
          src={mainImage}
          alt={product.name}
          className="product-image"
          onError={(e) => {
            e.target.src = fallbackImage;
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
          <span className="product-category">{getCategoryLabel(product)}</span>
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

        {canManage && (
          <div className="product-actions">
            {dragEnabled && (
              <button type="button" className="product-drag-handle" {...attributes} {...listeners} aria-label="Reorder product">
                <GripVertical size={16} />
              </button>
            )}
            <button
              onClick={() => onToggleHidden(product.id, product.hidden)}
              className="btn-visibility"
              title={product.hidden ? 'Show product' : 'Hide product'}
            >
              {product.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              onClick={() => onEdit(product)}
              className="btn-edit"
              disabled={editingDisabled}
            >
              <Edit size={16} />
              <span>Edit</span>
            </button>
            {canDelete && (
              <button
                onClick={() => onDeleteClick(product.id, product.name)}
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
}

function SortableProductListItem({
  product,
  dragEnabled,
  onToggleHidden,
  onEdit,
  onDeleteClick,
  canDelete,
  canManage,
  getCategoryLabel,
  editingDisabled
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: !dragEnabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const mainImage = (product.images && product.images.length > 0 ? product.images[0] : product.image) || fallbackImage;
  const showStock = product.stockEnabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-list-item ${product.hidden ? 'product-list-item-hidden' : ''} ${isDragging ? 'product-list-item-dragging' : ''}`}
    >
      <div className="product-list-image">
        <img
          src={mainImage}
          alt={product.name}
          onError={(e) => {
            e.target.src = fallbackImage;
          }}
        />
      </div>

      <div className="product-list-content">
        <div className="product-list-header">
          <div>
            <h3 className="product-list-name">{product.name}</h3>
            <div className="product-list-meta">
              <span className="product-list-category">{getCategoryLabel(product)}</span>
              {showStock && (
                <span className={`product-list-stock ${product.stock === 0 ? 'is-out' : ''}`}>
                  {product.stock === 0 ? 'Out of Stock' : `${product.stock} units`}
                </span>
              )}
              {product.hidden && <span className="product-list-hidden">Hidden</span>}
            </div>
          </div>
          <span className="product-list-price">${product.price}</span>
        </div>
        {product.description && <p className="product-list-description">{product.description}</p>}
      </div>

      {canManage && (
        <div className="product-list-actions">
          {dragEnabled && (
            <button type="button" className="product-drag-handle" {...attributes} {...listeners} aria-label="Reorder product">
              <GripVertical size={16} />
            </button>
          )}
          <button
            onClick={() => onToggleHidden(product.id, product.hidden)}
            className="btn-visibility"
            title={product.hidden ? 'Show product' : 'Hide product'}
          >
            {product.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            onClick={() => onEdit(product)}
            className="btn-edit"
            disabled={editingDisabled}
          >
            <Edit size={16} />
            <span>Edit</span>
          </button>
          {canDelete && (
            <button
              onClick={() => onDeleteClick(product.id, product.name)}
              className="btn-delete"
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SortableCategoryGroup({ category, isChild, onEdit, onDelete, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`manage-category-group ${isChild ? 'manage-category-group-child' : ''} ${isDragging ? 'manage-category-group-dragging' : ''}`}
    >
      <div className="manage-category-header">
        <div className="manage-category-title">
          <button type="button" className="manage-category-drag-handle" {...attributes} {...listeners} aria-label="Reorder category">
            <GripVertical size={16} />
          </button>
        <div>
            <h3>{category.name}</h3>
            {category.description && <p>{category.description}</p>}
          </div>
        </div>
        {(onEdit || onDelete) && (
          <div className="manage-category-actions">
            {onEdit && (
              <button onClick={() => onEdit(category)} className="btn-edit">
                <Edit size={14} />
                <span>Edit</span>
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(category)} className="btn-delete">
                <Trash2 size={14} />
                <span>Delete</span>
        </button>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function ProductFormModal({
  isOpen,
  title,
  formData,
  setFormData,
  categoryQuery,
  setCategoryQuery,
  showCategoryDropdown,
  setShowCategoryDropdown,
  isLoadingCategories,
  categories,
  getCategoryLabel,
  onSave,
  onCancel,
  addImageField,
  removeImageField,
  updateImageField,
  handleImageUpload
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="product-form-card">
          <div className="form-header">
            <h3 className="form-title">{title}</h3>
            <button onClick={onCancel} className="btn-close">
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
            <button onClick={onSave} className="btn-save">
              <Save size={18} />
              <span>Save Product</span>
            </button>
            <button onClick={onCancel} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [deleteProductModalOpen, setDeleteProductModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [orderedProducts, setOrderedProducts] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [childCategoriesByParent, setChildCategoriesByParent] = useState({});
  const [productsByCategory, setProductsByCategory] = useState({});
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
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    const savedView = localStorage.getItem('manageProductsViewMode');
    return savedView === 'compact' || savedView === 'list' ? savedView : 'compact';
  });

  useEffect(() => {
    localStorage.setItem('manageProductsViewMode', viewMode);
  }, [viewMode]);

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

  useEffect(() => {
    const sorted = [...products].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    setOrderedProducts(sorted);

    const groupedProducts = sorted.reduce((acc, product) => {
      const categoryId = product.categoryId || product.category?.id || 'uncategorized';
      if (!acc[categoryId]) acc[categoryId] = [];
      acc[categoryId].push(product);
      return acc;
    }, {});
    setProductsByCategory(groupedProducts);
  }, [products]);

  useEffect(() => {
    const topLevel = categories
      .filter(category => !category.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    const childrenMap = categories.reduce((acc, category) => {
      if (category.parentId) {
        acc[category.parentId] = acc[category.parentId] || [];
        acc[category.parentId].push(category);
      }
      return acc;
    }, {});

    Object.keys(childrenMap).forEach(parentId => {
      childrenMap[parentId].sort((a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      );
    });

    setTopLevelCategories(topLevel);
    setChildCategoriesByParent(childrenMap);
  }, [categories]);
  
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

  const handleDeleteClick = (productId, productName) => {
    setProductToDelete({ id: productId, name: productName });
    setDeleteProductModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!productToDelete) return;
    deleteProduct(productToDelete.id);
    setDeleteProductModalOpen(false);
    setProductToDelete(null);
  };

  const handleDeleteCancel = () => {
    setDeleteProductModalOpen(false);
    setProductToDelete(null);
  };

  const persistSortOrder = async (list) => {
    const updates = list
      .map((item, index) =>
        item.sortOrder !== index
          ? productsApi.updateProduct(item.id, { sortOrder: index })
          : null
      )
      .filter(Boolean);

    if (updates.length) {
      await Promise.all(updates);
      await loadProducts();
    }
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedProducts.findIndex(item => item.id === active.id);
    const newIndex = orderedProducts.findIndex(item => item.id === over.id);
    const next = arrayMove(orderedProducts, oldIndex, newIndex);
    setOrderedProducts(next);
    await persistSortOrder(next);
  };

  const persistCategorySortOrder = async (list) => {
    const updates = list
      .map((item, index) =>
        item.sortOrder !== index
          ? categoriesApi.updateCategory(item.id, { sortOrder: index })
          : null
      )
      .filter(Boolean);

    if (updates.length) {
      await Promise.all(updates);
      await loadCategories();
    }
  };

  const handleCategoryDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = topLevelCategories.findIndex(item => item.id === active.id);
    const newIndex = topLevelCategories.findIndex(item => item.id === over.id);
    const next = arrayMove(topLevelCategories, oldIndex, newIndex);
    setTopLevelCategories(next);
    await persistCategorySortOrder(next);
  };

  const handleProductDragEnd = async (categoryId, { active, over }) => {
    if (!over || active.id === over.id) return;
    const list = productsByCategory[categoryId] || [];
    const oldIndex = list.findIndex(item => item.id === active.id);
    const newIndex = list.findIndex(item => item.id === over.id);
    const next = arrayMove(list, oldIndex, newIndex);
    setProductsByCategory({ ...productsByCategory, [categoryId]: next });
    await persistSortOrder(next);
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

  const renderProductsCollection = (categoryId) => {
    const list = productsByCategory[categoryId] || [];
    if (list.length === 0) return null;

    return (
      <div className={viewMode === 'list' ? 'products-list' : `products-grid ${viewMode === 'compact' ? 'products-grid-compact' : ''}`}>
        {list.map(product =>
          viewMode === 'list' ? (
            <SortableProductListItem
              key={product.id}
              product={product}
              dragEnabled={canManageProducts}
              canManage={canManageProducts}
              canDelete={currentUser.role === 'ADMIN'}
              onToggleHidden={toggleHidden}
              onEdit={handleEdit}
              onDeleteClick={handleDeleteClick}
              getCategoryLabel={getProductCategoryLabel}
              editingDisabled={editingId !== null || showAddForm}
            />
          ) : (
            <SortableProductCard
              key={product.id}
              product={product}
              dragEnabled={canManageProducts}
              canManage={canManageProducts}
              canDelete={currentUser.role === 'ADMIN'}
              onToggleHidden={toggleHidden}
              onEdit={handleEdit}
              onDeleteClick={handleDeleteClick}
              getCategoryLabel={getProductCategoryLabel}
              editingDisabled={editingId !== null || showAddForm}
            />
          )
        )}
      </div>
    );
  };

  return (
    <div className="manage-products-container">
      <div className="manage-products-header">
        <div>
          <h2 className="page-title">Manage Products</h2>
          <p className="page-subtitle">Add, edit, or remove products from your inventory</p>
        </div>
        <div className="manage-products-header-actions">
          <div className="products-view-toggle" role="group" aria-label="Products view">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
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
      </div>

      {canManageProducts && (
        <ProductFormModal
          isOpen={showAddForm || editingId}
          title={editingId ? 'Edit Product' : 'Add New Product'}
          formData={formData}
          setFormData={setFormData}
          categoryQuery={categoryQuery}
          setCategoryQuery={setCategoryQuery}
          showCategoryDropdown={showCategoryDropdown}
          setShowCategoryDropdown={setShowCategoryDropdown}
          isLoadingCategories={isLoadingCategories}
          categories={categories}
          getCategoryLabel={getCategoryLabel}
          onSave={handleSave}
          onCancel={handleCancel}
          addImageField={addImageField}
          removeImageField={removeImageField}
          updateImageField={updateImageField}
          handleImageUpload={handleImageUpload}
        />
      )}

      {isLoadingProducts || isLoadingCategories ? (
          <div className="empty-state">
            <p>Loading products...</p>
          </div>
      ) : orderedProducts.length === 0 ? (
          <div className="empty-state">
            <p>No products found. Add your first product to get started!</p>
          </div>
        ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={topLevelCategories.map(item => item.id)} strategy={verticalListSortingStrategy}>
            <div className="manage-products-categories">
              {topLevelCategories.map(category => (
                <SortableCategoryGroup
                  key={category.id}
                  category={category}
                >
                  <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleProductDragEnd(category.id, event)}
                  >
                    <SortableContext
                      items={(productsByCategory[category.id] || []).map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {renderProductsCollection(category.id)}
                    </SortableContext>
                  </DndContext>

                  {(childCategoriesByParent[category.id] || []).map(childCategory => (
                    <section key={childCategory.id} className="manage-subcategory-group">
                      <div className="manage-subcategory-header">
                        <h4>{childCategory.name}</h4>
                        {childCategory.description && <p>{childCategory.description}</p>}
                      </div>
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleProductDragEnd(childCategory.id, event)}
                      >
                        <SortableContext
                          items={(productsByCategory[childCategory.id] || []).map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {renderProductsCollection(childCategory.id)}
                        </SortableContext>
                      </DndContext>
                    </section>
                  ))}
                </SortableCategoryGroup>
              ))}
                  </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Delete Product Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteProductModalOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Product"
        message={
          <>
            Are you sure you want to delete <strong>"{productToDelete?.name || ''}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}

export default ManageProductsPage;