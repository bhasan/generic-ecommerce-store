import React, { useState, useMemo, useEffect } from 'react';
import { Crown, Users, Package, Check, X, Loader, Search } from 'lucide-react';
import LoadingState from '../../../components/common/LoadingState';

// Pure helper — outside component so it's never recreated on re-render
const isUserVip = (user) =>
  user.roles && user.roles.some((r) => (typeof r === 'string' ? r : r.name) === 'VIP');

function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function VIPManagementSection({
  isLoading,
  users,
  products,
  onToggleVipUser,
  onToggleVipProduct,
}) {
  const [userSaving, setUserSaving] = useState(null);
  const [productSaving, setProductSaving] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const debouncedUserSearch = useDebounce(userSearch);
  const debouncedProductSearch = useDebounce(productSearch);

  const customers = useMemo(
    () =>
      (users || []).filter(
        (u) => u.roles && u.roles.some((r) => (typeof r === 'string' ? r : r.name) === 'CUSTOMER')
      ),
    [users]
  );

  const { filteredCustomers, vipUserCount } = useMemo(() => {
    const query = debouncedUserSearch.toLowerCase().trim();
    const filtered = query
      ? customers.filter((u) => u.username.toLowerCase().includes(query))
      : customers;
    return { filteredCustomers: filtered, vipUserCount: customers.filter(isUserVip).length };
  }, [customers, debouncedUserSearch]);

  const { filteredProducts, vipProductCount } = useMemo(() => {
    const all = products || [];
    const query = debouncedProductSearch.toLowerCase().trim();
    const filtered = query
      ? all.filter((p) => p.name.toLowerCase().includes(query))
      : all;
    return { filteredProducts: filtered, vipProductCount: all.filter((p) => p.vipOnly).length };
  }, [products, debouncedProductSearch]);

  const handleToggleUser = async (user) => {
    setUserSaving(user.id);
    try {
      await onToggleVipUser(user);
    } finally {
      setUserSaving(null);
    }
  };

  const handleToggleProduct = async (product) => {
    setProductSaving(product.id);
    try {
      await onToggleVipProduct(product);
    } finally {
      setProductSaving(null);
    }
  };

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header">
        <h3 className="section-title">
          <Crown size={24} />
          VIP Management
        </h3>
        <p className="section-subtitle">
          Grant VIP access to customers and mark products as VIP-only.
        </p>
      </div>

      {isLoading ? (
        <LoadingState message="Loading VIP data..." />
      ) : (
        <div className="vip-management-grid">

          {/* VIP Customers Panel */}
          <div className="vip-panel">
            <div className="vip-panel-header">
              <Users size={18} />
              <span>VIP Customers</span>
              <span className="vip-panel-count">
                {vipUserCount} / {customers.length}
              </span>
            </div>

            <div className="vip-search-wrap">
              <Search size={14} className="vip-search-icon" />
              <input
                type="text"
                className="vip-search-input"
                placeholder="Search customers..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            {customers.length === 0 ? (
              <div className="vip-empty">No approved customers found.</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="vip-empty">No customers match "{userSearch}".</div>
            ) : (
              <ul className="vip-list">
                {filteredCustomers.map((user) => {
                  const vip = isUserVip(user);
                  const saving = userSaving === user.id;
                  return (
                    <li key={user.id} className={`vip-list-item ${vip ? 'vip-active' : ''}`}>
                      <div className="vip-item-info">
                        <span className="vip-item-name">{user.username}</span>
                        {vip && (
                          <span className="vip-badge">
                            <Crown size={12} />
                            VIP
                          </span>
                        )}
                      </div>
                      <button
                        className={`vip-toggle-btn ${vip ? 'vip-toggle-remove' : 'vip-toggle-add'}`}
                        onClick={() => handleToggleUser(user)}
                        disabled={saving}
                        title={vip ? 'Remove VIP access' : 'Grant VIP access'}
                      >
                        {saving ? (
                          <Loader size={14} className="spin" />
                        ) : vip ? (
                          <><X size={14} /><span>Remove</span></>
                        ) : (
                          <><Check size={14} /><span>Grant VIP</span></>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* VIP Products Panel */}
          <div className="vip-panel">
            <div className="vip-panel-header">
              <Package size={18} />
              <span>VIP Products</span>
              <span className="vip-panel-count">
                {vipProductCount} / {(products || []).length}
              </span>
            </div>

            <div className="vip-search-wrap">
              <Search size={14} className="vip-search-icon" />
              <input
                type="text"
                className="vip-search-input"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            {!products || products.length === 0 ? (
              <div className="vip-empty">No products found.</div>
            ) : filteredProducts.length === 0 ? (
              <div className="vip-empty">No products match "{productSearch}".</div>
            ) : (
              <ul className="vip-list">
                {filteredProducts.map((product) => {
                  const vip = product.vipOnly;
                  const saving = productSaving === product.id;
                  return (
                    <li key={product.id} className={`vip-list-item ${vip ? 'vip-active' : ''}`}>
                      <div className="vip-item-info">
                        <span className="vip-item-name">{product.name}</span>
                        {vip && (
                          <span className="vip-badge">
                            <Crown size={12} />
                            VIP Only
                          </span>
                        )}
                      </div>
                      <button
                        className={`vip-toggle-btn ${vip ? 'vip-toggle-remove' : 'vip-toggle-add'}`}
                        onClick={() => handleToggleProduct(product)}
                        disabled={saving}
                        title={vip ? 'Remove VIP-only status' : 'Make VIP-only'}
                      >
                        {saving ? (
                          <Loader size={14} className="spin" />
                        ) : vip ? (
                          <><X size={14} /><span>Remove</span></>
                        ) : (
                          <><Crown size={14} /><span>Make VIP</span></>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default VIPManagementSection;
