import React from 'react';
import { Image as ImageIcon, GripVertical, Upload, X, Library } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const getDisplayName = (url) => {
  if (!url) return '';
  return url.startsWith('/api/uploads/') ? url.replace('/api/uploads/', '') : url;
};

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

export default function ProductImageSection({
  images,
  uploadingImageIndex,
  handleImageUpload,
  setActiveMediaLibraryIndex,
  removeImageField,
  updateImageRole,
  mediaInputAccept,
  handleImagesDragEnd,
  addImageField
}) {
  return (
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
  );
}
