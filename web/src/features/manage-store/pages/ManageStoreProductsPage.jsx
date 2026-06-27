import React, { useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ROLES } from '../../../utils/roles';
import useProducts from '../hooks/useProducts';
import useProductFilters from '../hooks/useProductFilters';
import useProductDragSort from '../hooks/useProductDragSort';
import ProductsToolbar from '../components/ProductsToolbar';
import ManageProductCard from '../components/ManageProductCard';
import ManageProductListItem from '../components/ManageProductListItem';
import ProductFormModal from '../../products/ProductFormModal';
import ConfirmationModal from '../../../components/common/ConfirmationModal';
import EmptyState from '../../../components/common/EmptyState';
import { getCategoryLabel, getProductCategoryLabel } from '../../products/productsHelpers';
import { IMAGE_INPUT_ACCEPT, MEDIA_INPUT_ACCEPT, UNSUPPORTED_MEDIA_MESSAGE, isSupportedMediaFile } from '../../../utils/mediaUpload';
import * as uploadApi from '../../../services/uploadApi';
import ImageCropModal from '../../../components/common/ImageCropModal';
import useModalState from '../../../hooks/useModalState';
import './ManageStoreProductsPage.css';

const emptyVariant = () => ({
  label: 'Default', sku: '', pricingMode: 'UNIT', basePrice: '', stock: '',
  stockEnabled: false, isDefault: true, active: true, quantityOptions: [], priceBreaks: [],
});

const emptyForm = () => ({
  name: '', slug: '', categoryId: '', description: '',
  hidden: false, vipOnly: false, images: [], variants: [emptyVariant()],
});

