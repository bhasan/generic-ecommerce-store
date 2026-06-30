import { useState, useEffect } from 'react';
import { Copy, X, AlertTriangle } from 'lucide-react';
import {
  listTenants,
  createTenant,
  setTenantStatus,
  regenerateTokens,
} from '../../../services/tenantApi';

// TEMPORARY: tenant management lives in website-management and is ADMIN-gated;
// it will move to a dedicated super-admin portal later.

const EMPTY_FORM = { slug: '', name: '', plan: '', adminUsername: '', adminPassword: '' };

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

export default function WebsiteTenantsSection() {
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  // Holds plaintext tokens to display ONCE after create / regenerate.
  const [revealed, setRevealed] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadTenants = async () => {
    setIsLoading(true);
    try {
      const data = await listTenants();
      setTenants(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load tenants');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

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
    <div className="website-mgmt-section tenants-section">
      <h2>Tenants</h2>

      {error && (
        <div className="tenant-error" role="alert">{error}</div>
      )}

      {revealed && (
        <div className="tenant-token-panel" role="alert">
          <button
            type="button"
            className="tenant-token-dismiss"
            onClick={() => setRevealed(null)}
            aria-label="Dismiss tokens"
          >
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
            <input
              id="tenant-admin-password"
              type="password"
              value={form.adminPassword}
              onChange={handleField('adminPassword')}
              required
            />
          </div>
        </div>
        <button type="submit" className="save-btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create tenant'}
        </button>
      </form>

      <div className="tenant-table-wrap">
        {isLoading ? (
          <p className="website-mgmt-loading">Loading tenants…</p>
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
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.slug}</td>
                  <td>{t.name}</td>
                  <td>
                    <span className={`tenant-badge tenant-badge-${(t.status || '').toLowerCase()}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.plan || '—'}</td>
                  <td>
                    <span className="tenant-token-presence">
                      {t.hasReportingToken ? 'Reporting ✓' : 'Reporting ✗'}
                      {' · '}
                      {t.hasPrintKey ? 'Print ✓' : 'Print ✗'}
                    </span>
                  </td>
                  <td className="tenant-actions">
                    <button
                      type="button"
                      className="save-btn save-btn-ghost"
                      onClick={() => handleToggleStatus(t)}
                      disabled={busyId === t.id}
                    >
                      {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      className="save-btn save-btn-ghost"
                      onClick={() => handleRegenerate(t)}
                      disabled={busyId === t.id}
                    >
                      Regenerate tokens
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
