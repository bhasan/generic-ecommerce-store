import React, { useState, useEffect, useRef } from 'react';
import './ProductCard.css';
import './ProductsShared.css';
import './ProductsPageAdmin.css';
import { useApp } from '../../context/AppContext';
import { ROLES } from '../../utils/roles';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import * as productsApi from '../../services/productsApi';
import * as categoriesApi from '../../services/categoriesApi';
import * as uploadApi from '../../services/uploadApi';
import { Plus, Edit, Trash2, Image as ImageIcon, Eye, EyeOff, GripVertical, Download, FileDown, Upload, ChevronDown } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProductsHeader from './ProductsHeader';
import ProductFormModal from './ProductFormModal';
import MediaLibraryModal from '../../components/common/MediaLibraryModal';
import ImageCropModal from '../../components/common/ImageCropModal';
import CsvImportModal from './CsvImportModal';
import { exportProductsToCsv, getCsvTemplate } from './csvHelpers';
import { downloadProductsZip } from '../../services/productsApi';
import { importImagesZip } from '../../services/uploadApi';
import EmptyState from '../../components/common/EmptyState';
import ProductImage from './ProductImage';
import CategoriesSection from '../dashboard/components/CategoriesSection';
import { getCategoryLabel, getProductCategoryLabel, getProductImageSrc, getDefaultVariant } from './productsHelpers';
import {
  IMAGE_INPUT_ACCEPT,
  MEDIA_INPUT_ACCEPT,
  UNSUPPORTED_MEDIA_MESSAGE,
  isSupportedMediaFile,
} from '../../utils/mediaUpload';

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
  const imageCount = product.images?.length ?? 0;
  const defaultVariant = getDefaultVariant(product);
  const showStock = defaultVariant?.stockEnabled !== false;
  const stock = Number(defaultVariant?.stock ?? 0);
  const price = Number(defaultVariant?.basePrice ?? 0);

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
          <div className="product-badge product-badge-hidden">Hidden</div>
        )}
        {showStock && (
          <div className="product-badge product-badge-stock">
            {stock > 10 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock'}
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
            <span className="product-price">${price.toFixed(2)}</span>
          </div>
          {showStock && (
            <div className="meta-item">
              <span className="meta-label">Stock</span>
              <span className={`stock-badge ${stock === 0 ? 'stock-empty' : stock < 10 ? 'stock-low' : 'stock-good'}`}>
                {stock} units
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
              onClick={() => onEdit(product)}
              className="btn-edit"
              disabled={editingDisabled}
            >
              <Edit size={14} />
              <span>Edit</span>
            </button>
            <button
              onClick={() => onToggleHidden(product.id, product.hidden)}
              className="btn-visibility"
              title={product.hidden ? 'Show product' : 'Hide product'}
            >
              {product.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            {canDelete && (
              <button
                onClick={() => onDeleteClick(product.id, product.name)}
                className="btn-delete"
                title="Delete product"
              >
                <Trash2 size={14} />
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
  const defVariant = getDefaultVariant(product);
  const showStock = defVariant?.stockEnabled !== false;
  const stock = Number(defVariant?.stock ?? 0);
  const price = Number(defVariant?.basePrice ?? 0);

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
                <span className={`product-list-stock ${stock === 0 ? 'is-out' : ''}`}>
                  {stock === 0 ? 'Out of Stock' : `${stock} units`}
                </span>
              )}
              {product.hidden && <span className="product-list-hidden">Hidden</span>}
            </div>
          </div>
          <span className="product-list-price">${price.toFixed(2)}</span>
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

function CsvActionsDropdown({ disabled, products, categories, isExportingZip, onExportZip, onImport, isImportingZip, onImportZip }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const close = () => setOpen(false);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn-add-product"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        title="Bulk management actions"
      >
        <FileDown size={20} />
        <span className="hide-on-mobile">Bulk Management</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="csv-dropdown-menu">
          <button onClick={() => { onImport(); close(); }}>
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={() => { getCsvTemplate(); close(); }}>
            <FileDown size={16} /> CSV Template
          </button>
          <button onClick={() => { exportProductsToCsv(products, categories); close(); }}>
            <Download size={16} /> Export CSV
          </button>
          <button disabled={isExportingZip} onClick={() => { onExportZip(); close(); }}>
            <Download size={16} /> {isExportingZip ? 'Exporting…' : 'Export Images ZIP'}
          </button>
          <button disabled={isImportingZip} onClick={() => { onImportZip(); close(); }}>
            <Upload size={16} /> {isImportingZip ? 'Importing…' : 'Import Images ZIP'}
          </button>
        </div>
      )}
    </div>
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
  const emptyVariant = () => ({
    label: 'Default',
    sku: '',
    pricingMode: 'UNIT',
    basePrice: '',
    stock: '',
    stockEnabled: false,
    isDefault: true,
    active: true,
    quantityOptions: [],
    priceBreaks: [],
  });

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    categoryId: '',
    description: '',
    hidden: false,
    vipOnly: false,
    images: [],
    variants: [emptyVariant()],
  });
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isImportingZip, setIsImportingZip] = useState(false);
  const zipImportInputRef = useRef(null);
  const [viewMode, setViewMode] = useState(() => {
    // Default to grid for first-time product managers; only use list when a user has explicitly saved it.
    if (typeof window === 'undefined') return 'grid';
    const savedView = localStorage.getItem('manageProductsViewMode');
    return savedView === 'grid' || savedView === 'list' ? savedView : 'grid';
  });
  const [manageTab, setManageTab] = useState('products'); // 'products' | 'categories'
  const [formErrors, setFormErrors] = useState({ name: '', categoryId: '', variants: '' });
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const searchTerm = productSearchQuery.trim().toLowerCase();
  const filteredProducts = searchTerm
    ? orderedProducts.filter(p =>
        p.name?.toLowerCase().includes(searchTerm) ||
        p.description?.toLowerCase().includes(searchTerm)
      )
    : null;

  useEffect(() => {
    localStorage.setItem('manageProductsViewMode', viewMode);
  }, [viewMode]);

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const canManageProducts = userRoles.includes(ROLES.ADMIN) || userRoles.includes(ROLES.MANAGEMENT);

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
  
  const resetFormData = () => ({
    name: '',
    slug: '',
    categoryId: '',
    description: '',
    hidden: false,
    vipOnly: false,
    images: [],
    variants: [emptyVariant()],
  });

  const handleEdit = (product) => {
    const selectedCategoryId = product.categoryId || product.category?.id || '';
    const selectedCategoryLabel = product.category ? getCategoryLabel(product.category) : '';
    setEditingId(product.id);
    setFormData({
      name: product.name ?? '',
      slug: product.slug ?? '',
      categoryId: selectedCategoryId,
      description: product.description ?? '',
      hidden: product.hidden ?? false,
      vipOnly: product.vipOnly ?? false,
      images: (product.images ?? []).map((img, i) => ({
        id: img.id,
        url: img.url ?? '',
        role: img.role ?? 'GALLERY',
        sortOrder: img.sortOrder ?? i,
      })),
      variants: (product.variants ?? []).map(v => ({
        id: v.id,
        label: v.label ?? 'Default',
        sku: v.sku ?? '',
        pricingMode: v.pricingMode ?? 'UNIT',
        basePrice: String(v.basePrice ?? ''),
        stock: String(v.stock ?? ''),
        stockEnabled: v.stockEnabled ?? false,
        isDefault: v.isDefault ?? false,
        active: v.active ?? true,
        quantityOptions: (v.quantityOptions ?? []).map(opt => ({ id: opt.id, quantity: String(opt.quantity ?? ''), sortOrder: opt.sortOrder ?? 0 })),
        priceBreaks: (v.priceBreaks ?? []).map(pb => ({ id: pb.id, minQuantity: String(pb.minQuantity ?? ''), unitPrice: String(pb.unitPrice ?? '') })),
      })),
    });
    setCategoryQuery(selectedCategoryLabel);
    setShowAddForm(false);
  };

  const handleSave = async () => {
    const variants = formData.variants ?? [];
    const errors = {
      name: !String(formData.name ?? '').trim() ? 'Product name is required' : '',
      categoryId: !formData.categoryId ? 'Please select a category' : '',
      variants: variants.length === 0 ? 'At least one variant is required' :
        variants.some(v => !String(v.label ?? '').trim()) ? 'All variants must have a label' :
        variants.some(v => v.basePrice === '' || isNaN(parseFloat(v.basePrice))) ? 'All variants must have a valid base price' : '',
    };
    setFormErrors(errors);
    if (errors.name || errors.categoryId || errors.variants) return;

    const productData = {
      name: String(formData.name).trim(),
      slug: String(formData.slug ?? '').trim() || undefined,
      categoryId: parseInt(formData.categoryId, 10),
      description: String(formData.description ?? '').trim() || undefined,
      hidden: formData.hidden ?? false,
      vipOnly: formData.vipOnly ?? false,
      images: (formData.images ?? [])
        .filter(img => img.url?.trim())
        .map((img, i) => ({ ...(img.id ? { id: img.id } : {}), url: img.url.trim(), role: img.role ?? 'GALLERY', sortOrder: i })),
      variants: variants.map(v => ({
        ...(v.id ? { id: v.id } : {}),
        label: String(v.label).trim(),
        sku: String(v.sku ?? '').trim() || undefined,
        pricingMode: v.pricingMode ?? 'UNIT',
        basePrice: parseFloat(v.basePrice),
        stock: v.stockEnabled ? parseFloat(v.stock) : 0,
        stockEnabled: v.stockEnabled ?? false,
        isDefault: v.isDefault ?? false,
        active: v.active !== false,
        quantityOptions: (v.quantityOptions ?? [])
          .filter(opt => opt.quantity !== '' && !isNaN(parseFloat(opt.quantity)))
          .map((opt, i) => ({ ...(opt.id ? { id: opt.id } : {}), quantity: parseFloat(opt.quantity), sortOrder: i })),
        priceBreaks: (v.priceBreaks ?? [])
          .filter(pb => pb.minQuantity !== '' && pb.unitPrice !== '' && !isNaN(parseFloat(pb.minQuantity)) && !isNaN(parseFloat(pb.unitPrice)))
          .map(pb => ({ ...(pb.id ? { id: pb.id } : {}), minQuantity: parseFloat(pb.minQuantity), unitPrice: parseFloat(pb.unitPrice) })),
      })),
    };

    try {
      if (editingId) {
        await updateProduct(editingId, productData);
        setEditingId(null);
      } else {
        await addProduct(productData);
        setShowAddForm(false);
      }
    } catch {
      return;
    }

    setFormData(resetFormData());
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', variants: '' });
  };

  const setFormDataAndClearErrors = (next) => {
    setFormData(typeof next === 'function' ? next(formData) : next);
    setFormErrors({ name: '', categoryId: '', variants: '' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData(resetFormData());
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', variants: '' });
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

  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);
  const [cropState, setCropState] = useState(null);

  const isVideoFile = (file) => file.type.startsWith('video/');

  const handleImageUpload = (index, event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    event.target.value = '';

    const unsupportedFile = files.find((file) => !isSupportedMediaFile(file));
    if (unsupportedFile) {
      showNotification(UNSUPPORTED_MEDIA_MESSAGE, 'error');
      return;
    }

    if (files.length > 1) {
      performMultiUpload(index, files);
    } else {
      const file = files[0];
      if (isVideoFile(file)) {
        performUpload(index, file);
      } else {
        setCropState({ file, index });
      }
    }
  };

  const performMultiUpload = async (startIndex, files) => {
    setUploadingImageIndex(startIndex);
    try {
      const { urls } = await uploadApi.uploadFiles(files);
      setFormData(prev => {
        const imgs = [...(prev.images ?? [])];
        imgs[startIndex] = { ...imgs[startIndex], url: urls[0] };
        urls.slice(1).forEach((u, offset) => {
          imgs.push({ url: u, role: 'GALLERY', sortOrder: imgs.length + offset });
        });
        return { ...prev, images: imgs };
      });
      showNotification(`${urls.length} image${urls.length > 1 ? 's' : ''} uploaded successfully`, 'success');
    } catch (err) {
      showNotification(err.message || 'Failed to upload images', 'error');
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const performUpload = async (index, file) => {
    setUploadingImageIndex(index);
    try {
      const { url } = await uploadApi.uploadFile(file);
      setFormData(prev => {
        const imgs = [...(prev.images ?? [])];
        imgs[index] = { ...(imgs[index] ?? { role: 'GALLERY', sortOrder: index }), url };
        return { ...prev, images: imgs };
      });
      showNotification('Image uploaded successfully', 'success');
    } catch (err) {
      showNotification(err.message || 'Failed to upload image', 'error');
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const handleCropConfirm = (croppedFile) => {
    const { index } = cropState;
    setCropState(null);
    performUpload(index, croppedFile);
  };

  const handleCropSkip = (originalFile) => {
    const { index } = cropState;
    setCropState(null);
    performUpload(index, originalFile);
  };

  const toggleHidden = (productId, currentHidden) => {
    updateProduct(productId, { hidden: !currentHidden });
  };

  const renderProductsCollection = (categoryId, { list: overrideList, dragEnabled: dragOverride } = {}) => {
    const list = overrideList ?? productsByCategory[categoryId] ?? [];
    const drag = dragOverride ?? canManageProducts;
    if (list.length === 0) return null;

    return (
      <div className={viewMode === 'list' ? 'products-list' : `products-grid ${viewMode === 'grid' ? 'products-grid-compact' : ''}`}>
        {list.map(product =>
          viewMode === 'list' ? (
            <SortableProductListItem
              key={product.id}
              product={product}
              dragEnabled={drag}
              canManage={canManageProducts}
              canDelete={userRoles.includes(ROLES.ADMIN)}
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
              dragEnabled={drag}
              canManage={canManageProducts}
              canDelete={userRoles.includes(ROLES.ADMIN)}
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
        // TODO(mobile): Rework admin header actions for phones so Media Library and Add Product remain visible and easy to tap without crowding.
        rightContent={
          canManageProducts ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={zipImportInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsImportingZip(true);
                  try {
                    const { imported, skipped } = await importImagesZip(file);
                    alert(`Import complete: ${imported} image(s) added, ${skipped} already existed.`);
                  } catch (err) {
                    alert(`Import failed: ${err.message}`);
                  } finally {
                    setIsImportingZip(false);
                    zipImportInputRef.current.value = '';
                  }
                }}
              />
              <CsvActionsDropdown
                disabled={showAddForm || !!editingId}
                products={products}
                categories={categories}
                isExportingZip={isExportingZip}
                onExportZip={async () => {
                  setIsExportingZip(true);
                  try {
                    await downloadProductsZip();
                  } finally {
                    setIsExportingZip(false);
                  }
                }}
                onImport={() => setShowCsvImport(true)}
                isImportingZip={isImportingZip}
                onImportZip={() => zipImportInputRef.current?.click()}
              />
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
              handleImageUpload={handleImageUpload}
              uploadingImageIndex={uploadingImageIndex}
              formErrors={formErrors}
              imageInputAccept={IMAGE_INPUT_ACCEPT}
              mediaInputAccept={MEDIA_INPUT_ACCEPT}
            />
          )}

          <input
            type="search"
            placeholder="Filter products…"
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            aria-label="Filter products"
            className="products-search-input"
          />

          {isLoadingProducts || isLoadingCategories ? (
            <EmptyState message="Loading products..." />
          ) : orderedProducts.length === 0 ? (
            <EmptyState message="No products found. Add your first product to get started!" />
          ) : filteredProducts ? (
            filteredProducts.length === 0
              ? <EmptyState message="No products match your search." />
              : renderProductsCollection(null, { list: filteredProducts, dragEnabled: false })
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

      {cropState && (
        <ImageCropModal
          file={cropState.file}
          onConfirm={handleCropConfirm}
          onSkip={handleCropSkip}
          onCancel={() => setCropState(null)}
        />
      )}

      <CsvImportModal
        isOpen={showCsvImport}
        onClose={() => { setShowCsvImport(false); loadProducts(); }}
        products={products}
        categories={categories}
      />
    </div>
  );
}

export default ManageProductsPanel;