function ManageStoreProductsPage() {
  const {
    currentUser, products, isLoadingProducts, isLoadingCategories, loadProducts, loadCategories,
    addProduct, updateProduct, deleteProduct, categories, showNotification,
    orderedProducts, setOrderedProducts,
    topLevelCategories, setTopLevelCategories,
    childCategoriesByParent,
    productsByCategory, setProductsByCategory,
  } = useProducts();

  const { searchQuery, setSearchQuery, filteredProducts } = useProductFilters(orderedProducts);
  const { handleCategoryDragEnd, handleProductDragEnd } = useProductDragSort({
    orderedProducts, setOrderedProducts, productsByCategory, setProductsByCategory,
    topLevelCategories, setTopLevelCategories, loadProducts, loadCategories,
  });

  const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const canManage = roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MANAGEMENT);
  const canDelete = roles.includes(ROLES.ADMIN);

  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({ name: '', categoryId: '', variants: '' });
  const [categoryQuery, setCategoryQuery] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const deleteModal = useModalState();
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('manageProductsViewMode');
    return saved === 'list' ? 'list' : 'grid';
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('manageProductsViewMode', mode);
  };

  const handleEdit = (product) => {
    const selectedCategoryId = product.categoryId || product.category?.id || '';
    const selectedCategoryLabel = product.category ? getCategoryLabel(product.category) : '';
    setEditingId(product.id);
    setFormData({
      name: product.name ?? '', slug: product.slug ?? '',
      categoryId: selectedCategoryId, description: product.description ?? '',
      hidden: product.hidden ?? false, vipOnly: product.vipOnly ?? false,
      images: (product.images ?? []).map((img, i) => ({
        id: img.id, url: img.url ?? '', role: img.role ?? 'GALLERY', sortOrder: img.sortOrder ?? i,
      })),
      variants: (product.variants ?? []).map(v => ({
        id: v.id, label: v.label ?? 'Default', sku: v.sku ?? '',
        pricingMode: v.pricingMode ?? 'UNIT', basePrice: String(v.basePrice ?? ''),
        stock: String(v.stock ?? ''), stockEnabled: v.stockEnabled ?? false,
        isDefault: v.isDefault ?? false, active: v.active ?? true,
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
      variants: variants.length === 0 ? 'At least one variant is required'
        : variants.some(v => !String(v.label ?? '').trim()) ? 'All variants must have a label'
        : variants.some(v => v.basePrice === '' || isNaN(parseFloat(v.basePrice))) ? 'All variants must have a valid base price'
        : '',
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
      images: (formData.images ?? []).filter(img => img.url?.trim())
        .map((img, i) => ({ ...(img.id ? { id: img.id } : {}), url: img.url.trim(), role: img.role ?? 'GALLERY', sortOrder: i })),
      variants: variants.map(v => ({
        ...(v.id ? { id: v.id } : {}), label: String(v.label).trim(),
        sku: String(v.sku ?? '').trim() || undefined,
        pricingMode: v.pricingMode ?? 'UNIT', basePrice: parseFloat(v.basePrice),
        stock: v.stockEnabled ? parseFloat(v.stock) : 0, stockEnabled: v.stockEnabled ?? false,
        isDefault: v.isDefault ?? false, active: v.active !== false,
        quantityOptions: (v.quantityOptions ?? [])
          .filter(opt => opt.quantity !== '' && !isNaN(parseFloat(opt.quantity)))
          .map((opt, i) => ({ ...(opt.id ? { id: opt.id } : {}), quantity: parseFloat(opt.quantity), sortOrder: i })),
        priceBreaks: (v.priceBreaks ?? [])
          .filter(pb => pb.minQuantity !== '' && pb.unitPrice !== '' && !isNaN(parseFloat(pb.minQuantity)) && !isNaN(parseFloat(pb.unitPrice)))
          .map(pb => ({ ...(pb.id ? { id: pb.id } : {}), minQuantity: parseFloat(pb.minQuantity), unitPrice: parseFloat(pb.unitPrice) })),
      })),
    };

    try {
      if (editingId) { await updateProduct(editingId, productData); setEditingId(null); }
      else { await addProduct(productData); setShowAddForm(false); }
    } catch { return; }

    setFormData(emptyForm());
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', variants: '' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData(emptyForm());
    setCategoryQuery('');
    setFormErrors({ name: '', categoryId: '', variants: '' });
  };

  const handleImageUpload = (index, event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    event.target.value = '';
    const unsupported = files.find(f => !isSupportedMediaFile(f));
    if (unsupported) { showNotification(UNSUPPORTED_MEDIA_MESSAGE, 'error'); return; }
    if (files.length > 1) { performMultiUpload(index, files); }
    else if (files[0].type.startsWith('video/')) { performUpload(index, files[0]); }
    else { setCropState({ file: files[0], index }); }
  };

  const performMultiUpload = async (startIndex, files) => {
    setUploadingImageIndex(startIndex);
    try {
      const { urls } = await uploadApi.uploadFiles(files);
      setFormData(prev => {
        const imgs = [...(prev.images ?? [])];
        imgs[startIndex] = { ...imgs[startIndex], url: urls[0] };
        urls.slice(1).forEach((u, offset) => imgs.push({ url: u, role: 'GALLERY', sortOrder: imgs.length + offset }));
        return { ...prev, images: imgs };
      });
      showNotification(`${urls.length} image${urls.length > 1 ? 's' : ''} uploaded successfully`, 'success');
    } catch (err) { showNotification(err.message || 'Failed to upload images', 'error'); }
    finally { setUploadingImageIndex(null); }
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
    } catch (err) { showNotification(err.message || 'Failed to upload image', 'error'); }
    finally { setUploadingImageIndex(null); }
  };

  const renderProductItem = (product, { dragEnabled } = {}) => {
    const drag = dragEnabled ?? canManage;
    const props = {
      product, dragEnabled: drag, canManage, canDelete,
      onToggleHidden: (id, hidden) => updateProduct(id, { hidden: !hidden }),
      onEdit: handleEdit,
      onDeleteClick: (id, name) => deleteModal.openModal({ id, name }),
      getProductLabel: getProductCategoryLabel,
      editingDisabled: editingId !== null || showAddForm,
    };
    return viewMode === 'list'
      ? <ManageProductListItem key={product.id} {...props} />
      : <ManageProductCard key={product.id} {...props} />;
  };

  const renderProductsCollection = (categoryId, overrideList, dragOverride) => {
    const list = overrideList ?? productsByCategory[categoryId] ?? [];
    if (!list.length) return null;
    return (
      <div className={viewMode === 'list' ? 'products-list' : 'products-grid products-grid-compact'}>
        {list.map(p => renderProductItem(p, { dragEnabled: dragOverride ?? canManage }))}
      </div>
    );
  };

  const isLoading = isLoadingProducts || isLoadingCategories;

  return (
    <div className="manage-store-products">
      <div className="manage-store-section-header">
        <h1 className="manage-store-section-title">Products</h1>
        <p className="manage-store-section-subtitle">Manage your store inventory</p>
      </div>

      <ProductsToolbar
        searchQuery={searchQuery}
        viewMode={viewMode}
        onSearch={setSearchQuery}
        onViewModeChange={handleViewModeChange}
        onAddProduct={() => setShowAddForm(true)}
        canManage={canManage}
      />

      {canManage && (
        <ProductFormModal
          isOpen={showAddForm || !!editingId}
          title={editingId ? 'Edit Product' : 'Add New Product'}
          formData={formData}
          setFormData={(next) => {
            setFormData(typeof next === 'function' ? next(formData) : next);
            setFormErrors({ name: '', categoryId: '', variants: '' });
          }}
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

      {isLoading ? (
        <EmptyState message="Loading products..." />
      ) : orderedProducts.length === 0 ? (
        <EmptyState message="No products yet. Add your first product to get started!" />
      ) : filteredProducts ? (
        filteredProducts.length === 0
          ? <EmptyState message="No products match your search." />
          : renderProductsCollection(null, filteredProducts, false)
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={topLevelCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="manage-store-categories">
              {topLevelCategories.map(category => (
                <section key={category.id} className="manage-category-group">
                  <div className="manage-category-group-header">
                    <h2 className="manage-category-group-title">{category.name}</h2>
                    {category.description && <p className="manage-category-group-desc">{category.description}</p>}
                  </div>
                  <DndContext collisionDetection={closestCenter} onDragEnd={e => handleProductDragEnd(category.id, e)}>
                    <SortableContext items={(productsByCategory[category.id] || []).map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {renderProductsCollection(category.id)}
                    </SortableContext>
                  </DndContext>
                  {(childCategoriesByParent[category.id] || []).map(child => (
                    <section key={child.id} className="manage-subcategory-group">
                      <div className="manage-subcategory-header">
                        <h3>{child.name}</h3>
                        {child.description && <p>{child.description}</p>}
                      </div>
                      <DndContext collisionDetection={closestCenter} onDragEnd={e => handleProductDragEnd(child.id, e)}>
                        <SortableContext items={(productsByCategory[child.id] || []).map(p => p.id)} strategy={verticalListSortingStrategy}>
                          {renderProductsCollection(child.id)}
                        </SortableContext>
                      </DndContext>
                    </section>
                  ))}
                </section>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => deleteModal.closeModal()}
        onConfirm={() => {
          if (deleteModal.data) deleteProduct(deleteModal.data.id);
          deleteModal.closeModal();
        }}
        title="Delete Product"
        message={<>Are you sure you want to delete <strong>"{deleteModal.data?.name || ''}"</strong>?<br /><br />This action cannot be undone.</>}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {cropState && (
        <ImageCropModal
          file={cropState.file}
          onConfirm={(croppedFile) => { const { index } = cropState; setCropState(null); performUpload(index, croppedFile); }}
          onSkip={(originalFile) => { const { index } = cropState; setCropState(null); performUpload(index, originalFile); }}
          onCancel={() => setCropState(null)}
        />
      )}
    </div>
  );
}

export default ManageStoreProductsPage;
