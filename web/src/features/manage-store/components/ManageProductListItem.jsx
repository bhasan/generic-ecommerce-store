import React from 'react';
import { Edit, Trash2, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProductImage from '../../products/ProductImage';
import { getProductImageSrc, getDefaultVariant } from '../../products/productsHelpers';
import '../../products/ProductsPageAdmin.css';
import '../../products/ProductsShared.css';

function ManageProductListItem({
  product, dragEnabled, onToggleHidden, onEdit, onDeleteClick,
  canDelete, canManage, getProductLabel, editingDisabled,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: !dragEnabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const mainImage = getProductImageSrc(product);
  const defVariant = getDefaultVariant(product);
  const showStock = defVariant?.stockEnabled !== false;
  const stock = Number(defVariant?.stock ?? 0);
  const price = Number(defVariant?.basePrice ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`product-list-item${product.hidden ? ' product-list-item-hidden' : ''}${isDragging ? ' product-list-item-dragging' : ''}`}
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
                <span className={`product-list-stock${stock === 0 ? ' is-out' : ''}`}>
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
          <button onClick={() => onToggleHidden(product.id, product.hidden)} className="btn-visibility"
            title={product.hidden ? 'Show product' : 'Hide product'}>
            {product.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button onClick={() => onEdit(product)} className="btn-edit" disabled={editingDisabled}>
            <Edit size={16} /><span>Edit</span>
          </button>
          {canDelete && (
            <button onClick={() => onDeleteClick(product.id, product.name)} className="btn-delete" title="Delete product">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ManageProductListItem;
