import React, { useEffect, useState } from 'react';
import './CategoriesPage.css';
import { useApp } from '../../context/AppContext';
import AdminLayout from '../../components/layout/AdminLayout';
import { Save, X, Trash2, Edit } from 'lucide-react';

function CategoriesPage() {
  const {
    categories,
    isLoadingCategories,
    loadCategories,
    createCategory,
    updateCategory,
    deleteCategory
  } = useApp();

  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '',
    sortOrder: ''
  });

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', parentId: '', sortOrder: '' });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Category name is required');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description?.trim() || undefined,
      parentId: formData.parentId ? parseInt(formData.parentId, 10) : null,
      sortOrder: formData.sortOrder !== '' ? parseInt(formData.sortOrder, 10) : undefined
    };

    if (editingId) {
      await updateCategory(editingId, payload);
    } else {
      await createCategory(payload);
    }

    resetForm();
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
      parentId: category.parentId ? String(category.parentId) : '',
      sortOrder: category.sortOrder ?? ''
    });
  };

  const handleDelete = (category) => {
    if (window.confirm(`Delete category "${category.name}"?`)) {
      deleteCategory(category.id);
    }
  };

  const topLevel = categories.filter(category => !category.parentId);
  const childrenMap = categories.reduce((acc, category) => {
    if (category.parentId) {
      acc[category.parentId] = acc[category.parentId] || [];
      acc[category.parentId].push(category);
    }
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="categories-page-container">
        <div className="categories-header">
          <div>
            <h2 className="page-title">Categories</h2>
            <p className="page-subtitle">Manage categories and subcategories</p>
          </div>
        </div>

        <div className="categories-form-card">
          <div className="form-grid">
            <div className="form-group">
              <label>Category Name *</label>
              <input
                type="text"
                placeholder="e.g., Accessories"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Parent Category (optional)</label>
              <select
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                className="form-input"
              >
                <option value="">No parent (top-level)</option>
                {topLevel.map(parent => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Sort Order (optional)</label>
              <input
                type="number"
                placeholder="0"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group form-group-full">
              <label>Description (optional)</label>
              <textarea
                placeholder="Short description of this category..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>

          <div className="form-actions">
            <button onClick={handleSave} className="btn-save">
              <Save size={16} />
              <span>{editingId ? 'Update Category' : 'Add Category'}</span>
            </button>
            <button onClick={resetForm} className="btn-cancel">
              <X size={16} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="categories-list">
          {isLoadingCategories ? (
            <div className="empty-state">
              <p>Loading categories...</p>
            </div>
          ) : topLevel.length === 0 ? (
            <div className="empty-state">
              <p>No categories yet.</p>
            </div>
          ) : (
            topLevel.map(parent => (
              <div key={parent.id} className="category-group">
                <div className="category-row">
                  <div className="category-name">
                    <div>{parent.name}</div>
                    {parent.description && <div className="category-description">{parent.description}</div>}
                  </div>
                  <div className="category-actions">
                    <button onClick={() => handleEdit(parent)} className="btn-edit">
                      <Edit size={14} />
                      <span>Edit</span>
                    </button>
                    <button onClick={() => handleDelete(parent)} className="btn-delete">
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {(childrenMap[parent.id] || []).map(child => (
                  <div key={child.id} className="category-row category-row-child">
                    <div className="category-name">
                      <div>{child.name}</div>
                      {child.description && <div className="category-description">{child.description}</div>}
                    </div>
                    <div className="category-actions">
                      <button onClick={() => handleEdit(child)} className="btn-edit">
                        <Edit size={14} />
                        <span>Edit</span>
                      </button>
                      <button onClick={() => handleDelete(child)} className="btn-delete">
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default CategoriesPage;
