import { arrayMove } from '@dnd-kit/sortable';
import * as productsApi from '../../../services/productsApi';
import * as categoriesApi from '../../../services/categoriesApi';

export default function useProductDragSort({
  orderedProducts, setOrderedProducts,
  productsByCategory, setProductsByCategory,
  topLevelCategories, setTopLevelCategories,
  loadProducts, loadCategories,
}) {
  const persistSort = async (list, updateFn, reload) => {
    const updates = list
      .map((item, index) => item.sortOrder !== index ? updateFn(item.id, { sortOrder: index }) : null)
      .filter(Boolean);
    if (updates.length) { await Promise.all(updates); await reload(); }
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedProducts.findIndex(i => i.id === active.id);
    const newIndex = orderedProducts.findIndex(i => i.id === over.id);
    const next = arrayMove(orderedProducts, oldIndex, newIndex);
    setOrderedProducts(next);
    await persistSort(next, productsApi.updateProduct, loadProducts);
  };

  const handleCategoryDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = topLevelCategories.findIndex(i => i.id === active.id);
    const newIndex = topLevelCategories.findIndex(i => i.id === over.id);
    const next = arrayMove(topLevelCategories, oldIndex, newIndex);
    setTopLevelCategories(next);
    await persistSort(next, categoriesApi.updateCategory, loadCategories);
  };

  const handleProductDragEnd = async (categoryId, { active, over }) => {
    if (!over || active.id === over.id) return;
    const list = productsByCategory[categoryId] || [];
    const oldIndex = list.findIndex(i => i.id === active.id);
    const newIndex = list.findIndex(i => i.id === over.id);
    const next = arrayMove(list, oldIndex, newIndex);
    setProductsByCategory({ ...productsByCategory, [categoryId]: next });
    await persistSort(next, productsApi.updateProduct, loadProducts);
  };

  return { handleDragEnd, handleCategoryDragEnd, handleProductDragEnd };
}
