import React, { useState } from 'react';
import { Save, X, Upload, Image as ImageIcon, Library, GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaLibraryModal from '../../components/common/MediaLibraryModal';

const getDisplayName = (url) => {
  if (!url) return '';
  return url.startsWith('/api/uploads/') ? url.replace('/api/uploads/', '') : url;
};

const isVideo = (url) => !!url?.match(/\.(mp4|webm)$/i);

function SortableImageRow({ id, index, image, uploadingImageIndex, handleImageUpload, onMediaLibrary, onRemove, onRoleChange, showRemove, mediaInputAccept }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="image-field-row">
      <button type="button" className="btn-ghost btn-icon btn-drag-handle" style={{ cursor: 'grab', padding: '0.25rem', color: 'var(--text-tertiary)' }} {...attributes} {...listeners} aria-label="Drag to reorder">
        <GripVertical size={16} />
      </button>
      <div className="image-input-group">
        <select
          value={image.role ?? 'GALLERY'}
          onChange={(e) => onRoleChange(index, e.target.value)}
          className="form-select"
          style={{ width: 'auto', minWidth: '100px', flexShrink: 0 }}
        >
          <option value="THUMBNAIL">Thumbnail</option>
          <option value="GALLERY">Gallery</option>
        </select>
        <input
          type="text"
          placeholder={`Select image ${index + 1}...`}
          value={getDisplayName(image.url ?? '')}
          readOnly
          className="form-input"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'transparent', color: 'var(--text-secondary)', pointerEvents: 'none' }}
          title={image.url ?? ''}
        />
        <label className={`btn-upload-image ${uploadingImageIndex === index ? 'btn-upload-image-loading' : ''}`}>
          <Upload size={16} />
          <span>{uploadingImageIndex === index ? 'Uploading...' : 'Upload'}</span>
          <input type="file" accept={mediaInputAccept} multiple onChange={(e) => handleImageUpload(index, e)} className="file-input-hidden" disabled={uploadingImageIndex !== null} />
        </label>
        <button type="button" onClick={() => onMediaLibrary(index)} className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <Library size={16} />
          <span>From Library</span>
        </button>
      </div>
      {showRemove && (
        <button type="button" onClick={() => onRemove(index)} className="btn-remove-image"><X size={16} /></button>
      )}
    </div>
  );
}

