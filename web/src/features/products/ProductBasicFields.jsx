import React from 'react';

export default function ProductBasicFields({
  formData,
  setFormData,
  categoryQuery,
  setCategoryQuery,
  showCategoryDropdown,
  setShowCategoryDropdown,
  isLoadingCategories,
  categories,
  getCategoryLabel,
  formErrors
}) {
  return (
    <>
      {/* Name */}
      <div className="form-group">
        <label htmlFor="name">Product Name *</label>
        <input
          id="name" type="text" placeholder="e.g., Blue Dream"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`form-input ${formErrors.name ? 'form-input-error' : ''}`}
          aria-invalid={!!formErrors.name}
        />
        {formErrors.name && <span className="form-error-message" role="alert">{formErrors.name}</span>}
      </div>

      {/* Category */}
      <div className="form-group">
        <label htmlFor="category">Category *</label>
        <div className="category-select">
          <input
            id="category" type="text" placeholder="Search categories..."
            value={categoryQuery}
            onFocus={() => setShowCategoryDropdown(true)}
            onChange={(e) => { setCategoryQuery(e.target.value); setShowCategoryDropdown(true); }}
            className={`form-input ${formErrors.categoryId ? 'form-input-error' : ''}`}
            aria-invalid={!!formErrors.categoryId}
          />
          {showCategoryDropdown && (
            <div className="category-dropdown">
              {isLoadingCategories ? (
                <div className="category-option">Loading...</div>
              ) : categories.length === 0 ? (
                <div className="category-option">No categories</div>
              ) : (
                categories
                  .map(cat => ({ ...cat, label: getCategoryLabel(cat) }))
                  .filter(cat => cat.label.toLowerCase().includes(categoryQuery.toLowerCase()))
                  .map(cat => (
                    <button key={cat.id} type="button" className="category-option"
                      onClick={() => { setFormData({ ...formData, categoryId: cat.id }); setCategoryQuery(cat.label); setShowCategoryDropdown(false); }}>
                      {cat.label}
                    </button>
                  ))
              )}
            </div>
          )}
        </div>
        {formErrors.categoryId && <span className="form-error-message" role="alert">{formErrors.categoryId}</span>}
      </div>

      {/* Description */}
      <div className="form-group form-group-full">
        <label htmlFor="description">Description</label>
        <textarea
          id="description" placeholder="Describe the product..."
          value={formData.description ?? ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="form-textarea" rows={3}
        />
      </div>

      {/* Hidden / VIP */}
      <div className="form-group form-group-full" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <label className="checkbox-label checkbox-label-large">
          <input type="checkbox" checked={formData.hidden ?? false} onChange={(e) => setFormData({ ...formData, hidden: e.target.checked })} />
          <span>Hide from customers</span>
        </label>
        <label className="checkbox-label checkbox-label-large">
          <input type="checkbox" checked={formData.vipOnly ?? false} onChange={(e) => setFormData({ ...formData, vipOnly: e.target.checked })} />
          <span>VIP-only</span>
        </label>
      </div>
    </>
  );
}
