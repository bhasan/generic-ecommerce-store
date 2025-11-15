import React from 'react';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Trash2 } from 'lucide-react';

function CartPage() {
  const { cart, removeFromCart, updateCartQuantity, checkout } = useApp();
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // ... (rest of your CartPage JSX)
  if (cart.length === 0) {
    return (
      <div className="text-center py-12">
        <ShoppingCart size={64} className="mx-auto text-gray-600 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-400">Your cart is empty</h2>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-white">Shopping Cart</h2>
      <div className="bg-gray-800 rounded-lg shadow-md p-6 border border-gray-700">
        {cart.map(item => (
          <div key={item.id} className="flex items-center justify-between border-b border-gray-700 py-4 last:border-b-0">
            <div className="flex items-center space-x-4">
              <img src={item.image} alt={item.name} className="w-20 h-20 object-cover rounded" />
              <div>
                <h3 className="font-semibold text-white">{item.name}</h3>
                <p className="text-gray-400">${item.price}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                  className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600"
                >
                  -
                </button>
                <span className="w-8 text-center text-white">{item.quantity}</span>
                <button
                  onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                  className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600"
                >
                  +
                </button>
              </div>
              <span className="font-semibold w-20 text-right text-white">${(item.price * item.quantity).toFixed(2)}</span>
              <button
                onClick={() => removeFromCart(item.id)}
                className="text-red-500 hover:text-red-400"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
        <div className="mt-6 flex justify-between items-center">
          <span className="text-2xl font-bold text-white">Total: ${total.toFixed(2)}</span>
          <button
            onClick={checkout}
            className="bg-purple-800 text-white px-8 py-3 rounded-md hover:bg-purple-900 font-semibold"
          >
            Checkout (Payment Processing)
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartPage;