import React, { useState } from 'react';
import { getProductImageSrc, getProductAllImages, getDiscountedUnitPrice, getAllowedQuantities, getDefaultVariant } from './productsHelpers';
import ProductQuantityActions from './ProductQuantityActions';
import ProductCard from './ProductCard';
import ProductListItem from './ProductListItem';

function ProductsGrid({
  products,
  viewMode,
  getCategoryLabel,
  onAddToCart,
  onProductClick,
  showHiddenLabel = false
}) {
  const [quantities, setQuantities] = useState({});

  const getVariant = (product) => getDefaultVariant(product);

  const getQuantityValue = (product) => {
    const variant = getVariant(product);
    const key = variant?.id ?? product.id;
    if (quantities[key] !== undefined) return quantities[key];
    const allowed = variant ? getAllowedQuantities(variant) : [];
    return allowed.length > 0 ? allowed[0] : 1;
  };

  const updateQuantity = (variantId, value) => {
    setQuantities((prev) => ({ ...prev, [variantId]: value }));
  };

  const renderProductCard = (product) => {
    const variant = getVariant(product);
    const mainImage = getProductImageSrc(product);
    const allImages = getProductAllImages(product);
    const showStock = variant?.stockEnabled !== false;
    const allowedQuantities = variant ? getAllowedQuantities(variant) : [];
    const quantityValue = getQuantityValue(product);
    const basePrice = Number(variant?.basePrice ?? 0);
    const discountedPrice = variant ? getDiscountedUnitPrice(variant, quantityValue) : basePrice;
    const hasDiscount = discountedPrice < basePrice;

    return (
      <ProductCard
        key={product.id}
        product={{ ...product, price: basePrice }}
        imageSrc={mainImage}
        images={allImages}
        categoryLabel={getCategoryLabel(product)}
        onClick={() => onProductClick(product.id)}
        discountedPrice={discountedPrice}
        hasDiscount={hasDiscount}
        quantity={quantityValue}
      >
        <ProductQuantityActions
          allowedQuantities={allowedQuantities}
          quantityValue={quantityValue}
          onQuantityChange={(value) => updateQuantity(variant?.id ?? product.id, value)}
          onAddToCart={(e) => {
            e.stopPropagation();
            onAddToCart(product, variant, quantityValue);
          }}
          addDisabled={showStock && Number(variant?.stock ?? 0) === 0}
          onStopPropagation={(e) => e.stopPropagation()}
        />
      </ProductCard>
    );
  };

  const renderProductListItem = (product) => {
    const variant = getVariant(product);
    const mainImage = getProductImageSrc(product);
    const showStock = variant?.stockEnabled !== false;
    const allowedQuantities = variant ? getAllowedQuantities(variant) : [];
    const quantityValue = getQuantityValue(product);
    const basePrice = Number(variant?.basePrice ?? 0);
    const discountedPrice = variant ? getDiscountedUnitPrice(variant, quantityValue) : basePrice;
    const hasDiscount = discountedPrice < basePrice;

    return (
      <ProductListItem
        key={product.id}
        product={{ ...product, price: basePrice, stock: Number(variant?.stock ?? 0) }}
        imageSrc={mainImage}
        categoryLabel={getCategoryLabel(product)}
        showStock={showStock}
        showHiddenLabel={showHiddenLabel}
        onClick={() => onProductClick(product.id)}
        discountedPrice={discountedPrice}
        hasDiscount={hasDiscount}
        quantity={quantityValue}
      >
        <ProductQuantityActions
          allowedQuantities={allowedQuantities}
          quantityValue={quantityValue}
          onQuantityChange={(value) => updateQuantity(variant?.id ?? product.id, value)}
          onAddToCart={(e) => {
            e.stopPropagation();
            onAddToCart(product, variant, quantityValue);
          }}
          addDisabled={showStock && Number(variant?.stock ?? 0) === 0}
          onStopPropagation={(e) => e.stopPropagation()}
        />
      </ProductListItem>
    );
  };

  if (viewMode === 'list') {
    return (
      <div className="products-list">{products.map(renderProductListItem)}</div>
    );
  }

  return (
    <div className={`products-grid ${viewMode === 'grid' ? 'products-grid-compact' : ''}`}>
      {products.map(renderProductCard)}
    </div>
  );
}

export default ProductsGrid;
