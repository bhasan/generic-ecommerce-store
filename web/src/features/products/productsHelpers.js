export const getCategoryLabel = (category) => {
  if (!category) return 'Uncategorized';
  if (category.parent) return `${category.parent.name} > ${category.name}`;
  return category.name;
};

export const PRODUCT_FALLBACK_IMAGE = '/images/smokestationtitle.png';

export const getProductImageSrc = (item) =>
  item?.image || (item?.images && item.images[0]) || PRODUCT_FALLBACK_IMAGE;

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
