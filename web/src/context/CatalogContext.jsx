// web/src/context/CatalogContext.jsx
import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import * as productsApi from '../services/productsApi';
import * as categoriesApi from '../services/categoriesApi';
import { ROLES } from '../utils/roles';
import { useUIContext } from './UIContext';
import { useAuthContext } from './AuthContext';
import { useStoreSelection } from './StoreSelectionContext';

const CatalogContext = createContext(null);

export const useCatalogContext = () => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalogContext must be used within CatalogProvider');
  return ctx;
};

export function CatalogProvider({ children }) {
  const { showNotification } = useUIContext();
  const { currentUser, isLoading, isAuthenticated } = useAuthContext();
  const { activeStoreId } = useStoreSelection();

  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      const data = await productsApi.getAllProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const data = await categoriesApi.getAllCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  // Auto-load products and categories once auth check completes and user is authenticated.
  // Re-fetches when activeStoreId changes so per-store effective prices/stock load.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      Promise.allSettled([loadProducts(), loadCategories()]);
    }
  }, [isLoading, isAuthenticated, loadProducts, loadCategories, activeStoreId]);

  const addProduct = async (product) => {
    try {
      await productsApi.createProduct(product);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product added successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to add product. Please try again.', 'error');
      throw error;
    }
  };

  const updateProduct = async (id, updates) => {
    try {
      await productsApi.updateProduct(id, updates);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update product. Please try again.', 'error');
      throw error;
    }
  };

  const deleteProduct = async (id) => {
    try {
      await productsApi.deleteProduct(id);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product deleted', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to delete product. Please try again.', 'error');
      throw error;
    }
  };

  const createCategory = async (data) => {
    try {
      await categoriesApi.createCategory(data);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category created successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to create category. Please try again.', 'error');
      throw error;
    }
  };

  const updateCategory = async (id, updates) => {
    try {
      await categoriesApi.updateCategory(id, updates);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update category. Please try again.', 'error');
      throw error;
    }
  };

  const deleteCategory = async (id) => {
    try {
      await categoriesApi.deleteCategory(id);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category deleted', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to delete category. Please try again.', 'error');
      throw error;
    }
  };

  // Review mutations are optimistic local updates — no API round-trip
  const addReview = (productId, review) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newReview = {
        id: (p.reviews?.length || 0) + 1,
        userId: currentUser.id,
        userName: currentUser.username,
        rating: review.rating,
        comment: review.comment,
        date: new Date().toISOString().split('T')[0],
        helpful: 0,
        notHelpful: 0,
        flagged: false,
        replies: [],
      };
      return { ...p, reviews: [...(p.reviews || []), newReview] };
    }));
    showNotification('Review posted successfully', 'success');
  };

  const updateReview = (productId, reviewId, updates) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.map(r => r.id === reviewId ? { ...r, ...updates } : r) };
    }));
    showNotification('Review updated', 'success');
  };

  const deleteReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.filter(r => r.id !== reviewId) };
    }));
    showNotification('Review deleted', 'info');
  };

  const addReviewReply = (productId, reviewId, reply) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        reviews: p.reviews.map(r => {
          if (r.id !== reviewId) return r;
          const newReply = {
            id: (r.replies?.length || 0) + 1,
            userId: currentUser.id,
            userName: currentUser.username,
            userRole: currentUser.roles?.[0] || ROLES.CUSTOMER,
            comment: reply,
            date: new Date().toISOString().split('T')[0],
          };
          return { ...r, replies: [...(r.replies || []), newReply] };
        }),
      };
    }));
    showNotification('Reply added', 'success');
  };

  const voteReview = (productId, reviewId, type) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        reviews: p.reviews.map(r => {
          if (r.id !== reviewId) return r;
          return type === 'helpful' ? { ...r, helpful: r.helpful + 1 } : { ...r, notHelpful: r.notHelpful + 1 };
        }),
      };
    }));
  };

  const flagReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.map(r => r.id === reviewId ? { ...r, flagged: true } : r) };
    }));
    showNotification('Review flagged for moderation', 'info');
  };

  return (
    <CatalogContext.Provider value={{
      products, setProducts, isLoadingProducts,
      categories, isLoadingCategories,
      loadProducts, loadCategories,
      addProduct, updateProduct, deleteProduct,
      createCategory, updateCategory, deleteCategory,
      addReview, updateReview, deleteReview, addReviewReply, voteReview, flagReview,
    }}>
      {children}
    </CatalogContext.Provider>
  );
}
