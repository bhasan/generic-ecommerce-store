export const getCategoryLabel = (category) => {
  if (!category) return 'Uncategorized';
  if (category.parent) return `${category.parent.name} > ${category.name}`;
  return category.name;
};

export const PRODUCT_FALLBACK_IMAGE = '/images/smokestationtitle.png';

export const getProductImageSrc = (item) =>
  item?.image || (item?.images && item.images[0]) || PRODUCT_FALLBACK_IMAGE;

export const getProductCategoryLabel = (product) => {
  if (product?.category && typeof product.category === 'object') {
    return getCategoryLabel(product.category);
  }
  return product?.category || 'Uncategorized';
};

export const resolveQuantityDiscounts = (product) => {
  // Check product override first
  if (product?.quantityDiscountsOverride && Array.isArray(product.quantityDiscountsOverride) && product.quantityDiscountsOverride.length > 0) {
    return product.quantityDiscountsOverride;
  }
  // Fall back to category discounts
  const categoryDiscounts = product?.category?.quantityDiscounts;
  if (categoryDiscounts && Array.isArray(categoryDiscounts) && categoryDiscounts.length > 0) {
    return categoryDiscounts;
  }
  return [];
};

export const getDiscountedUnitPrice = (product, quantity) => {
  const rules = resolveQuantityDiscounts(product);
  const match = rules.find((rule) => Math.abs(rule.quantity - quantity) < 1e-9);
  if (!match) return product.price;
  
  // For percent: discount applies per unit
  // For fixed: discount applies to total, so we calculate the effective unit discount
  if (match.type === 'percent') {
    const discount = product.price * (match.value / 100);
    return Math.max(0, product.price - discount);
  } else {
    // Fixed discount on total - calculate effective unit price
    const totalOriginal = product.price * quantity;
    const totalDiscounted = Math.max(0, totalOriginal - match.value);
    return totalDiscounted / quantity;
  }
};

export const formatQuantityDiscounts = (rules = []) =>
  rules
    .map((rule) =>
      `${rule.quantity}:${rule.type === 'percent' ? `${rule.value}%` : `$${rule.value}`}`
    )
    .join(', ');

export const parseQuantityDiscounts = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [quantityPart, discountPartRaw] = entry.split(':').map((part) => part.trim());
      const quantity = Number(quantityPart);
      if (!Number.isFinite(quantity) || quantity <= 0 || !discountPartRaw) return null;
      const discountPart = discountPartRaw.replace(/\s/g, '');
      if (discountPart.endsWith('%')) {
        const valueNum = Number(discountPart.replace('%', ''));
        if (!Number.isFinite(valueNum) || valueNum < 0 || valueNum > 100) return null;
        return { quantity, type: 'percent', value: valueNum };
      }
      const fixedValue = Number(discountPart.replace('$', ''));
      if (!Number.isFinite(fixedValue) || fixedValue < 0) return null;
      return { quantity, type: 'fixed', value: fixedValue };
    })
    .filter(Boolean);
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
