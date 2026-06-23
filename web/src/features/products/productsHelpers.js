export const getCategoryLabel = (category) => {
  if (!category) return 'Uncategorized';
  if (category.parent) return `${category.parent.name} > ${category.name}`;
  return category.name;
};

export const PRODUCT_FALLBACK_IMAGE = '/images/smokestationtitle.png';

// Returns the URL of the first THUMBNAIL image, or the first GALLERY image, or the fallback.
export const getProductImageSrc = (item) => {
  if (item?.images?.length > 0) {
    const thumb = item.images.find(img => img.role === 'THUMBNAIL');
    const first = item.images.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    return (thumb || first)?.url || PRODUCT_FALLBACK_IMAGE;
  }
  return PRODUCT_FALLBACK_IMAGE;
};

// Returns all image URLs sorted by sortOrder (THUMBNAIL first within same sortOrder).
export const getProductAllImages = (item) => {
  if (!item?.images?.length) return [PRODUCT_FALLBACK_IMAGE];
  const sorted = [...item.images].sort((a, b) => {
    if (a.role === 'THUMBNAIL' && b.role !== 'THUMBNAIL') return -1;
    if (b.role === 'THUMBNAIL' && a.role !== 'THUMBNAIL') return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  return sorted.map(img => img.url);
};

// Returns the first active default variant, or the first active variant, or the first variant.
export const getDefaultVariant = (product) => {
  if (!product?.variants?.length) return null;
  return (
    product.variants.find(v => v.isDefault && v.active) ??
    product.variants.find(v => v.active) ??
    product.variants[0]
  );
};

export const getProductCategoryLabel = (product) => {
  if (product?.category && typeof product.category === 'object') {
    return getCategoryLabel(product.category);
  }
  return product?.category || 'Uncategorized';
};

// Returns allowed quantities for a variant (WEIGHT mode has explicit options; UNIT mode has none).
export const getAllowedQuantities = (variant) => {
  if (!variant?.quantityOptions?.length) return [];
  return [...variant.quantityOptions]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(opt => Number(opt.quantity));
};

// Returns the resolved unit price for a variant at a given quantity using price-break rules.
// Picks the break with the largest minQuantity <= qty; falls back to variant.basePrice.
export const getDiscountedUnitPrice = (variant, quantity) => {
  const breaks = variant?.priceBreaks ?? [];
  const eligible = breaks.filter(pb => Number(pb.minQuantity) <= quantity);
  if (eligible.length === 0) return Number(variant?.basePrice ?? 0);
  const best = eligible.reduce((a, b) =>
    Number(b.minQuantity) > Number(a.minQuantity) ? b : a
  );
  return Number(best.unitPrice);
};

export const sortProducts = (list) =>
  [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

export const groupProductsByCategory = (products, categories) => {
  if (!categories || categories.length === 0) {
    return { flat: products };
  }

  const byCategoryId = new Map();
  products.forEach((product) => {
    const id = product.categoryId || product.category?.id;
    if (!id) return;
    if (!byCategoryId.has(id)) byCategoryId.set(id, []);
    byCategoryId.get(id).push(product);
  });

  const topLevel = categories
    .filter((category) => !category.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const children = categories
    .filter((category) => category.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const childrenByParent = children.reduce((acc, category) => {
    acc[category.parentId] = acc[category.parentId] || [];
    acc[category.parentId].push(category);
    return acc;
  }, {});

  return { topLevel, childrenByParent, byCategoryId };
};
