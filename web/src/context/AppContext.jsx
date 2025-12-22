import React, { useState, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { initialProducts, initialOrders } from '../data/mockData';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
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
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
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

  // Notification system
  const showNotification = (message, type = 'success', action = null) => {
    setNotification({ message, type, action });
  };

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
      const { user } = await authApi.register(data);
      
      // Ensure roles array exists
      if (!user.roles && user.role) {
        user.roles = [user.role];
      }
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      showNotification('Registration successful!', 'success');
      navigate('/products');
      return true;
    } catch (error) {
      const errorMessage = error.message || 'Registration failed. Please try again.';
      showNotification(errorMessage, 'error');
      return false;
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

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
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
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity } : item
    ));
  };

  const checkout = () => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const newOrder = {
      id: orders.length + 1,
      userId: currentUser.id,
      status: 'PENDING',
      total,
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price
      })),
      createdAt: new Date().toISOString().split('T')[0]
    };
    setOrders([...orders, newOrder]);
    setCart([]);
    showNotification('Order placed successfully! 🎉', 'success');
    navigate('/orders');
  };

  const addProduct = (product) => {
    setProducts([...products, { 
      ...product, 
      id: products.length + 1,
      images: product.images || [product.image],
      hidden: product.hidden || false,
      stockEnabled: product.stockEnabled !== false,
      reviews: []
    }]);
    showNotification('Product added successfully', 'success');
  };

  const updateProduct = (id, updates) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    showNotification('Product updated successfully', 'success');
  };

  const deleteProduct = (id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    showNotification('Product deleted', 'info');
  };

  const updateOrderStatus = (orderId, status) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    showNotification('Order status updated', 'success');
  };

  const deleteOrder = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    showNotification('Order deleted', 'info');
  };

  const addItemToOrder = (orderId, item) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const newItem = {
          ...item,
          addedAfterSubmission: true
        };
        const newItems = [...o.items, newItem];
        const newTotal = newItems.reduce((sum, i) => 
          i.voided ? sum : sum + (i.price * i.quantity), 0
        );
        return { ...o, items: newItems, total: newTotal };
      }
      return o;
    }));
    showNotification('Item added to order', 'success');
  };

  const voidOrderItem = (orderId, itemIndex) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const newItems = o.items.map((item, idx) => 
          idx === itemIndex ? { ...item, voided: true } : item
        );
        const newTotal = newItems.reduce((sum, item) => 
          item.voided ? sum : sum + (item.price * item.quantity), 0
        );
        return { ...o, items: newItems, total: newTotal };
      }
      return o;
    }));
    showNotification('Item voided', 'info');
  };

  const deleteOrderItem = (orderId, itemIndex) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const newItems = o.items.filter((_, idx) => idx !== itemIndex);
        const newTotal = newItems.reduce((sum, item) => 
          item.voided ? sum : sum + (item.price * item.quantity), 0
        );
        return { ...o, items: newItems, total: newTotal };
      }
      return o;
    }));
    showNotification('Item removed from order', 'info');
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
    login,
    register,
    logout, 
    products, 
    orders,
    setOrders,
    cart,
    setCart,
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    checkout,
    addProduct, 
    updateProduct, 
    deleteProduct,
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