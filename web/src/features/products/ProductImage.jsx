import React from 'react';
import { PRODUCT_FALLBACK_IMAGE } from './productsHelpers';

function ProductImage({ src, alt, className }) {
  const resolvedSrc = src || PRODUCT_FALLBACK_IMAGE;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={(e) => {
        e.target.src = PRODUCT_FALLBACK_IMAGE;
      }}
    />
  );
}

export default ProductImage;
