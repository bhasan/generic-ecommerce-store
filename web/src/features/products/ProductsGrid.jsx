import React, { useState } from 'react';
import { getProductImageSrc, getProductAllImages, getDiscountedUnitPrice, resolveQuantityDiscounts } from './productsHelpers';
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

  const resolveAllowedQuantities = (product) => {
    if (product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0) {
      return product.allowedQuantitiesOverride;
    }
    return product.category?.allowedQuantities || [];
  };

  const getQuantityValue = (product) => {
    if (quantities[product.id] !== undefined) return quantities[product.id];
    const allowed = resolveAllowedQuantities(product);
    return allowed.length > 0 ? allowed[0] : 1;
  };

  const updateQuantity = (productId, value) => {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
  };

  const renderProductCard = (product) => {
    const mainImage = getProductImageSrc(product);
    const allImages = getProductAllImages(product);
    const showStock = product.stockEnabled !== false;
    const allowedQuantities = resolveAllowedQuantities(product);
    const quantityValue = getQuantityValue(product);
    const discountedPrice = getDiscountedUnitPrice(product, quantityValue);
    const hasDiscount = discountedPrice < product.price;

    return (
      <ProductCard
        key={product.id}
        product={product}
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
          onQuantityChange={(value) => updateQuantity(product.id, value)}
          onAddToCart={(e) => {
            e.stopPropagation();
            onAddToCart(product, quantityValue);
          }}
          addDisabled={showStock && product.stock === 0}
          onStopPropagation={(e) => e.stopPropagation()}
        />
      </ProductCard>
    );
  };

  const renderProductListItem = (product) => {
    const mainImage = getProductImageSrc(product);
    const showStock = product.stockEnabled !== false;
    const allowedQuantities = resolveAllowedQuantities(product);
    const quantityValue = getQuantityValue(product);
    const discountedPrice = getDiscountedUnitPrice(product, quantityValue);
    const hasDiscount = discountedPrice < product.price;

    return (
      <ProductListItem
        key={product.id}
        product={product}
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
          onQuantityChange={(value) => updateQuantity(product.id, value)}
          onAddToCart={(e) => {
            e.stopPropagation();
            onAddToCart(product, quantityValue);
          }}
          addDisabled={showStock && product.stock === 0}
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
