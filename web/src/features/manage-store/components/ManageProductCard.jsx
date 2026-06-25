import React from 'react';
import { Edit, Trash2, Image as ImageIcon, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProductImage from '../../products/ProductImage';
import { getProductImageSrc, getDefaultVariant } from '../../products/productsHelpers';
import './ManageProductCard.css';
import '../../products/ProductsPageAdmin.css';
import '../../products/ProductsShared.css';

function ManageProductCard({
  product, dragEnabled, onToggleHidden, onEdit, onDeleteClick,
  canDelete, canManage, getProductLabel, editingDisabled,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: !dragEnabled,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
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
      className={`manage-product-card${product.hidden ? ' manage-product-card-hidden' : ''}${isDragging ? ' manage-product-card-dragging' : ''}`}
    >
      <div className="manage-product-image-container">
        <ProductImage src={mainImage} alt={product.name} className="manage-product-image" />
        {imageCount > 1 && (
          <div className="manage-product-badge manage-product-badge-images">
            <ImageIcon size={12} /> {imageCount} images
          </div>
        )}
        {product.hidden && <div className="manage-product-badge manage-product-badge-hidden">Hidden</div>}
        {showStock && (
          <div className="manage-product-badge manage-product-badge-stock">
            {stock > 10 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock'}
          </div>
        )}
      </div>

      <div className="manage-product-content">
        <div className="manage-product-header">
          <h3 className="manage-product-name">{product.name}</h3>
          <span className="manage-product-category">{getProductLabel(product)}</span>
        </div>
        <p className="manage-product-description">{product.description}</p>
        <div className="manage-product-meta">
          <div className="manage-meta-item">
            <span className="manage-meta-label">Price</span>
            <span className="manage-product-price">${price.toFixed(2)}</span>
          </div>
          {showStock && (
            <div className="manage-meta-item">
              <span className="manage-meta-label">Stock</span>
              <span className={`manage-stock-badge${stock === 0 ? ' stock-empty' : stock < 10 ? ' stock-low' : ' stock-good'}`}>
                {stock} units
              </span>
            </div>
          )}
        </div>
        {canManage && (
          <div className="manage-product-actions">
            {dragEnabled && (
              <button type="button" className="manage-drag-handle" {...attributes} {...listeners} aria-label="Reorder product">
                <GripVertical size={16} />
              </button>
            )}
            <button onClick={() => onEdit(product)} className="btn-edit" disabled={editingDisabled}>
              <Edit size={14} /><span>Edit</span>
            </button>
            <button onClick={() => onToggleHidden(product.id, product.hidden)} className="btn-visibility"
              title={product.hidden ? 'Show product' : 'Hide product'}>
              {product.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            {canDelete && (
              <button onClick={() => onDeleteClick(product.id, product.name)} className="btn-delete" title="Delete product">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ManageProductCard;
