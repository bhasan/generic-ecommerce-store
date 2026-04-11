import React, { useState } from 'react';
import { Save, X, Upload, Image as ImageIcon, Library, GripVertical } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaLibraryModal from '../../components/common/MediaLibraryModal';

// Helper to get display name from a URL
const getDisplayImageName = (url) => {
  if (!url) return '';
  if (url.startsWith('/api/uploads/')) {
    return url.replace('/api/uploads/', '');
  }
  return url;
};

// Helper to check if a url is a video
const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function SortableImageRow({ id, index, image, uploadingImageIndex, handleImageUpload, setActiveMediaLibraryIndex, removeImageField, showRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="image-field-row">
      <button
        type="button"
        className="btn-ghost btn-icon btn-drag-handle"
        style={{ cursor: 'grab', padding: '0.25rem', color: 'var(--text-tertiary)' }}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="image-input-group">
        <input
          type="text"
          placeholder={`Select image ${index + 1}...`}
          value={getDisplayImageName(image)}
          readOnly
          className="form-input"
          style={{
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderColor: 'transparent',
            color: 'var(--text-secondary)',
            pointerEvents: 'none'
          }}
          title={image}
        />
        <label className={`btn-upload-image ${uploadingImageIndex === index ? 'btn-upload-image-loading' : ''}`}>
          <Upload size={16} />
          <span>{uploadingImageIndex === index ? 'Uploading...' : 'Upload'}</span>
          <input
            type="file"
            accept="image/*,video/mp4,video/webm"
            multiple
            onChange={(e) => handleImageUpload(index, e)}
            className="file-input-hidden"
            disabled={uploadingImageIndex !== null}
          />
        </label>
        <button
          type="button"
          onClick={() => setActiveMediaLibraryIndex(index)}
          className="btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Library size={16} />
          <span>From Library</span>
        </button>
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={() => removeImageField(index)}
          className="btn-remove-image"
        >
          <X size={16} />
        </button>
      )}
    </div>
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
  handleImageUpload,
  uploadingImageIndex = null,
  formErrors = {}
}) {
  const [activeMediaLibraryIndex, setActiveMediaLibraryIndex] = useState(null);

  const handleImagesDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = active.id;
    const newIndex = over.id;
    setFormData({ ...formData, images: arrayMove(formData.images, oldIndex, newIndex) });
  };

  const handleMediaSelect = (urls) => {
    if (!urls || urls.length === 0) return;

    // Ensure array format even if a single URL is passed for compatibility
    const urlArray = Array.isArray(urls) ? urls : [urls];

    if (activeMediaLibraryIndex === 'thumbnail') {
      setFormData({ ...formData, thumbnail: urlArray[0] });
      setActiveMediaLibraryIndex(null);
      return;
    }

    if (activeMediaLibraryIndex !== null) {
      const newImages = [...formData.images];

      // Replace the active slot with the first URL
      newImages[activeMediaLibraryIndex] = urlArray[0];

      // If there are more URLs, append them to the end
      if (urlArray.length > 1) {
        const remainingUrls = urlArray.slice(1);
        newImages.push(...remainingUrls);
      }

      // Filter out any empty strings that might have been placeholder slots,
      // but only if we have at least one valid image
      const filteredImages = newImages.filter(img => img.trim() !== '');

      setFormData({
        ...formData,
        images: filteredImages.length > 0 ? filteredImages : ['']
      });
      setActiveMediaLibraryIndex(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="product-form-card surface-card-accent">
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
                  className={`form-input ${formErrors.name ? 'form-input-error' : ''}`}
                  aria-invalid={!!formErrors.name}
                  aria-describedby={formErrors.name ? 'name-error' : undefined}
                />
                {formErrors.name && (
                  <span id="name-error" className="form-error-message" role="alert">{formErrors.name}</span>
                )}
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
                    className={`form-input ${formErrors.categoryId ? 'form-input-error' : ''}`}
                    aria-invalid={!!formErrors.categoryId}
                    aria-describedby={formErrors.categoryId ? 'category-error' : undefined}
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
                {formErrors.categoryId && (
                  <span id="category-error" className="form-error-message" role="alert">{formErrors.categoryId}</span>
                )}
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
                  className={`form-input ${formErrors.price ? 'form-input-error' : ''}`}
                  aria-invalid={!!formErrors.price}
                  aria-describedby={formErrors.price ? 'price-error' : undefined}
                />
                {formErrors.price && (
                  <span id="price-error" className="form-error-message" role="alert">{formErrors.price}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="quantityDiscountsOverride">Quantity Discounts (optional)</label>
                <input
                  id="quantityDiscountsOverride"
                  type="text"
                  placeholder="e.g., 1:10%, 3:$5"
                  value={formData.quantityDiscountsOverride || ''}
                  onChange={(e) => setFormData({ ...formData, quantityDiscountsOverride: e.target.value })}
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
                    step="1"
                    placeholder={formData.stockEnabled ? "0" : "Disabled"}
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className={`form-input ${formErrors.stock ? 'form-input-error' : ''}`}
                    disabled={!formData.stockEnabled}
                    aria-invalid={!!formErrors.stock}
                    aria-describedby={formErrors.stock ? 'stock-error' : undefined}
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
                {formErrors.stock && (
                  <span id="stock-error" className="form-error-message" role="alert">{formErrors.stock}</span>
                )}
              </div>

              <div className="form-group form-group-full">
                <label>Thumbnail</label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Used in product listings. If not set, the first gallery image is used.
                </p>
                <div className="image-field-row">
                  <div className="image-input-group">
                    <input
                      type="text"
                      placeholder="Select thumbnail..."
                      value={getDisplayImageName(formData.thumbnail || '')}
                      readOnly
                      className="form-input"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        borderColor: 'transparent',
                        color: 'var(--text-secondary)',
                        pointerEvents: 'none'
                      }}
                      title={formData.thumbnail || ''}
                    />
                    <label className={`btn-upload-image ${uploadingImageIndex === 'thumbnail' ? 'btn-upload-image-loading' : ''}`}>
                      <Upload size={16} />
                      <span>{uploadingImageIndex === 'thumbnail' ? 'Uploading...' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload('thumbnail', e)}
                        className="file-input-hidden"
                        disabled={uploadingImageIndex !== null}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveMediaLibraryIndex('thumbnail')}
                      className="btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <Library size={16} />
                      <span>From Library</span>
                    </button>
                    {formData.thumbnail && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, thumbnail: '' })}
                        className="btn-remove-image"
                        title="Remove thumbnail"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group form-group-full">
                <label>Product Images</label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Recommended: 1280×800px (16:10 landscape)
                </p>
                <div className="image-fields">
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleImagesDragEnd}>
                    <SortableContext
                      items={formData.images.map((_, i) => i)}
                      strategy={verticalListSortingStrategy}
                    >
                      {formData.images.map((image, index) => (
                        <SortableImageRow
                          key={index}
                          id={index}
                          index={index}
                          image={image}
                          uploadingImageIndex={uploadingImageIndex}
                          handleImageUpload={handleImageUpload}
                          setActiveMediaLibraryIndex={setActiveMediaLibraryIndex}
                          removeImageField={removeImageField}
                          showRemove={formData.images.length > 1}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
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

              <div className="form-group form-group-full">
                <label className="checkbox-label checkbox-label-large">
                  <input
                    type="checkbox"
                    checked={formData.vipOnly || false}
                    onChange={(e) => setFormData({ ...formData, vipOnly: e.target.checked })}
                  />
                  <span>VIP-only — visible only to VIP customers and staff</span>
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
      <MediaLibraryModal
        isOpen={activeMediaLibraryIndex !== null}
        onClose={() => setActiveMediaLibraryIndex(null)}
        onSelect={handleMediaSelect}
        multiSelect={true}
      />
    </>
  );
}

export default ProductFormModal;
