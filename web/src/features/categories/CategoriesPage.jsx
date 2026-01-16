import React, { useEffect, useState } from 'react';
import './CategoriesPage.css';
import { useApp } from '../../context/AppContext';
import AdminLayout from '../../components/layout/AdminLayout';
import * as categoriesApi from '../../services/categoriesApi';
import { Save, X, Trash2, Edit, GripVertical } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableCategoryRow({ category, onEdit, onDelete, isChild }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`category-row ${isChild ? 'category-row-child' : ''} ${isDragging ? 'category-row-dragging' : ''}`}
    >
      <button type="button" className="drag-handle" {...attributes} {...listeners} aria-label="Reorder category">
        <GripVertical size={14} />
      </button>
      <div className="category-name">
        <div>{category.name}</div>
        {category.description && <div className="category-description">{category.description}</div>}
      </div>
      <div className="category-actions">
        <button onClick={() => onEdit(category)} className="btn-edit">
          <Edit size={14} />
          <span>Edit</span>
        </button>
        <button onClick={() => onDelete(category)} className="btn-delete">
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
}

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
  const [topLevelOrder, setTopLevelOrder] = useState([]);
  const [childOrderByParent, setChildOrderByParent] = useState({});

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const topLevel = categories
      .filter(category => !category.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    const childrenMap = categories.reduce((acc, category) => {
      if (category.parentId) {
        acc[category.parentId] = acc[category.parentId] || [];
        acc[category.parentId].push(category);
      }
      return acc;
    }, {});

    Object.keys(childrenMap).forEach(parentId => {
      childrenMap[parentId].sort((a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      );
    });

    setTopLevelOrder(topLevel);
    setChildOrderByParent(childrenMap);
  }, [categories]);

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

  const persistSortOrder = async (list) => {
    const updates = list
      .map((item, index) =>
        item.sortOrder !== index
          ? categoriesApi.updateCategory(item.id, { sortOrder: index })
          : null
      )
      .filter(Boolean);

    if (updates.length) {
      await Promise.all(updates);
      await loadCategories();
    }
  };

  const handleTopLevelDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = topLevelOrder.findIndex(item => item.id === active.id);
    const newIndex = topLevelOrder.findIndex(item => item.id === over.id);
    const next = arrayMove(topLevelOrder, oldIndex, newIndex);
    setTopLevelOrder(next);
    await persistSortOrder(next);
  };

  const handleChildDragEnd = async (parentId, { active, over }) => {
    if (!over || active.id === over.id) return;
    const list = childOrderByParent[parentId] || [];
    const oldIndex = list.findIndex(item => item.id === active.id);
    const newIndex = list.findIndex(item => item.id === over.id);
    const next = arrayMove(list, oldIndex, newIndex);
    setChildOrderByParent({ ...childOrderByParent, [parentId]: next });
    await persistSortOrder(next);
  };

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
                {topLevelOrder.map(parent => (
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
          ) : topLevelOrder.length === 0 ? (
            <div className="empty-state">
              <p>No categories yet.</p>
            </div>
          ) : (
            topLevelOrder.map(parent => (
              <div key={parent.id} className="category-group">
                <DndContext collisionDetection={closestCenter} onDragEnd={handleTopLevelDragEnd}>
                  <SortableContext items={topLevelOrder.map(item => item.id)} strategy={verticalListSortingStrategy}>
                    <SortableCategoryRow
                      category={parent}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </SortableContext>
                </DndContext>

                {(childOrderByParent[parent.id] || []).length > 0 && (
                  <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleChildDragEnd(parent.id, event)}
                  >
                    <SortableContext
                      items={(childOrderByParent[parent.id] || []).map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {(childOrderByParent[parent.id] || []).map(child => (
                        <SortableCategoryRow
                          key={child.id}
                          category={child}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          isChild
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default CategoriesPage;
