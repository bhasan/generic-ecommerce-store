import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTenantAudit } from '../../../services/tenantApi';

const ACTIONS = [
  '', 'TENANT_CREATED', 'TENANT_UPDATED', 'TENANT_SUSPENDED',
  'TENANT_RESTORED', 'TENANT_DELETED', 'TENANT_TOKENS_REGENERATED',
];

function describeDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  if ('from' in detail && 'to' in detail) return `${detail.from} → ${detail.to}`;
  if ('plan' in detail || 'name' in detail) {
    return [detail.name && `name: ${detail.name}`, detail.plan && `plan: ${detail.plan}`].filter(Boolean).join(', ');
  }
  return '';
}

export default function AdminActivitySection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantParam = searchParams.get('tenant') || undefined;
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');

  const loadActivity = async (tId, act, signal) => {
    setIsLoading(true);
    try {
      const data = await getTenantAudit({ tenantId: tId, action: act || undefined });
      if (!signal.aborted) { setRows(Array.isArray(data) ? data : []); setError(''); }
    } catch (err) {
      if (!signal.aborted) setError(err.message || 'Failed to load activity');
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadActivity(tenantParam, action, controller.signal);
    return () => controller.abort();
  }, [tenantParam, action]);

  return (
    <div className="admin-console-section">
      <h2>Activity</h2>
      {error && <div className="tenant-error" role="alert">{error}</div>}

      <div className="tenant-toolbar">
        <label htmlFor="activity-action-filter">Action</label>
        <select id="activity-action-filter" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a || 'All actions'}</option>)}
        </select>
        {tenantParam && (
          <button type="button" className="save-btn save-btn-ghost" onClick={() => setSearchParams({})}>
            Clear tenant filter (#{tenantParam})
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="admin-console-loading">Loading activity…</p>
      ) : rows.length === 0 ? (
        <p className="tenant-empty">No activity yet.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Tenant</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.actorUsername}</td>
                <td className="activity-action">{r.action}</td>
                <td>#{r.targetTenantId}</td>
                <td className="activity-detail">{describeDetail(r.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
