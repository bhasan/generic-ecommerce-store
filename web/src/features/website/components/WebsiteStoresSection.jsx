import { useState, useEffect } from 'react';
import {
  getManagedStores,
  createStore,
  updateStore,
  setDefaultStore,
  cloneFromDefault,
} from '../../../services/storesApi';

const EMPTY_FORM = { name: '', slug: '' };

export default function WebsiteStoresSection() {
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  // Per-row edit state: { [storeId]: { name, slug, status } | null }
  const [editState, setEditState] = useState({});
  const [busyId, setBusyId] = useState(null);

  const loadStores = async () => {
    setIsLoading(true);
    try {
      const data = await getManagedStores();
      setStores(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load stores');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  const handleField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await createStore({ name: form.name.trim(), slug: form.slug.trim() });
      setForm(EMPTY_FORM);
      await loadStores();
    } catch (err) {
      setError(err.message || 'Failed to create store');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (store) => {
    setEditState((s) => ({
      ...s,
      [store.id]: { name: store.name, slug: store.slug, status: store.status },
    }));
  };

  const cancelEdit = (storeId) => {
    setEditState((s) => {
      const next = { ...s };
      delete next[storeId];
      return next;
    });
  };

  const handleEditField = (storeId, key) => (e) => {
    setEditState((s) => ({
      ...s,
      [storeId]: { ...s[storeId], [key]: e.target.value },
    }));
  };

  // Run a per-row store mutation with shared busy/error handling, then refresh.
  const runStoreAction = async (storeId, action, fallbackMessage) => {
    setError('');
    setBusyId(storeId);
    try {
      await action();
      await loadStores();
    } catch (err) {
      setError(err.message || fallbackMessage);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = (storeId) =>
    runStoreAction(storeId, async () => {
      const patch = editState[storeId];
      await updateStore(storeId, { name: patch.name.trim(), slug: patch.slug.trim(), status: patch.status });
      cancelEdit(storeId);
    }, 'Failed to update store');

  const handleToggleStatus = (store) => {
    const next = store.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    return runStoreAction(store.id, () => updateStore(store.id, { status: next }), 'Failed to update status');
  };

  const handleSetDefault = (storeId) =>
    runStoreAction(storeId, () => setDefaultStore(storeId), 'Failed to set default store');

  const handleCloneFromDefault = (storeId) =>
    runStoreAction(storeId, () => cloneFromDefault(storeId), 'Failed to clone from default');

  return (
    <div className="website-mgmt-section stores-section">
      <h2>Stores</h2>

      {error && (
        <div className="tenant-error" role="alert">{error}</div>
      )}

      <form className="tenant-create-form" onSubmit={handleCreate}>
        <h3>Create store</h3>
        <div className="tenant-form-grid">
          <div className="form-group">
            <label htmlFor="store-name">Name</label>
            <input
              id="store-name"
              type="text"
              value={form.name}
              onChange={handleField('name')}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="store-slug">Slug</label>
            <input
              id="store-slug"
              type="text"
              value={form.slug}
              onChange={handleField('slug')}
              required
            />
          </div>
        </div>
        <button type="submit" className="save-btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create store'}
        </button>
      </form>

      <div className="tenant-table-wrap">
        {isLoading ? (
          <p className="website-mgmt-loading">Loading stores…</p>
        ) : stores.length === 0 ? (
          <p className="tenant-empty">No stores yet.</p>
        ) : (
          <table className="tenant-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Default</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const editing = editState[store.id];
                const isBusy = busyId === store.id;
                return (
                  <tr key={store.id}>
                    <td>
                      {editing ? (
                        <input
                          aria-label="Edit name"
                          type="text"
                          value={editing.name}
                          onChange={handleEditField(store.id, 'name')}
                        />
                      ) : store.name}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          aria-label="Edit slug"
                          type="text"
                          value={editing.slug}
                          onChange={handleEditField(store.id, 'slug')}
                        />
                      ) : store.slug}
                    </td>
                    <td>
                      {store.isDefault && (
                        <span className="tenant-badge tenant-badge-active">Default</span>
                      )}
                    </td>
                    <td>
                      <span className={`tenant-badge tenant-badge-${(store.status || '').toLowerCase()}`}>
                        {store.status}
                      </span>
                    </td>
                    <td className="tenant-actions">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="save-btn"
                            onClick={() => handleSaveEdit(store.id)}
                            disabled={isBusy}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="save-btn save-btn-ghost"
                            onClick={() => cancelEdit(store.id)}
                            disabled={isBusy}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="save-btn save-btn-ghost"
                            onClick={() => startEdit(store)}
                            disabled={isBusy}
                          >
                            Edit
                          </button>
                          {!store.isDefault && (
                            <button
                              type="button"
                              className="save-btn save-btn-ghost"
                              onClick={() => handleSetDefault(store.id)}
                              disabled={isBusy}
                            >
                              Make default
                            </button>
                          )}
                          <button
                            type="button"
                            className="save-btn save-btn-ghost"
                            onClick={() => handleToggleStatus(store)}
                            disabled={isBusy}
                          >
                            {store.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="save-btn save-btn-ghost"
                            onClick={() => handleCloneFromDefault(store.id)}
                            disabled={isBusy}
                          >
                            Clone from default
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
