import React, { useState, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { initialProducts, initialOrders } from '../data/mockData';

// Context for authentication and global state
const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState({ id: 999, email: 'guest@smokstation.com', role: 'CUSTOMER', name: 'Guest' });
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [cart, setCart] = useState([]);
  const navigate = useNavigate();

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
      // Use navigate instead of setView
      navigate(user.role === 'CUSTOMER' ? '/products' : '/orders');
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setCart([]);
    navigate('/login');
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
    
    if (confirm('Item added to cart! Would you like to go to checkout?')) {
      navigate('/cart');
    }
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
    alert('Order placed successfully!');
    navigate('/products');
  };

  const addProduct = (product) => {
    setProducts([...products, { ...product, id: products.length + 1 }]);
  };

  const updateProduct = (id, updates) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProduct = (id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const updateOrderStatus = (orderId, status) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

  const deleteOrder = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const value = {
    currentUser, login, logout, products, orders, cart,
    addToCart, removeFromCart, updateCartQuantity, checkout,
    addProduct, updateProduct, deleteProduct,
    updateOrderStatus, deleteOrder
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}