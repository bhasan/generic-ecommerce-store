import React from 'react';
import { Save, X, Upload, Image as ImageIcon } from 'lucide-react';

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

export default ProductFormModal;
