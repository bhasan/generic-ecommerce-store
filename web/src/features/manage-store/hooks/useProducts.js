import { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';

export default function useProducts() {
  const {
    currentUser, products, isLoadingProducts, loadProducts, addProduct, updateProduct, deleteProduct,
    categories, isLoadingCategories, loadCategories, showNotification,
  } = useApp();

  const [orderedProducts, setOrderedProducts] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [childCategoriesByParent, setChildCategoriesByParent] = useState({});
  const [productsByCategory, setProductsByCategory] = useState({});

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    const sorted = [...products].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    setOrderedProducts(sorted);
    setProductsByCategory(
      sorted.reduce((acc, product) => {
        const key = product.categoryId || product.category?.id || 'uncategorized';
        acc[key] = acc[key] || [];
        acc[key].push(product);
        return acc;
      }, {})
    );
  }, [products]);

  useEffect(() => {
    const topLevel = categories
      .filter(c => !c.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    setTopLevelCategories(topLevel);

    const childrenMap = categories.reduce((acc, c) => {
      if (c.parentId) {
        acc[c.parentId] = acc[c.parentId] || [];
        acc[c.parentId].push(c);
      }
      return acc;
    }, {});
    Object.values(childrenMap).forEach(list =>
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    );
    setChildCategoriesByParent(childrenMap);
  }, [categories]);

  return {
    currentUser, products, isLoadingProducts, loadProducts, addProduct, updateProduct, deleteProduct,
    categories, isLoadingCategories, loadCategories, showNotification,
    orderedProducts, setOrderedProducts,
    topLevelCategories, setTopLevelCategories,
    childCategoriesByParent,
    productsByCategory, setProductsByCategory,
  };
}
