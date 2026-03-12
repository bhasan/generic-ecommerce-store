import React, { useState, useEffect } from 'react';
import './ProductCard.css';
import './ProductsShared.css';
import './ProductsPageAdmin.css';
import { useApp } from '../../context/AppContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import * as productsApi from '../../services/productsApi';
import * as categoriesApi from '../../services/categoriesApi';
import * as uploadApi from '../../services/uploadApi';
import { Plus, Edit, Trash2, Image as ImageIcon, Eye, EyeOff, GripVertical } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProductsHeader from './ProductsHeader';
import ProductFormModal from './ProductFormModal';
import MediaLibraryModal from '../../components/common/MediaLibraryModal';
import EmptyState from '../../components/common/EmptyState';
import ProductImage from './ProductImage';
import CategoriesSection from '../dashboard/components/CategoriesSection';
import { formatQuantityDiscounts, getCategoryLabel, getProductCategoryLabel, getProductImageSrc, parseQuantityDiscounts } from './productsHelpers';

function SortableProductCard({
  product,
  dragEnabled,
  onToggleHidden,
  onEdit,
  onDeleteClick,
  canDelete,
  canManage,
  getProductLabel,
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
  
  const mainImage = getProductImageSrc(product);
  const imageCount = product.images ? product.images.length : 1;
  const showStock = product.stockEnabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-card ${product.hidden ? 'product-card-hidden' : ''} ${isDragging ? 'product-card-dragging' : ''}`}
    >
      <div className="product-image-container">
        <ProductImage src={mainImage} alt={product.name} className="product-image" />
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
          <span className="product-category">{getProductLabel(product)}</span>
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
  getProductLabel,
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

  const mainImage = getProductImageSrc(product);
  const showStock = product.stockEnabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-list-item ${product.hidden ? 'product-list-item-hidden' : ''} ${isDragging ? 'product-list-item-dragging' : ''}`}
    >
      <div className="product-list-image">
        <ProductImage src={mainImage} alt={product.name} />
      </div>

      <div className="product-list-content">
        <div className="product-list-header">
          <div>
            <h3 className="product-list-name">{product.name}</h3>
            <div className="product-list-meta">
              <span className="product-list-category">{getProductLabel(product)}</span>
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

function ManageProductsPanel() {
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
    loadCategories,
    showNotification
  } = useApp();
  
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
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
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
    stockEnabled: false,
    hidden: false,
    quantityDiscountsOverride: ''
  });
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    const savedView = localStorage.getItem('manageProductsViewMode');
    return savedView === 'compact' || savedView === 'list' ? savedView : 'compact';
  });
  const [manageTab, setManageTab] = useState('products'); // 'products' | 'categories'
  const [formErrors, setFormErrors] = useState({ name: '', categoryId: '', price: '', stock: '' });

  useEffect(() => {
    localStorage.setItem('manageProductsViewMode', viewMode);
  }, [viewMode]);

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
      hidden: product.hidden || false,
      quantityDiscountsOverride: formatQuantityDiscounts(product.quantityDiscountsOverride || [])
    });
    setCategoryQuery(selectedCategoryLabel);
    setShowAddForm(false);
  };

  const handleSave = () => {
    const errors = {
      name: !formData.name || !String(formData.name).trim() ? 'Product name is required' : '',
      categoryId: !formData.categoryId ? 'Please select a category' : '',
      price: !formData.price && formData.price !== 0 ? 'Price is required' : '',
      stock: formData.stockEnabled && (formData.stock === '' || formData.stock == null) ? 'Enter stock quantity or disable stock tracking' : ''
    };
    setFormErrors(errors);
    if (errors.name || errors.categoryId || errors.price || errors.stock) return;

    const productData = {
      ...formData,
      categoryId: parseInt(formData.categoryId, 10),
      price: parseFloat(formData.price),
      stock: formData.stockEnabled ? parseFloat(formData.stock) : 0,
      images: formData.images.filter(img => img.trim() !== ''),
      image: formData.images[0],
      quantityDiscountsOverride: parseQuantityDiscounts(formData.quantityDiscountsOverride)
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
      stockEnabled: false,
      hidden: false,
      quantityDiscountsOverride: ''
    });
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', price: '', stock: '' });
  };

  const setFormDataAndClearErrors = (next) => {
    setFormData(typeof next === 'function' ? next(formData) : next);
    setFormErrors({ name: '', categoryId: '', price: '', stock: '' });
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
      stockEnabled: false,
      hidden: false,
      quantityDiscountsOverride: ''
    });
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', price: '', stock: '' });
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

  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

  const handleImageUpload = async (index, event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    setUploadingImageIndex(index);
    try {
      const { url } = await uploadApi.uploadFile(file);
      updateImageField(index, url);
      showNotification('Image uploaded successfully', 'success');
    } catch (err) {
      showNotification(err.message || 'Failed to upload image', 'error');
    } finally {
      setUploadingImageIndex(null);
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
              canDelete={userRoles.includes('ADMIN')}
              onToggleHidden={toggleHidden}
              onEdit={handleEdit}
              onDeleteClick={handleDeleteClick}
              getProductLabel={getProductCategoryLabel}
              editingDisabled={editingId !== null || showAddForm}
            />
          ) : (
            <SortableProductCard
              key={product.id}
              product={product}
              dragEnabled={canManageProducts}
              canManage={canManageProducts}
              canDelete={userRoles.includes('ADMIN')}
              onToggleHidden={toggleHidden}
              onEdit={handleEdit}
              onDeleteClick={handleDeleteClick}
              getProductLabel={getProductCategoryLabel}
              editingDisabled={editingId !== null || showAddForm}
            />
          )
        )}
      </div>
    );
  };

  return (
    <div className="manage-products-container">
      <ProductsHeader
        title="Manage Products"
        subtitle="Add, edit, or remove products from your inventory"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        rightContent={
          canManageProducts ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowMediaLibrary(true)}
                className="btn-add-product"
                disabled={showAddForm || editingId}
                title="Manage Media Library"
              >
                <ImageIcon size={20} />
                <span className="hide-on-mobile">Media Library</span>
              </button>
              <button
                onClick={() => {
                  setManageTab('products');
                  setShowAddForm(true);
                }}
                className="btn-add-product"
                disabled={showAddForm || editingId}
              >
                <Plus size={20} />
                <span>Add New Product</span>
              </button>
            </div>
          ) : null
        }
      />

      {canManageProducts && (
        <div className="manage-products-tabs">
          <button
            type="button"
            className={`manage-products-tab ${manageTab === 'products' ? 'manage-products-tab-active' : ''}`}
            onClick={() => setManageTab('products')}
          >
            Products
          </button>
          <button
            type="button"
            className={`manage-products-tab ${manageTab === 'categories' ? 'manage-products-tab-active' : ''}`}
            onClick={() => setManageTab('categories')}
          >
            Categories
          </button>
        </div>
      )}

      {manageTab === 'categories' ? (
        <CategoriesSection />
      ) : (
        <>
          {canManageProducts && (
            <ProductFormModal
              isOpen={showAddForm || editingId}
              title={editingId ? 'Edit Product' : 'Add New Product'}
              formData={formData}
              setFormData={setFormDataAndClearErrors}
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
              uploadingImageIndex={uploadingImageIndex}
              formErrors={formErrors}
            />
          )}

          {isLoadingProducts || isLoadingCategories ? (
            <EmptyState message="Loading products..." />
          ) : orderedProducts.length === 0 ? (
            <EmptyState message="No products found. Add your first product to get started!" />
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

          <MediaLibraryModal
            isOpen={showMediaLibrary}
            onClose={() => setShowMediaLibrary(false)}
            onSelect={() => setShowMediaLibrary(false)} // Just view/manage mode, selection auto closes
            multiSelect={true}
            hideInsertButton={true}
          />
        </>
      )}
    </div>
  );
}

export default ManageProductsPanel;
