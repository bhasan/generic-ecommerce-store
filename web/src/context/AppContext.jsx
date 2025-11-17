import React, { useState, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { initialProducts, initialOrders } from '../data/mockData';

// Context for authentication and global state
const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState({ id: 999, email: 'guest@smokestation.com', role: 'CUSTOMER', name: 'Guest' });
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [cart, setCart] = useState([]);
  const [notification, setNotification] = useState(null);
  const [returnPath, setReturnPath] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Notification system
  const showNotification = (message, type = 'success', action = null) => {
    setNotification({ message, type, action });
  };

  const closeNotification = () => {
    setNotification(null);
  };

  const login = (email, password) => {
    // Mock login - in real app, this would call an API
    const users = {
      'customer@test.com': { id: 2, email: 'customer@test.com', role: 'CUSTOMER', name: 'John Customer' },
      'manager@test.com': { id: 3, email: 'manager@test.com', role: 'MANAGEMENT', name: 'Jane Manager' },
      'admin@test.com': { id: 1, email: 'admin@test.com', role: 'ADMIN', name: 'Admin User' },
    };
    
    const user = users[email];
    if (user) {
      setCurrentUser(user);
      
      // If there's a return path (e.g., guest tried to access orders), go there
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        // Otherwise, default navigation based on role
        navigate(user.role === 'CUSTOMER' ? '/products' : '/orders');
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser({ id: 999, email: 'guest@smokestation.com', role: 'CUSTOMER', name: 'Guest' });
    setCart([]);
    setReturnPath(null);
    navigate('/products');
    showNotification('You have been logged out', 'info');
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

  const updateUserProfile = (updates) => {
    setCurrentUser(prev => ({ ...prev, ...updates }));
    showNotification('Profile updated successfully', 'success');
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
                userRole: currentUser.role,
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
    login, 
    logout, 
    products, 
    orders, 
    cart,
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    checkout,
    addProduct, 
    updateProduct, 
    deleteProduct,
    updateOrderStatus, 
    deleteOrder,
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