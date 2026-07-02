import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, X, AlertTriangle, Activity } from 'lucide-react';
import {
  listTenants,
  createTenant,
  updateTenant,
  setTenantStatus,
  deleteTenant,
  regenerateTokens,
} from '../../../services/tenantApi';

// Platform tenant management — SUPER_ADMIN only. Lives in the /admin console.

const EMPTY_FORM = { slug: '', name: '', plan: '', adminUsername: '', adminPassword: '' };
const STATUS_FILTERS = [
  { value: '', label: 'Active & suspended' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'all', label: 'All (incl. deleted)' },
];

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="tenant-copy-btn" onClick={onCopy} aria-label="Copy to clipboard">
      <Copy size={14} />
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export default function AdminTenantsSection() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', plan: '' });

  const loadTenants = async (filter = statusFilter) => {
    setIsLoading(true);
    try {
      const data = await listTenants(filter || undefined);
      setTenants(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load tenants');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const body = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        adminUsername: form.adminUsername.trim(),
        adminPassword: form.adminPassword,
      };
      if (form.plan.trim()) body.plan = form.plan.trim();
      const result = await createTenant(body);
      setRevealed({
        title: `Tokens for ${result?.tenant?.slug || body.slug}`,
        reportingToken: result?.reportingToken,
        printAgentKey: result?.printAgentKey,
      });
      setForm(EMPTY_FORM);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    const next = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await setTenantStatus(tenant.id, next);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (tenant) => {
    if (!window.confirm(`Soft-delete "${tenant.slug}"? It will resolve as 404 but can be restored.`)) return;
    setError('');
    setBusyId(tenant.id);
    try {
      await deleteTenant(tenant.id);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to delete tenant');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      await setTenantStatus(tenant.id, 'ACTIVE');
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to restore tenant');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (tenant) => {
    setEditId(tenant.id);
    setEditForm({ name: tenant.name || '', plan: tenant.plan || '' });
  };

  const saveEdit = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      await updateTenant(tenant.id, { name: editForm.name.trim(), plan: editForm.plan.trim() });
      setEditId(null);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to update tenant');
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      const result = await regenerateTokens(tenant.id);
      setRevealed({
        title: `New tokens for ${tenant.slug}`,
        reportingToken: result?.reportingToken,
        printAgentKey: result?.printAgentKey,
      });
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to regenerate tokens');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-console-section tenants-section">
      <h2>Tenants</h2>

      {error && <div className="tenant-error" role="alert">{error}</div>}

      {revealed && (
        <div className="tenant-token-panel" role="alert">
          <button type="button" className="tenant-token-dismiss" onClick={() => setRevealed(null)} aria-label="Dismiss tokens">
            <X size={16} />
          </button>
          <div className="tenant-token-warning">
            <AlertTriangle size={18} />
            <strong>Copy these now — they will not be shown again.</strong>
          </div>
          <p className="tenant-token-title">{revealed.title}</p>
          <div className="tenant-token-row">
            <label>Reporting token</label>
            <code className="tenant-token-value">{revealed.reportingToken}</code>
            <CopyButton value={revealed.reportingToken} />
          </div>
          <div className="tenant-token-row">
            <label>Print agent key</label>
            <code className="tenant-token-value">{revealed.printAgentKey}</code>
            <CopyButton value={revealed.printAgentKey} />
          </div>
        </div>
      )}

      <form className="tenant-create-form" onSubmit={handleCreate}>
        <h3>Create tenant</h3>
        <div className="tenant-form-grid">
          <div className="form-group">
            <label htmlFor="tenant-slug">Slug</label>
            <input id="tenant-slug" type="text" value={form.slug} onChange={handleField('slug')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-name">Name</label>
            <input id="tenant-name" type="text" value={form.name} onChange={handleField('name')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-plan">Plan (optional)</label>
            <input id="tenant-plan" type="text" value={form.plan} onChange={handleField('plan')} />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-admin-username">Admin username</label>
            <input id="tenant-admin-username" type="text" value={form.adminUsername} onChange={handleField('adminUsername')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-admin-password">Admin password</label>
            <input id="tenant-admin-password" type="password" value={form.adminPassword} onChange={handleField('adminPassword')} required />
          </div>
        </div>
        <button type="submit" className="save-btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create tenant'}
        </button>
      </form>

      <div className="tenant-toolbar">
        <label htmlFor="tenant-status-filter">Filter by status</label>
        <select id="tenant-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="tenant-table-wrap">
        {isLoading ? (
          <p className="admin-console-loading">Loading tenants…</p>
        ) : tenants.length === 0 ? (
          <p className="tenant-empty">No tenants yet.</p>
        ) : (
          <table className="tenant-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Name</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Tokens</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isDeleted = t.status === 'DELETED';
                const isEditing = editId === t.id;
                return (
                  <tr key={t.id}>
                    <td>{t.slug}</td>
                    <td>
                      {isEditing ? (
                        <input type="text" aria-label="Edit name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      ) : (
                        t.name
                      )}
                    </td>
                    <td>
                      <span className={`tenant-badge tenant-badge-${(t.status || '').toLowerCase()}`}>{t.status}</span>
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="text" aria-label="Edit plan" value={editForm.plan} onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))} />
                      ) : (
                        t.plan || '—'
                      )}
                    </td>
                    <td>
                      <span className="tenant-token-presence">
                        {t.hasReportingToken ? 'Reporting ✓' : 'Reporting ✗'}
                        {' · '}
                        {t.hasPrintKey ? 'Print ✓' : 'Print ✗'}
                      </span>
                    </td>
                    <td className="tenant-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="save-btn" onClick={() => saveEdit(t)} disabled={busyId === t.id}>Save</button>
                          <button type="button" className="save-btn save-btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          {isDeleted ? (
                            <button type="button" className="save-btn save-btn-ghost" onClick={() => handleRestore(t)} disabled={busyId === t.id}>Restore</button>
                          ) : (
                            <>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => startEdit(t)} disabled={busyId === t.id}>Edit</button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleToggleStatus(t)} disabled={busyId === t.id}>
                                {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleRegenerate(t)} disabled={busyId === t.id}>Regenerate tokens</button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleDelete(t)} disabled={busyId === t.id}>Delete</button>
                            </>
                          )}
                          <button type="button" className="save-btn save-btn-ghost" onClick={() => navigate(`/admin/activity?tenant=${t.id}`)} aria-label={`Activity for ${t.slug}`}>
                            <Activity size={14} />
                            <span>Activity</span>
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
