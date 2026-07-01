import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../../context/AppContext';
import * as productsApi from '../../../services/productsApi';

export default function useProducts() {
  const {
    currentUser,
    addProduct: addProductShared,
    updateProduct: updateProductShared,
    deleteProduct: deleteProductShared,
    categories, isLoadingCategories, loadCategories, showNotification,
  } = useApp();

  // The manage-store screen edits the tenant-wide BASE catalog, so it must read
  // BASE (un-overridden) variant price/stock — NOT the per-store effective values
  // in the shared customer catalog (AppContext). Pre-filling the edit form with a
  // store-overridden price (and stock 0 for un-overridden variants at a non-default
  // store) and saving would silently overwrite the canonical basePrice and zero the
  // base stock for every store. Keep an independent base-scoped product list here.
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      const data = await productsApi.getAllProducts({ scope: 'base' });
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // Wrap the shared catalog mutations so the base list refreshes after a successful
  // write. The shared (store-effective) customer catalog is refreshed independently
  // inside AppContext; this keeps the management view showing canonical base values.
  const addProduct = useCallback(async (...args) => {
    const result = await addProductShared(...args);
    await loadProducts();
    return result;
  }, [addProductShared, loadProducts]);

  const updateProduct = useCallback(async (...args) => {
    const result = await updateProductShared(...args);
    await loadProducts();
    return result;
  }, [updateProductShared, loadProducts]);

  const deleteProduct = useCallback(async (...args) => {
    const result = await deleteProductShared(...args);
    await loadProducts();
    return result;
  }, [deleteProductShared, loadProducts]);

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
