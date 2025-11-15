import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Edit, Trash2 } from 'lucide-react';

function ManageProductsPage() {
  const { currentUser, products, addProduct, updateProduct, deleteProduct } = useApp();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', category: '', price: '', description: '', image: '', stock: ''
  });
  
  // ... (rest of your ManageProductsPage logic and JSX)
  const handleEdit = (product) => {
    setEditingId(product.id);
    setFormData(product);
  };

  const handleSave = () => {
    if (editingId) {
      updateProduct(editingId, formData);
      setEditingId(null);
    } else {
      addProduct({ ...formData, price: parseFloat(formData.price), stock: parseInt(formData.stock) });
      setShowAddForm(false);
    }
    setFormData({ name: '', category: '', price: '', description: '', image: '', stock: '' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({ name: '', category: '', price: '', description: '', image: '', stock: '' });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Manage Products</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-purple-800 text-white px-4 py-2 rounded-md hover:bg-purple-900 flex items-center space-x-1"
        >
          <Plus size={20} />
          <span>Add Product</span>
        </button>
      </div>

      {(showAddForm || editingId) && (
        <div className="bg-gray-800 rounded-lg shadow-md p-6 mb-6 border border-gray-700">
          <h3 className="text-xl font-semibold mb-4 text-white">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Product Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700"
            />
            <input
              type="text"
              placeholder="Category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700"
            />
            <input
              type="number"
              placeholder="Price"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700"
            />
            <input
              type="number"
              placeholder="Stock"
              value={formData.stock}
              onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700"
            />
            <input
              type="text"
              placeholder="Image URL"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.storage.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700 col-span-2"
            />
            <textarea
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="border border-gray-600 rounded-md px-3 py-2 bg-gray-700 text-white focus:ring-purple-700 col-span-2"
              rows={3}
            />
          </div>
          <div className="flex space-x-2 mt-4">
            <button
              onClick={handleSave}
              className="bg-purple-800 text-white px-6 py-2 rounded-md hover:bg-purple-900"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="bg-gray-600 text-gray-200 px-6 py-2 rounded-md hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => (
          <div key={product.id} className="bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-700">
            <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-2 text-white">{product.name}</h3>
              <p className="text-sm text-gray-400 mb-2">{product.description}</p>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">{product.category}</span>
                <span className="text-sm text-gray-500">Stock: {product.stock}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-purple-600">${product.price}</span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(product)}
                    className="bg-purple-800 text-white p-2 rounded-md hover:bg-purple-900"
                  >
                    <Edit size={16} />
                  </button>
                  {currentUser.role === 'ADMIN' && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this product?')) {
                          deleteProduct(product.id);
                        }
                      }}
                      className="bg-red-600 text-white p-2 rounded-md hover:bg-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ManageProductsPage;