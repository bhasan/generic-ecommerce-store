import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

function ProductsPage() {
  const { products, addToCart } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const categories = ['All', ...new Set(products.map(p => p.category))];
  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  // ... (rest of your ProductsPage JSX)
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-white">Products</h2>
      <div className="mb-6 flex space-x-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-md ${selectedCategory === cat ? 'bg-purple-800 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map(product => (
          <div key={product.id} className="bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl hover:shadow-purple-800/50 transition-shadow border border-gray-700">
            <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-2 text-white">{product.name}</h3>
              <p className="text-sm text-gray-400 mb-2">{product.description}</p>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">{product.category}</span>
                <span className="text-sm text-gray-500">Stock: {product.stock}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold text-purple-600">${product.price}</span>
                <button
                  onClick={() => addToCart(product)}
                  disabled={product.stock === 0}
                  className="bg-purple-800 text-white px-4 py-2 rounded-md hover:bg-purple-900 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductsPage;