import React from 'react';

function ProductQuantityActions({
  allowedQuantities,
  quantityValue,
  onQuantityChange,
  onAddToCart,
  addDisabled,
  onStopPropagation
}) {
  const options = allowedQuantities.length > 0
    ? allowedQuantities
    : Array.from({ length: 5 }, (_, index) => index + 1);

  return (
    <>
      <div className="quantity-controls" onClick={onStopPropagation}>
        <select
          className="quantity-select"
          value={quantityValue}
          onChange={(e) => onQuantityChange(parseFloat(e.target.value))}
        >
          {options.map((quantity) => (
            <option key={quantity} value={quantity}>
              {quantity}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={onAddToCart}
        disabled={addDisabled}
        className="btn-add-to-cart"
      >
        {addDisabled ? 'Out of Stock' : 'Add to Cart'}
      </button>
    </>
  );
}

export default ProductQuantityActions;