function VariantRow({ variant, index, isOnly, onChange, onRemove, onToggleDefault }) {
  const [expanded, setExpanded] = useState(false);

  const updateField = (field, value) => onChange(index, { ...variant, [field]: value });

  const addQuantityOption = () => onChange(index, { ...variant, quantityOptions: [...variant.quantityOptions, { quantity: '' }] });
  const removeQuantityOption = (i) => onChange(index, { ...variant, quantityOptions: variant.quantityOptions.filter((_, j) => j !== i) });
  const updateQuantityOption = (i, val) => {
    const opts = [...variant.quantityOptions];
    opts[i] = { ...opts[i], quantity: val };
    onChange(index, { ...variant, quantityOptions: opts });
  };

  const addPriceBreak = () => onChange(index, { ...variant, priceBreaks: [...variant.priceBreaks, { minQuantity: '', unitPrice: '' }] });
  const removePriceBreak = (i) => onChange(index, { ...variant, priceBreaks: variant.priceBreaks.filter((_, j) => j !== i) });
  const updatePriceBreak = (i, field, val) => {
    const pbs = [...variant.priceBreaks];
    pbs[i] = { ...pbs[i], [field]: val };
    onChange(index, { ...variant, priceBreaks: pbs });
  };

  return (
    <div className="variant-row surface-card" style={{ padding: '1rem', marginBottom: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
      {/* Input fields grid — columns align consistently across all variant rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 140px 110px 100px', gap: '0.625rem', alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Label *</label>
          <input type="text" value={variant.label} onChange={(e) => updateField('label', e.target.value)} className="form-input" placeholder="e.g. Default, 1g, Small" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>SKU</label>
          <input type="text" value={variant.sku ?? ''} onChange={(e) => updateField('sku', e.target.value)} className="form-input" placeholder="e.g. PROD-001" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Pricing Mode</label>
          <select value={variant.pricingMode ?? 'UNIT'} onChange={(e) => updateField('pricingMode', e.target.value)} className="form-select">
            <option value="UNIT">Unit</option>
            <option value="WEIGHT">Weight</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Base Price ($) *</label>
          <input type="number" step="0.01" min="0" value={variant.basePrice} onChange={(e) => updateField('basePrice', e.target.value)} className="form-input" placeholder="0.00" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Stock</label>
          <input type="number" min="0" step="any" value={variant.stock} onChange={(e) => updateField('stock', e.target.value)} className="form-input" placeholder="0" disabled={!variant.stockEnabled} />
        </div>
      </div>

      {/* Controls bar — toggles on left, actions on right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.625rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="radio" name="defaultVariant" checked={!!variant.isDefault} onChange={() => onToggleDefault(index)} />
          <span>Default</span>
        </label>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={variant.stockEnabled} onChange={(e) => updateField('stockEnabled', e.target.checked)} />
          <span>Track Stock</span>
        </label>
        <label className="checkbox-label" style={{ gap: '0.375rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={variant.active !== false} onChange={(e) => updateField('active', e.target.checked)} />
          <span>Active</span>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
          <button type="button" onClick={() => setExpanded(x => !x)} className="btn-secondary btn-sm" title="Quantity options / price breaks">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Options</span>
          </button>
          {!isOnly && (
            <button type="button" onClick={() => onRemove(index)} className="btn-delete" title="Remove variant"><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Quantity Options (WEIGHT mode)</label>
              <button type="button" onClick={addQuantityOption} className="btn-secondary btn-sm"><Plus size={12} /> Add</button>
            </div>
            {variant.quantityOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input type="number" min="0" step="any" value={opt.quantity} onChange={(e) => updateQuantityOption(i, e.target.value)} className="form-input" placeholder="e.g. 0.5" style={{ flex: 1 }} />
                <button type="button" onClick={() => removeQuantityOption(i)} className="btn-remove-image"><X size={14} /></button>
              </div>
            ))}
            {variant.quantityOptions.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No quantity options</p>}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Price Breaks</label>
              <button type="button" onClick={addPriceBreak} className="btn-secondary btn-sm"><Plus size={12} /> Add</button>
            </div>
            {variant.priceBreaks.map((pb, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                <input type="number" min="0" step="any" value={pb.minQuantity} onChange={(e) => updatePriceBreak(i, 'minQuantity', e.target.value)} className="form-input" placeholder="Min qty" style={{ flex: 1 }} />
                <span style={{ flexShrink: 0, fontSize: '0.8rem' }}>→ $</span>
                <input type="number" min="0" step="0.01" value={pb.unitPrice} onChange={(e) => updatePriceBreak(i, 'unitPrice', e.target.value)} className="form-input" placeholder="Unit price" style={{ flex: 1 }} />
                <button type="button" onClick={() => removePriceBreak(i)} className="btn-remove-image"><X size={14} /></button>
              </div>
            ))}
            {variant.priceBreaks.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No price breaks</p>}
          </div>
        </div>
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
  handleImageUpload,
  uploadingImageIndex = null,
  formErrors = {},
  imageInputAccept = 'image/jpeg,image/png,image/gif,image/webp',
  mediaInputAccept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm'
}) {
  const [activeMediaLibraryIndex, setActiveMediaLibraryIndex] = useState(null);

  const handleImagesDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const imgs = [...(formData.images ?? [])];
    const oldIdx = imgs.findIndex((_, i) => i === active.id);
    const newIdx = imgs.findIndex((_, i) => i === over.id);
    setFormData({ ...formData, images: arrayMove(imgs, oldIdx, newIdx).map((img, i) => ({ ...img, sortOrder: i })) });
  };

  const addImageField = () => {
    const imgs = formData.images ?? [];
    setFormData({ ...formData, images: [...imgs, { url: '', role: 'GALLERY', sortOrder: imgs.length }] });
  };

  const removeImageField = (index) => {
    const imgs = (formData.images ?? []).filter((_, i) => i !== index).map((img, i) => ({ ...img, sortOrder: i }));
    setFormData({ ...formData, images: imgs });
  };

  const updateImageRole = (index, role) => {
    const imgs = [...(formData.images ?? [])];
    imgs[index] = { ...imgs[index], role };
    setFormData({ ...formData, images: imgs });
  };

  const handleMediaSelect = (urls) => {
    if (!urls?.length) return;
    const urlArray = Array.isArray(urls) ? urls : [urls];
    if (activeMediaLibraryIndex !== null) {
      const imgs = [...(formData.images ?? [])];
      imgs[activeMediaLibraryIndex] = { ...imgs[activeMediaLibraryIndex], url: urlArray[0] };
      if (urlArray.length > 1) {
        urlArray.slice(1).forEach((u, offset) => {
          imgs.push({ url: u, role: 'GALLERY', sortOrder: imgs.length + offset });
        });
      }
      setFormData({ ...formData, images: imgs });
    }
    setActiveMediaLibraryIndex(null);
  };

  const updateVariant = (index, updated) => {
    const variants = [...(formData.variants ?? [])];
    variants[index] = updated;
    setFormData({ ...formData, variants });
  };

  const addVariant = () => {
    const variants = formData.variants ?? [];
    setFormData({
      ...formData,
      variants: [...variants, { label: '', sku: '', pricingMode: 'UNIT', basePrice: '', stock: '', stockEnabled: false, isDefault: false, active: true, quantityOptions: [], priceBreaks: [] }]
    });
  };

  const removeVariant = (index) => {
    const variants = (formData.variants ?? []).filter((_, i) => i !== index);
    if (!variants.some(v => v.isDefault) && variants.length > 0) variants[0].isDefault = true;
    setFormData({ ...formData, variants });
  };

  const toggleDefault = (index) => {
    const variants = (formData.variants ?? []).map((v, i) => ({ ...v, isDefault: i === index }));
    setFormData({ ...formData, variants });
  };

  if (!isOpen) return null;

  const images = formData.images ?? [];
  const variants = formData.variants ?? [];

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="product-form-card surface-card-accent">
            <div className="form-header">
              <h3 className="form-title">{title}</h3>
              <button onClick={onCancel} className="btn-close"><X size={20} /></button>
            </div>

            <div className="form-grid">
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

              {/* Images */}
              <div className="form-group form-group-full">
                <label>Product Images</label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Set role to "Thumbnail" for the listing image. Recommended: 1280×800px.
                </p>
                <div className="image-fields">
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleImagesDragEnd}>
                    <SortableContext items={images.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                      {images.map((image, index) => (
                        <SortableImageRow
                          key={index} id={index} index={index}
                          image={image}
                          uploadingImageIndex={uploadingImageIndex}
                          handleImageUpload={handleImageUpload}
                          onMediaLibrary={setActiveMediaLibraryIndex}
                          onRemove={removeImageField}
                          onRoleChange={updateImageRole}
                          showRemove={images.length > 0}
                          mediaInputAccept={mediaInputAccept}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  <button type="button" onClick={addImageField} className="btn-add-image">
                    <ImageIcon size={16} /><span>Add Image</span>
                  </button>
                </div>
              </div>

              {/* Variants */}
              <div className="form-group form-group-full">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ marginBottom: 0 }}>Variants *</label>
                  <button type="button" onClick={addVariant} className="btn-secondary btn-sm">
                    <Plus size={14} /><span>Add Variant</span>
                  </button>
                </div>
                {formErrors.variants && <span className="form-error-message" role="alert">{formErrors.variants}</span>}
                {variants.map((variant, index) => (
                  <VariantRow
                    key={index}
                    variant={variant}
                    index={index}
                    isOnly={variants.length === 1}
                    onChange={updateVariant}
                    onRemove={removeVariant}
                    onToggleDefault={toggleDefault}
                  />
                ))}
                {variants.length === 0 && (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Add at least one variant.</p>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button onClick={onSave} className="btn-save"><Save size={18} /><span>Save Product</span></button>
              <button onClick={onCancel} className="btn-cancel">Cancel</button>
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
