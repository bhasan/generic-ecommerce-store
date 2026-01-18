import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
import * as productsApi from '../services/productsApi';
import * as ordersApi from '../services/ordersApi';
import * as categoriesApi from '../services/categoriesApi';
import { getAuthToken } from '../services/api';

// Context for authentication and global state
const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export function AppProvider({ children }) {
  // Initialize user from localStorage or default guest
  const getInitialUser = () => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        // Ensure roles array exists (for backward compatibility)
        if (!user.roles && user.role) {
          user.roles = [user.role];
        }
        return user;
      } catch (e) {
        console.error('Error parsing stored user data:', e);
      }
    }
    return { id: 999, email: 'guest@smokestation.com', roles: ['CUSTOMER'], name: 'Guest' };
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [cart, setCart] = useState([]);
  const [notification, setNotification] = useState(null);
  const [returnPath, setReturnPath] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const user = await authApi.getProfile();
          // Ensure roles array exists
          if (!user.roles && user.role) {
            user.roles = [user.role];
          }
          setCurrentUser(user);
          setIsAuthenticated(true);
        } catch (error) {
          // Token invalid or expired
          console.error('Auth check failed:', error);
          setCurrentUser({ id: 999, email: 'guest@smokestation.com', roles: ['CUSTOMER'], name: 'Guest' });
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Load products function (can be called manually)
  const loadProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load products:', error);
      // Don't show error notification on initial load, just log it
      // Products will remain empty array
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  // Load products on mount (after auth check)
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load orders function (can be called manually)
  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      return;
    }

    try {
      setIsLoadingOrders(true);
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load orders:', error);
      // Don't show error notification on initial load, just log it
      // Orders will remain empty array
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isAuthenticated]);

  // Load orders on mount (after auth check, only if authenticated)
  useEffect(() => {
    if (!isLoading) {
      loadOrders();
    }
  }, [isAuthenticated, isLoading]);

  // Notification system
  const showNotification = useCallback((message, type = 'success', action = null) => {
    setNotification({ message, type, action });
  }, []);

  useEffect(() => {
    const handleBackendUnavailable = (event) => {
      const message = event?.detail?.message
        || 'We are having trouble reaching the server. Please try again shortly.';
      showNotification(message, 'warning', {
        label: 'Reload',
        onClick: () => window.location.reload()
      });
    };

    window.addEventListener('backend:unavailable', handleBackendUnavailable);
    return () => {
      window.removeEventListener('backend:unavailable', handleBackendUnavailable);
    };
  }, [showNotification]);

  const closeNotification = () => {
    setNotification(null);
  };

  const login = async (email, password) => {
    try {
      const { user } = await authApi.login(email, password);
      
      // Ensure roles array exists
      if (!user.roles && user.role) {
        user.roles = [user.role];
      }
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      // If there's a return path (e.g., guest tried to access orders), go there
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        // Otherwise, default navigation based on primary role
        const primaryRole = user.roles?.[0] || 'CUSTOMER';
        navigate(primaryRole === 'CUSTOMER' ? '/products' : '/orders');
      }
      
      showNotification('Login successful!', 'success');
      return true;
    } catch (error) {
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      showNotification(errorMessage, 'error');
      return false;
    }
  };

  const register = async (data) => {
    try {
      const response = await authApi.register(data);
      
      // Registration successful but user needs approval
      // Don't set authentication state, just return success
      const message = response.message || 'Registration successful! Please visit the store to get approved.';
      showNotification(message, 'success');
      return { success: true, message };
    } catch (error) {
      const errorMessage = error.message || 'Registration failed. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCurrentUser({ id: 999, email: 'guest@smokestation.com', roles: ['CUSTOMER'], name: 'Guest' });
      setIsAuthenticated(false);
      setCart([]);
      setReturnPath(null);
      navigate('/products');
      showNotification('You have been logged out', 'info');
    }
  };

  const resolveAllowedQuantities = (product) => {
    if (product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0) {
      return product.allowedQuantitiesOverride;
    }
    return product.category?.allowedQuantities || [];
  };

  const isQuantityAllowed = (quantity, allowedQuantities) => {
    return allowedQuantities.some((allowed) => Math.abs(allowed - quantity) < 1e-9);
  };

  const addToCart = (product, quantity) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      const allowedQuantities = resolveAllowedQuantities(product);

      let requestedQuantity = quantity;
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        if (allowedQuantities.length > 0) {
          if (existing) {
            const currentIndex = allowedQuantities.findIndex((value) => Math.abs(value - existing.quantity) < 1e-9);
            requestedQuantity = currentIndex >= 0 && currentIndex < allowedQuantities.length - 1
              ? allowedQuantities[currentIndex + 1]
              : existing.quantity;
          } else {
            requestedQuantity = allowedQuantities[0];
          }
        } else {
          requestedQuantity = 1;
        }
      }

      const desiredQuantity = existing ? existing.quantity + requestedQuantity : requestedQuantity;
      const nextQuantity = allowedQuantities.length > 0
        ? (isQuantityAllowed(desiredQuantity, allowedQuantities)
          ? desiredQuantity
          : isQuantityAllowed(requestedQuantity, allowedQuantities)
            ? requestedQuantity
            : allowedQuantities[0])
        : desiredQuantity;

      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      return [...prev, { ...product, quantity: nextQuantity }];
    });
    
    showNotification(
      `${product.name} added to cart!`,
      'success',
      {
        label: 'View Cart',
        onClick: () => {
          navigate('/cart');
          closeNotification();
        }
      }
    );
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    const normalizedQuantity = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity: normalizedQuantity } : item
    ));
  };

  const checkout = async () => {
    try {
      // Convert cart items to API format
      const items = cart.map(item => ({
        productId: item.id,
        quantity: item.quantity
      }));

      // Create order via API
      const newOrder = await ordersApi.createOrder(items);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      // Clear cart
      setCart([]);
      
      showNotification('Order placed successfully! 🎉', 'success');
      
      // Return order for caller to handle navigation with additional data
      return newOrder;
    } catch (error) {
      const errorMessage = error.message || 'Failed to place order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const addProduct = async (product) => {
    try {
      await productsApi.createProduct(product);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product added successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to add product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const updateProduct = async (id, updates) => {
    try {
      await productsApi.updateProduct(id, updates);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const deleteProduct = async (id) => {
    try {
      await productsApi.deleteProduct(id);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const createCategory = async (data) => {
    try {
      await categoriesApi.createCategory(data);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category created successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to create category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const updateCategory = async (id, updates) => {
    try {
      await categoriesApi.updateCategory(id, updates);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const deleteCategory = async (id) => {
    try {
      await categoriesApi.deleteCategory(id);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await ordersApi.updateOrderStatus(orderId, status);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Order status updated', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update order status. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const deleteOrder = async (orderId) => {
    try {
      await ordersApi.deleteOrder(orderId);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Order deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const addItemToOrder = async (orderId, productIdOrItem, quantity) => {
    try {
      // Handle both old format (object with productId, quantity, price) and new format (productId, quantity)
      let productId, itemQuantity;
      if (typeof productIdOrItem === 'object' && productIdOrItem.productId) {
        // Old format: addItemToOrder(orderId, { productId, quantity, price })
        productId = productIdOrItem.productId;
        itemQuantity = productIdOrItem.quantity;
      } else {
        // New format: addItemToOrder(orderId, productId, quantity)
        productId = productIdOrItem;
        itemQuantity = quantity;
      }

      await ordersApi.addItemToOrder(orderId, productId, itemQuantity);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item added to order', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to add item to order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const voidOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      // Handle both itemId (from API) and itemIndex (array index from old code)
      let itemId = itemIdOrIndex;
      
      // If it's an index, find the actual item ID from the order
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order && order.items && order.items[itemIdOrIndex]) {
          // Check if items have id field (from API) or use index
          const item = order.items[itemIdOrIndex];
          itemId = item.id || itemIdOrIndex;
        }
      }

      await ordersApi.voidOrderItem(orderId, itemId);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item voided', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to void item. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const deleteOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      // Handle both itemId (from API) and itemIndex (array index from old code)
      let itemId = itemIdOrIndex;
      
      // If it's an index, find the actual item ID from the order
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order && order.items && order.items[itemIdOrIndex]) {
          // Check if items have id field (from API) or use index
          const item = order.items[itemIdOrIndex];
          itemId = item.id || itemIdOrIndex;
        }
      }

      await ordersApi.deleteOrderItem(orderId, itemId);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item removed from order', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to remove item from order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const restoreOrder = (orderState) => {
    setOrders(prev => prev.map(o => 
      o.id === orderState.id ? orderState : o
    ));
  };

  const updateUserProfile = async (updates) => {
    try {
      const updatedUser = await usersApi.updateUser(currentUser.id, updates);
      
      // Ensure roles array exists
      if (!updatedUser.roles && updatedUser.role) {
        updatedUser.roles = [updatedUser.role];
      }
      
      setCurrentUser(updatedUser);
      showNotification('Profile updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update profile. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Review management
  const addReview = (productId, review) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const newReview = {
          id: (p.reviews?.length || 0) + 1,
          userId: currentUser.id,
          userName: currentUser.name,
          rating: review.rating,
          comment: review.comment,
          date: new Date().toISOString().split('T')[0],
          helpful: 0,
          notHelpful: 0,
          flagged: false,
          replies: []
        };
        return { ...p, reviews: [...(p.reviews || []), newReview] };
      }
      return p;
    }));
    showNotification('Review posted successfully', 'success');
  };

  const updateReview = (productId, reviewId, updates) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => r.id === reviewId ? { ...r, ...updates } : r)
        };
      }
      return p;
    }));
    showNotification('Review updated', 'success');
  };

  const deleteReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return { ...p, reviews: p.reviews.filter(r => r.id !== reviewId) };
      }
      return p;
    }));
    showNotification('Review deleted', 'info');
  };

  const addReviewReply = (productId, reviewId, reply) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => {
            if (r.id === reviewId) {
              const newReply = {
                id: (r.replies?.length || 0) + 1,
                userId: currentUser.id,
                userName: currentUser.name,
                userRole: currentUser.roles?.[0] || 'CUSTOMER',
                comment: reply,
                date: new Date().toISOString().split('T')[0]
              };
              return { ...r, replies: [...(r.replies || []), newReply] };
            }
            return r;
          })
        };
      }
      return p;
    }));
    showNotification('Reply added', 'success');
  };

  const voteReview = (productId, reviewId, type) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => {
            if (r.id === reviewId) {
              if (type === 'helpful') {
                return { ...r, helpful: r.helpful + 1 };
              } else {
                return { ...r, notHelpful: r.notHelpful + 1 };
              }
            }
            return r;
          })
        };
      }
      return p;
    }));
  };

  const flagReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => 
            r.id === reviewId ? { ...r, flagged: true } : r
          )
        };
      }
      return p;
    }));
    showNotification('Review flagged for moderation', 'info');
  };

  const value = {
    currentUser, 
    isAuthenticated,
    isLoading,
    isLoadingProducts,
    isLoadingOrders,
    isLoadingCategories,
    login,
    register,
    logout, 
    products, 
    loadProducts,
    categories,
    loadCategories,
    orders,
    setOrders,
    loadOrders,
    cart,
    setCart,
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    checkout,
    addProduct, 
    updateProduct, 
    deleteProduct,
    createCategory,
    updateCategory,
    deleteCategory,
    updateOrderStatus, 
    deleteOrder,
    addItemToOrder,
    voidOrderItem,
    deleteOrderItem,
    restoreOrder,
    updateUserProfile,
    notification,
    showNotification,
    closeNotification,
    returnPath,
    setReturnPath,
    addReview,
    updateReview,
    deleteReview,
    addReviewReply,
    voteReview,
    flagReview
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}