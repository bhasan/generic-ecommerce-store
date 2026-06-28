import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import MediaLibraryModal from '../../components/common/MediaLibraryModal';
import BaseModal from '../../components/common/BaseModal';

import ProductBasicFields from './ProductBasicFields';
import ProductImageSection from './ProductImageSection';
import ProductVariantSection from './ProductVariantSection';

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
    setFormData(prev => {
      const imgs = [...(prev.images ?? [])];
      const oldIdx = imgs.findIndex((_, i) => i === active.id);
      const newIdx = imgs.findIndex((_, i) => i === over.id);
      return { ...prev, images: arrayMove(imgs, oldIdx, newIdx).map((img, i) => ({ ...img, sortOrder: i })) };
    });
  };

  const addImageField = () => {
    setFormData(prev => {
      const imgs = prev.images ?? [];
      return { ...prev, images: [...imgs, { url: '', role: 'GALLERY', sortOrder: imgs.length }] };
    });
  };

  const removeImageField = (index) => {
    setFormData(prev => {
      const imgs = (prev.images ?? []).filter((_, i) => i !== index).map((img, i) => ({ ...img, sortOrder: i }));
      return { ...prev, images: imgs };
    });
  };

  const updateImageRole = (index, role) => {
    setFormData(prev => {
      const imgs = [...(prev.images ?? [])];
      imgs[index] = { ...imgs[index], role };
      return { ...prev, images: imgs };
    });
  };

  const handleMediaSelect = (urls) => {
    if (!urls?.length) return;
    const urlArray = Array.isArray(urls) ? urls : [urls];
    if (activeMediaLibraryIndex !== null) {
      setFormData(prev => {
        const imgs = [...(prev.images ?? [])];
        imgs[activeMediaLibraryIndex] = { ...imgs[activeMediaLibraryIndex], url: urlArray[0] };
        if (urlArray.length > 1) {
          urlArray.slice(1).forEach((u, offset) => {
            imgs.push({ url: u, role: 'GALLERY', sortOrder: imgs.length + offset });
          });
        }
        return { ...prev, images: imgs };
      });
    }
    setActiveMediaLibraryIndex(null);
  };

  const updateVariant = (index, updated) => {
    setFormData(prev => {
      const variants = [...(prev.variants ?? [])];
      variants[index] = updated;
      return { ...prev, variants };
    });
  };

  const addVariant = () => {
    setFormData(prev => {
      const variants = prev.variants ?? [];
      return {
        ...prev,
        variants: [...variants, { label: '', sku: '', pricingMode: 'UNIT', basePrice: '', stock: '', stockEnabled: false, isDefault: false, active: true, quantityOptions: [], priceBreaks: [] }]
      };
    });
  };

  const removeVariant = (index) => {
    setFormData(prev => {
      const variants = (prev.variants ?? []).filter((_, i) => i !== index);
      if (!variants.some(v => v.isDefault) && variants.length > 0) variants[0] = { ...variants[0], isDefault: true };
      return { ...prev, variants };
    });
  };

  const toggleDefault = (index) => {
    setFormData(prev => {
      const variants = (prev.variants ?? []).map((v, i) => ({ ...v, isDefault: i === index }));
      return { ...prev, variants };
    });
  };

  const images = formData.images ?? [];
  const variants = formData.variants ?? [];

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onCancel} className="product-form-modal" maxWidth="900px">
          <div className="product-form-card surface-card-accent">
            <div className="form-header">
              <h3 className="form-title">{title}</h3>
              <button onClick={onCancel} className="btn-close"><X size={20} /></button>
            </div>

            <div className="form-grid">
              <ProductBasicFields
                formData={formData}
                setFormData={setFormData}
                categoryQuery={categoryQuery}
                setCategoryQuery={setCategoryQuery}
                showCategoryDropdown={showCategoryDropdown}
                setShowCategoryDropdown={setShowCategoryDropdown}
                isLoadingCategories={isLoadingCategories}
                categories={categories}
                getCategoryLabel={getCategoryLabel}
                formErrors={formErrors}
              />

              <ProductImageSection
                images={images}
                uploadingImageIndex={uploadingImageIndex}
                handleImageUpload={handleImageUpload}
                setActiveMediaLibraryIndex={setActiveMediaLibraryIndex}
                removeImageField={removeImageField}
                updateImageRole={updateImageRole}
                mediaInputAccept={mediaInputAccept}
                handleImagesDragEnd={handleImagesDragEnd}
                addImageField={addImageField}
              />

              <ProductVariantSection
                variants={variants}
                formErrors={formErrors}
                addVariant={addVariant}
                updateVariant={updateVariant}
                removeVariant={removeVariant}
                toggleDefault={toggleDefault}
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={onSave} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} />
                <span>Save Product</span>
              </button>
            </div>
          </div>
      </BaseModal>

      {activeMediaLibraryIndex !== null && (
        <MediaLibraryModal
          isOpen={true}
          onClose={() => setActiveMediaLibraryIndex(null)}
          onSelect={handleMediaSelect}
          allowMultiple={true}
        />
      )}
    </>
  );
}

export default ProductFormModal;
